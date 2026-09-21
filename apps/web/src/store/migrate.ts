import { DEFAULT_AVG_GAME_MINUTES, EMPTY_STATS } from '@/rotation/engine'
import type { SessionState } from '@/rotation/types'

/**
 * Bump whenever the persisted session shape changes, and extend migrateSession. Version 6 added the
 * session's identity (id, start time, all-time totals already counted) beside the session; that lives
 * in the store's own migrate, not in SessionState. Version 7 added scores and time played to each
 * player's stats.
 */
export const SESSION_STORE_VERSION = 7

/** Upgrade a session saved by an older build to the current shape. */
export function migrateSession(
  session: SessionState | null,
  fromVersion: number,
): SessionState | null {
  if (!session) return null
  let next = session
  if (fromVersion < 2) next = { ...next, avgGameMinutes: DEFAULT_AVG_GAME_MINUTES }
  if (fromVersion < 3) next = { ...next, matchmaking: 'balanced', partners: [], lastResult: {} }
  if (fromVersion < 4) next = { ...next, stats: {} }
  // Courts gained editable names; existing ones keep the "Court N" they were always shown as.
  if (fromVersion < 5) {
    next = {
      ...next,
      courts: next.courts.map((court) => ({ ...court, name: court.name ?? `Court ${court.id}` })),
    }
  }
  // Stats gained points and time played. Games already played had neither: zeros, and no scored games.
  if (fromVersion < 7) {
    next = {
      ...next,
      stats: Object.fromEntries(
        Object.entries(next.stats).map(([id, stats]) => [id, { ...EMPTY_STATS, ...stats }]),
      ),
    }
  }
  return next
}
