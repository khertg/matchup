const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface BuildInfo {
  /** The release number, from the root package.json. */
  version: string
  /** The short git commit the build came from, or `dev` when it is not known. */
  commit: string
  /** The build date as YYYY-MM-DD. */
  date: string
}

/** 2026-09-21 as "21 Sep 2026", read as plain text so the time zone can never move the day. */
export function formatBuildDate(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return null
  const month = MONTHS[Number(match[2]) - 1]
  return month ? `${Number(match[3])} ${month} ${match[1]}` : null
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
