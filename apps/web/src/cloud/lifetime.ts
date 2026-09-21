import { lifetimeDelta, type LifetimeCounts } from '@/rotation/lifetime'
import type { SessionState } from '@/rotation/types'
import type { LifetimePlayer } from './api'

/**
 * This session's per-player totals, in the shape the club leaderboard upload expects. Pass what
 * an earlier upload already added (a session that was resumed) and only the new games are sent.
 */
export function toLifetimePlayers(session: SessionState, counted: LifetimeCounts = {}): LifetimePlayer[] {
  return Object.entries(lifetimeDelta(session, counted)).map(([id, delta]) => ({
    name: session.players[Number(id)].name,
    games: delta.games,
    wins: delta.wins,
    losses: delta.losses,
  }))
}
