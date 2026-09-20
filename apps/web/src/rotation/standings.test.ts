import { describe, expect, it } from 'vitest'
import type { Player } from '@/db/db'
import { assignCourts, checkIn, createSession, recordResult } from './engine'
import { rankLifetime, rankPlayers } from './standings'
import type { PlayerStats, RosterPlayer, SessionState } from './types'

const player = (id: number, name: string, skill: RosterPlayer['skill'] = 3): RosterPlayer => ({
  id,
  name,
  skill,
})

/** A session whose players and stats are set directly, to test ranking rules in isolation. */
function withStats(rows: [id: number, name: string, stats: Partial<PlayerStats>][]): SessionState {
  let s = createSession('doubles', 1)
  for (const [id, name] of rows) s = checkIn(s, player(id, name))
  const stats: SessionState['stats'] = {}
  for (const [id, , partial] of rows) {
    stats[id] = { games: 0, wins: 0, losses: 0, opponentSkill: 0, ...partial }
  }
  return { ...s, stats }
}

describe('stats tracking', () => {
  it('counts a game for everyone and credits the opposing team strength', () => {
    let s = createSession('doubles', 1)
    s = checkIn(s, player(1, 'A', 6))
    s = checkIn(s, player(2, 'B', 2))
    s = checkIn(s, player(3, 'C', 4))
    s = checkIn(s, player(4, 'D', 2))
    s = assignCourts(s)
    const { state, winners, losers } = recordResult(s, 1, 0)

    for (const id of winners) expect(state.stats[id]).toMatchObject({ games: 1, wins: 1, losses: 0 })
    for (const id of losers) expect(state.stats[id]).toMatchObject({ games: 1, wins: 0, losses: 1 })

    const avg = (ids: number[]) => ids.reduce((sum, id) => sum + s.players[id].skill, 0) / ids.length
    expect(state.stats[winners[0]].opponentSkill).toBeCloseTo(avg(losers))
    expect(state.stats[losers[0]].opponentSkill).toBeCloseTo(avg(winners))
  })

  it('accumulates over several games and does not mutate the previous state', () => {
    let s = createSession('singles', 1)
    s = checkIn(s, player(1, 'A'))
    s = checkIn(s, player(2, 'B'))
    s = assignCourts(s)
    const first = recordResult(s, 1, 0)
    const before = structuredClone(first.state)
    const second = recordResult(assignCourts(first.state), 1, 0)

    expect(first.state).toEqual(before)
    const total = second.state.stats[1].games + second.state.stats[2].games
    expect(total).toBe(4)
    expect(second.state.stats[1].wins + second.state.stats[2].wins).toBe(2)
  })
})

describe('rankPlayers', () => {
  it('ranks by wins first', () => {
    const s = withStats([
      [1, 'Ann', { games: 4, wins: 1, losses: 3, opponentSkill: 12 }],
      [2, 'Bob', { games: 4, wins: 3, losses: 1, opponentSkill: 12 }],
    ])
    expect(rankPlayers(s).map((r) => r.name)).toEqual(['Bob', 'Ann'])
  })

  it('breaks a wins tie by the strength of opponents faced', () => {
    const s = withStats([
      [1, 'Ann', { games: 2, wins: 2, opponentSkill: 6 }], // avg opponent 3
      [2, 'Bob', { games: 2, wins: 2, opponentSkill: 10 }], // avg opponent 5
    ])
    expect(rankPlayers(s).map((r) => r.name)).toEqual(['Bob', 'Ann'])
  })

  it('then breaks a tie by win rate', () => {
    const s = withStats([
      [1, 'Ann', { games: 4, wins: 2, losses: 2, opponentSkill: 12 }],
      [2, 'Bob', { games: 3, wins: 2, losses: 1, opponentSkill: 9 }],
    ])
    expect(rankPlayers(s).map((r) => r.name)).toEqual(['Bob', 'Ann'])
  })

  it('gives players level on every criterion the same rank and medal', () => {
    const s = withStats([
      [1, 'Ann', { games: 2, wins: 2, opponentSkill: 6 }],
      [2, 'Bob', { games: 2, wins: 2, opponentSkill: 6 }],
      [3, 'Cy', { games: 2, wins: 1, losses: 1, opponentSkill: 6 }],
    ])
    const ranked = rankPlayers(s)
    expect(ranked.map((r) => [r.name, r.rank, r.medal])).toEqual([
      ['Ann', 1, 'gold'],
      ['Bob', 1, 'gold'],
      ['Cy', 3, 'bronze'],
    ])
  })

  it('awards medals only to the top three ranks', () => {
    const s = withStats([
      [1, 'A', { games: 4, wins: 4, opponentSkill: 12 }],
      [2, 'B', { games: 4, wins: 3, losses: 1, opponentSkill: 12 }],
      [3, 'C', { games: 4, wins: 2, losses: 2, opponentSkill: 12 }],
      [4, 'D', { games: 4, wins: 1, losses: 3, opponentSkill: 12 }],
    ])
    expect(rankPlayers(s).map((r) => r.medal)).toEqual(['gold', 'silver', 'bronze', null])
  })

  it('leaves out players who have not finished a game', () => {
    const s = withStats([
      [1, 'Ann', { games: 1, wins: 1, opponentSkill: 3 }],
      [2, 'Bob', {}],
    ])
    expect(rankPlayers(s).map((r) => r.name)).toEqual(['Ann'])
  })

  it('reports win rate and average opponent skill', () => {
    const s = withStats([[1, 'Ann', { games: 4, wins: 3, losses: 1, opponentSkill: 14 }]])
    expect(rankPlayers(s)[0]).toMatchObject({ winRate: 0.75, avgOpponentSkill: 3.5 })
  })
})

describe('rankLifetime', () => {
  const roster: Player[] = [
    { id: 1, name: 'Ann', skill: 3, games: 10, wins: 7, losses: 3 },
    { id: 2, name: 'Bob', skill: 3, games: 20, wins: 7, losses: 13 },
    { id: 3, name: 'Cy', skill: 3, games: 2, wins: 2, losses: 0 },
    { id: 4, name: 'Dee', skill: 3 },
  ]

  it('hides players below the minimum number of games', () => {
    expect(rankLifetime(roster, 5).map((r) => r.name)).toEqual(['Ann', 'Bob'])
    expect(rankLifetime(roster, 1).map((r) => r.name)).toEqual(['Ann', 'Bob', 'Cy'])
  })

  it('ranks by wins, then win rate', () => {
    expect(rankLifetime(roster, 1).map((r) => [r.name, r.rank])).toEqual([
      ['Ann', 1],
      ['Bob', 2],
      ['Cy', 3],
    ])
  })

  it('never includes players with no games, even at a minimum of 0', () => {
    expect(rankLifetime(roster, 0).map((r) => r.name)).not.toContain('Dee')
  })
})
