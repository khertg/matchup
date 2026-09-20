import type { SessionState } from '@/rotation/types'
import type { LifetimePlayer } from './api'

/** This session's per-player totals, in the shape the club leaderboard upload expects. */
export function toLifetimePlayers(session: SessionState): LifetimePlayer[] {
  return Object.entries(session.stats)
    .filter(([, stats]) => stats.games > 0)
    .map(([id, stats]) => ({
      name: session.players[Number(id)].name,
      games: stats.games,
      wins: stats.wins,
      losses: stats.losses,
    }))
}
