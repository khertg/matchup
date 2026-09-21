import type { SessionState } from './types'

/** Games, wins and losses per player id, as added to the all-time totals. */
export type LifetimeCounts = Record<number, { games: number; wins: number; losses: number }>

/** What this session's stats hold, in the same shape. Players with no finished game are left out. */
export function lifetimeTotals(session: SessionState): LifetimeCounts {
  const totals: LifetimeCounts = {}
  for (const [idText, s] of Object.entries(session.stats)) {
    if (s.games > 0) totals[Number(idText)] = { games: s.games, wins: s.wins, losses: s.losses }
  }
  return totals
}

/**
 * What is still to be added to the all-time totals: this session's stats minus what an
 * earlier save already added. A session that was saved, resumed and played on therefore
 * only adds the new games. Players with nothing new are left out.
 */
export function lifetimeDelta(session: SessionState, counted: LifetimeCounts): LifetimeCounts {
  const delta: LifetimeCounts = {}
  for (const [idText, now] of Object.entries(lifetimeTotals(session))) {
    const id = Number(idText)
    const before = counted[id] ?? { games: 0, wins: 0, losses: 0 }
    const next = {
      games: Math.max(0, now.games - before.games),
      wins: Math.max(0, now.wins - before.wins),
      losses: Math.max(0, now.losses - before.losses),
    }
    if (next.games > 0) delta[id] = next
  }
  return delta
}
