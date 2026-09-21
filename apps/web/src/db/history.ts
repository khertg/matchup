import type { GameMode, MatchmakingMode, SessionState } from '@/rotation/types'
import type { LifetimeCounts } from '@/rotation/lifetime'
import { SESSION_STORE_VERSION } from '@/store/migrate'
import { db } from './db'

/** How many ended sessions are kept on this device. */
export const MAX_HISTORY = 100

/** A session as it stood when it ended, so it can be looked at or resumed. */
export interface HistoryRecord {
  /** The session's id; ending a resumed session updates its record instead of adding one. */
  id: string
  location: string
  startedAt: number
  endedAt: number
  mode: GameMode
  matchmaking: MatchmakingMode
  /** Players who took part. */
  players: number
  /** Games finished. */
  games: number
  session: SessionState
  /** The session shape `session` is in, so a later version of the app can upgrade it on resume. */
  storeVersion: number
  /** What this session had added to the all-time totals when it ended. */
  lifetimeCounted: LifetimeCounts
  /** Whether the club cloud has this version. Stays true on devices that never sign in. */
  synced: boolean
}

export type HistorySummary = Omit<HistoryRecord, 'session' | 'storeVersion' | 'lifetimeCounted'>

export function summarize(session: SessionState) {
  const games = Object.values(session.stats).reduce((sum, s) => sum + s.games, 0)
  // Every player is counted in a game once per side, so a doubles game is four player-games.
  const perGame = session.mode === 'doubles' ? 4 : 2
  return { players: Object.keys(session.players).length, games: Math.round(games / perGame) }
}

/**
 * Save a session that has ended. Returns null, saving nothing, when nobody ever checked in.
 * Saving the same id again replaces the earlier record.
 */
export async function archiveSession(input: {
  id: string
  location: string
  startedAt: number
  session: SessionState
  lifetimeCounted: LifetimeCounts
  now?: number
}): Promise<HistoryRecord | null> {
  const { session } = input
  if (Object.keys(session.players).length === 0) return null
  const record: HistoryRecord = {
    id: input.id,
    location: input.location,
    startedAt: input.startedAt,
    endedAt: input.now ?? Date.now(),
    mode: session.mode,
    matchmaking: session.matchmaking,
    ...summarize(session),
    session,
    storeVersion: SESSION_STORE_VERSION,
    lifetimeCounted: input.lifetimeCounted,
    synced: false,
  }
  await db.transaction('rw', db.history, async () => {
    await db.history.put(record)
    const surplus = (await db.history.count()) - MAX_HISTORY
    if (surplus > 0) {
      const oldest = await db.history.orderBy('endedAt').limit(surplus).primaryKeys()
      await db.history.bulkDelete(oldest)
    }
  })
  return record
}

/** Newest first. Without the session itself, so a long list stays light. */
export async function listHistory(): Promise<HistorySummary[]> {
  const records = await db.history.orderBy('endedAt').reverse().toArray()
  return records.map(({ session: _s, storeVersion: _v, lifetimeCounted: _c, ...summary }) => summary)
}

export const getHistory = (id: string) => db.history.get(id)

export const deleteHistory = (id: string) => db.history.delete(id)

export async function markHistorySynced(id: string): Promise<void> {
  await db.history.update(id, { synced: true })
}

export const unsyncedHistory = () => db.history.filter((r) => !r.synced).toArray()
