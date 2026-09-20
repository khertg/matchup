import { DEFAULT_AVG_GAME_MINUTES } from '@/rotation/engine'
import type { SessionState } from '@/rotation/types'

/** Bump whenever the persisted session shape changes, and extend migrateSession. */
export const SESSION_STORE_VERSION = 3

/** Upgrade a session saved by an older build to the current shape. */
export function migrateSession(
  session: SessionState | null,
  fromVersion: number,
): SessionState | null {
  if (!session) return null
  let next = session
  if (fromVersion < 2) next = { ...next, avgGameMinutes: DEFAULT_AVG_GAME_MINUTES }
  if (fromVersion < 3) next = { ...next, matchmaking: 'balanced', partners: [], lastResult: {} }
  return next
}
