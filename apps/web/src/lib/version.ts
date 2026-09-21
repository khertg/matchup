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
function formatDate(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return null
  const month = MONTHS[Number(match[2]) - 1]
  return month ? `${Number(match[3])} ${month} ${match[1]}` : null
}

/** "v0.1.0 · a1b2c3d · 21 Sep 2026", or just "v0.1.0 · dev" for a build with no known commit. */
export function formatVersion({ version, commit, date }: BuildInfo): string {
  const parts = [`v${version}`]
  if (!commit || commit === 'dev') return [...parts, 'dev'].join(' · ')
  parts.push(commit)
  const day = formatDate(date)
  if (day) parts.push(day)
  return parts.join(' · ')
}

/** The build this app was made from. */
export const appBuild: BuildInfo = {
  version: __APP_VERSION__,
  commit: __APP_COMMIT__,
  date: __APP_BUILD_DATE__,
}

export const appVersion = formatVersion(appBuild)
