import { describe, expect, it } from 'vitest'
import type { Player } from '@/db/db'
import { checkIn, createSession, EMPTY_STATS, recordResult, recordScore, startGame } from './engine'
import { fillCourts } from './testing'
import { pageStandings, podium, rankLifetime, rankPlayers, type Standing } from './standings'
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
    stats[id] = { ...EMPTY_STATS, ...partial }
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
    s = fillCourts(s)
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
    s = fillCourts(s)
    const first = recordResult(s, 1, 0)
    const before = structuredClone(first.state)
    const second = recordResult(fillCourts(first.state), 1, 0)

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

  describe('point differential', () => {
    const scored = (pointsFor: number, pointsAgainst: number, extra: Partial<PlayerStats> = {}) => ({
      games: 2,
      wins: 2,
      opponentSkill: 6,
      pointsFor,
      pointsAgainst,
      scoredGames: 2,
      ...extra,
    })

    it('breaks a tie on wins, ahead of opponent strength and win rate', () => {
      const s = withStats([
        // Ann has the stronger opponents and the better win rate, but Bob's margin decides.
        [1, 'Ann', scored(22, 20, { games: 2, opponentSkill: 10 })],
        [2, 'Bob', scored(22, 10, { games: 3, opponentSkill: 6 })],
      ])
      const ranked = rankPlayers(s)
      expect(ranked.map((r) => r.name)).toEqual(['Bob', 'Ann'])
      expect(ranked.map((r) => r.diff)).toEqual([12, 2])
    })

    it('never outranks more wins', () => {
      const s = withStats([
        [1, 'Ann', scored(30, 5, { wins: 2, games: 2 })],
        [2, 'Bob', scored(22, 20, { wins: 3, games: 3, scoredGames: 3 })],
      ])
      expect(rankPlayers(s).map((r) => r.name)).toEqual(['Bob', 'Ann'])
    })

    it('reports points, differential and scored games, and a negative differential', () => {
      const s = withStats([[1, 'Ann', { games: 2, wins: 1, losses: 1, pointsFor: 15, pointsAgainst: 22, scoredGames: 2 }]])
      expect(rankPlayers(s)[0]).toMatchObject({ pointsFor: 15, pointsAgainst: 22, diff: -7, scoredGames: 2 })
    })

    it('only counts games that had a score, because winner-only games add no points', () => {
      // Two players win the same two games on court; only the first game is scored.
      let s = createSession('singles', 1)
      s = checkIn(s, player(1, 'Ann'))
      s = checkIn(s, player(2, 'Bob'))
      s = startGame(s, 1)
      s = recordScore(s, 1, 11, 4).state
      s = startGame(s, 1)
      s = recordResult(s, 1, 0).state
      const ann = rankPlayers(s).find((r) => r.name === 'Ann')!
      const bob = rankPlayers(s).find((r) => r.name === 'Bob')!
      expect(ann).toMatchObject({ games: 2, scoredGames: 1 })
      expect(Math.abs(ann.diff)).toBe(7)
      expect(ann.diff).toBe(-bob.diff)
      expect(ann.pointsFor).toBe(bob.pointsAgainst)
    })

    it('counts a player with no scored games as level, so they rank on the other criteria', () => {
      const s = withStats([
        [1, 'Ann', { games: 2, wins: 2, opponentSkill: 6 }],
        [2, 'Bob', scored(22, 20, { opponentSkill: 12 })],
      ])
      // Bob's +2 beats Ann's unscored 0.
      expect(rankPlayers(s).map((r) => r.name)).toEqual(['Bob', 'Ann'])
      expect(rankPlayers(s)[1].scoredGames).toBe(0)
    })

    it('still shares a rank and medal when everything, including the differential, is level', () => {
      const s = withStats([
        [1, 'Ann', scored(22, 10)],
        [2, 'Bob', scored(24, 12)],
        [3, 'Cy', scored(22, 11)],
      ])
      expect(rankPlayers(s).map((r) => [r.name, r.rank, r.medal])).toEqual([
        ['Ann', 1, 'gold'],
        ['Bob', 1, 'gold'],
        ['Cy', 3, 'bronze'],
      ])
    })

    it('does not share a rank when only the differential differs', () => {
      const s = withStats([
        [1, 'Ann', scored(22, 10)],
        [2, 'Bob', scored(22, 11)],
      ])
      expect(rankPlayers(s).map((r) => [r.name, r.rank, r.medal])).toEqual([
        ['Ann', 1, 'gold'],
        ['Bob', 2, 'silver'],
      ])
    })

    it('orders players level on wins and differential by opponent strength, then win rate, then name', () => {
      const s = withStats([
        [1, 'Zed', scored(22, 10, { games: 2, opponentSkill: 6 })], // opp 3, win rate 1
        [2, 'Ann', scored(22, 10, { games: 2, opponentSkill: 8 })], // opp 4
        [3, 'Cy', scored(22, 10, { games: 4, losses: 2, opponentSkill: 12 })], // opp 3, win rate 0.5
        [4, 'Abe', scored(22, 10, { games: 2, opponentSkill: 6 })], // same as Zed
      ])
      const ranked = rankPlayers(s)
      expect(ranked.map((r) => r.name)).toEqual(['Ann', 'Abe', 'Zed', 'Cy'])
      // Abe and Zed are level on everything but the name, so they share a rank.
      expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4])
    })
  })

  it('reports time played', () => {
    const s = withStats([[1, 'Ann', { games: 2, wins: 2, secondsPlayed: 1260 }]])
    expect(rankPlayers(s)[0].secondsPlayed).toBe(1260)
  })

  it('reports time waited', () => {
    const s = withStats([[1, 'Ann', { games: 2, wins: 2, secondsWaited: 540 }]])
    expect(rankPlayers(s)[0].secondsWaited).toBe(540)
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

describe('pageStandings', () => {
  const standingsOf = (count: number) =>
    rankPlayers(withStats(Array.from({ length: count }, (_, i) => [i + 1, `P${i + 1}`, { games: 1, wins: 1 }])))

  it('keeps everyone on one page when there are 10 or fewer', () => {
    expect(pageStandings(standingsOf(7))).toHaveLength(1)
    const onExactlyTen = pageStandings(standingsOf(10))
    expect(onExactlyTen).toHaveLength(1)
    expect(onExactlyTen[0]).toHaveLength(10)
  })

  it('splits into pages of up to 10, preserving rank order', () => {
    const standings = standingsOf(25)
    const pages = pageStandings(standings)
    expect(pages.map((p) => p.length)).toEqual([10, 10, 5])
    expect(pages.flat()).toEqual(standings)
  })

  it('has no pages for an empty list', () => {
    expect(pageStandings([])).toEqual([])
  })
})

describe('podium', () => {
  /** Just what podium() reads: rank and medal. */
  const at = (id: number, rank: number): Standing =>
    ({ id, name: `P${id}`, rank, medal: rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : null }) as Standing

  it('lists gold, silver and bronze in that order, leaving the rest out', () => {
    const places = podium([at(1, 1), at(2, 2), at(3, 3), at(4, 4)])
    expect(places.map((p) => [p.medal, p.rank, p.players.map((s) => s.id)])).toEqual([
      ['gold', 1, [1]],
      ['silver', 2, [2]],
      ['bronze', 3, [3]],
    ])
  })

  it('puts tied players on one place, and leaves out a medal nobody won', () => {
    const places = podium([at(1, 1), at(2, 1), at(3, 3)])
    expect(places.map((p) => [p.medal, p.players.map((s) => s.id)])).toEqual([
      ['gold', [1, 2]],
      ['bronze', [3]],
    ])
  })

  it('has fewer places with fewer players, and none with nobody', () => {
    expect(podium([at(1, 1), at(2, 2)]).map((p) => p.medal)).toEqual(['gold', 'silver'])
    expect(podium([])).toEqual([])
  })
})
