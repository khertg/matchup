import { describe, expect, it } from 'vitest'
import { checkIn, createSession } from './engine'
import { repeatStats } from './repeats'
import type { GameMode, MatchRecord, SessionState, Teams } from './types'

function session(count: number, mode: GameMode = 'doubles'): SessionState {
  let s = createSession(mode, 1)
  for (let id = 1; id <= count; id++) s = checkIn(s, { id, name: `P${id}`, skill: 3 })
  return s
}

const game = (...teams: Teams): MatchRecord => ({ courtName: 'Court 1', teams, winner: 0, seconds: 0 })
const withGames = (s: SessionState, ...games: MatchRecord[]): SessionState => ({ ...s, matches: games })

describe('repeatStats', () => {
  it('has nothing to report before the first game, or for a session saved before games were kept', () => {
    const empty = repeatStats(session(4))
    expect(empty.players).toEqual([])
    expect(empty.summary).toMatchObject({ games: 0, partnerships: 0, repeatedPartnerships: 0, opponentPairings: 0 })
    expect(empty.summary.topPartnership).toBeUndefined()

    const older = { ...session(4) } as Partial<SessionState> as SessionState
    delete older.matches
    expect(repeatStats(older).summary.games).toBe(0)
  })

  it('counts partnerships and opponent pairings, and which of them repeated', () => {
    // 1+2 v 3+4, then 1+2 v 3+5 (1+2 teamed up again; 1, 2 and 3 met again), then 1+3 v 2+4.
    const stats = repeatStats(withGames(session(5), game([1, 2], [3, 4]), game([1, 2], [3, 5]), game([1, 3], [2, 4])))
    const { summary } = stats
    expect(summary.games).toBe(3)
    expect(summary.partnerships).toBe(6)
    expect(summary.differentPartnerships).toBe(5) // 1+2 twice, the other four once
    expect(summary.repeatedPartnerships).toBe(1)
    expect(summary.opponentPairings).toBe(12)
    // Opposing pairs: g1 has 1-3, 1-4, 2-3, 2-4; g2 has 1-3, 1-5, 2-3, 2-5; g3 has 1-2, 1-4, 3-2, 3-4.
    // Different ones: 1-3, 1-4, 2-3, 2-4, 1-5, 2-5, 1-2, 3-4 (8); so 4 are repeats.
    expect(summary.differentOpponentPairings).toBe(8)
    expect(summary.repeatedOpponentPairings).toBe(4)
    expect(summary.topPartnership).toEqual({ a: 1, b: 2, count: 2 })
  })

  it('lists each player\'s partners and opponents, most repeated first', () => {
    const stats = repeatStats(withGames(session(5), game([1, 2], [3, 4]), game([1, 2], [3, 5])))
    const one = stats.players.find((p) => p.id === 1)!
    expect(one.games).toBe(2)
    expect(one.partners).toEqual([{ id: 2, count: 2 }])
    // Faced 3 twice, and 4 and 5 once each (P4 before P5 by name).
    expect(one.opponents).toEqual([
      { id: 3, count: 2 },
      { id: 4, count: 1 },
      { id: 5, count: 1 },
    ])
    const five = stats.players.find((p) => p.id === 5)!
    expect(five.games).toBe(1)
    expect(five.partners).toEqual([{ id: 3, count: 1 }])
  })

  it('puts the players with the most repeats first, then by name', () => {
    const stats = repeatStats(withGames(session(6), game([1, 2], [3, 4]), game([1, 2], [3, 5]), game([5, 6], [4, 3])))
    const order = stats.players.map((p) => p.name)
    // 1, 2, 3 and 4 repeated something (P3 and P4 faced each other twice, 1 and 2 teamed up twice).
    expect(order.slice(0, 4)).toEqual(['P1', 'P2', 'P3', 'P4'])
    expect(new Set(order)).toEqual(new Set(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']))
  })

  it('finds no repeated partnership when four players rotate through all three splits', () => {
    const s = withGames(session(4), game([1, 2], [3, 4]), game([1, 3], [2, 4]), game([1, 4], [2, 3]))
    const { summary } = repeatStats(s)
    expect(summary.games).toBe(3)
    expect(summary.partnerships).toBe(6)
    expect(summary.differentPartnerships).toBe(6)
    expect(summary.repeatedPartnerships).toBe(0)
    expect(summary.topPartnership).toBeUndefined()
    // Four players face each other all the time: each of the six pairs meets twice in three games.
    expect(summary.opponentPairings).toBe(12)
    expect(summary.differentOpponentPairings).toBe(6)
    expect(summary.topMatchup?.count).toBe(2)
  })

  it('has no partnerships in singles, only opponents', () => {
    const stats = repeatStats(withGames(session(3, 'singles'), game([1], [2]), game([1], [3]), game([2], [1])))
    expect(stats.summary.partnerships).toBe(0)
    expect(stats.summary.opponentPairings).toBe(3)
    expect(stats.summary.differentOpponentPairings).toBe(2)
    expect(stats.summary.repeatedOpponentPairings).toBe(1)
    expect(stats.summary.topMatchup).toEqual({ a: 1, b: 2, count: 2 })
    expect(stats.players.every((p) => p.partners.length === 0)).toBe(true)
  })

  it('still counts a player who is no longer in the session, as "Unknown"', () => {
    const s = withGames(session(3), game([1, 2], [3, 9]))
    const gone = repeatStats(s).players.find((p) => p.id === 9)!
    expect(gone.name).toBe('Unknown')
    expect(gone.partners).toEqual([{ id: 3, count: 1 }])
  })
})
