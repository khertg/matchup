const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface BuildInfo {
  /** The release number, from the root package.json. */
  version: string
  /** The short git commit the build came from, or `dev` when it is not known. */
  commit: string
  /** When the build was made, as an ISO time in UTC (older builds: just the day, YYYY-MM-DD). */
  date: string
}

const day = (year: number, month: number, date: number) => {
  const name = MONTHS[month - 1]
  return name ? `${date} ${name} ${year}` : null
}

/**
 * The build time as the viewer reads it: "21 Sep 2026, 2:05 PM" in their own time zone. A bare day
 * ("2026-09-21") is read as plain text, so the time zone can never move it, and has no time.
 */
export function formatBuildDate(iso: string): string | null {
  const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (dayOnly) return day(Number(dayOnly[1]), Number(dayOnly[2]), Number(dayOnly[3]))
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const hours = at.getHours()
  const time = `${hours % 12 || 12}:${String(at.getMinutes()).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`
  return `${day(at.getFullYear(), at.getMonth() + 1, at.getDate())}, ${time}`
}

/** The label itself: just the release, "v0.1.0". The commit and date are in `buildDetails`. */
export function formatVersion({ version }: BuildInfo): string {
  return `v${version}`
}

/**
 * What the version popover lists: the commit and the build day ("21 Sep 2026", or null
 * rather than a broken date), or null for a build with no known commit, shown as "dev".
 */
export function buildDetails({ commit, date }: BuildInfo): { commit: string; date: string | null } | null {
  if (!commit || commit === 'dev') return null
  return { commit, date: formatBuildDate(date) }
}

/** The build this app was made from. */
export const appBuild: BuildInfo = {
  version: __APP_VERSION__,
  commit: __APP_COMMIT__,
  date: __APP_BUILD_DATE__,
}

export const appVersion = formatVersion(appBuild)
