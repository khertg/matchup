import { describe, expect, it } from 'vitest'
import {
  assignCourts,
  cancelMatch,
  checkIn,
  checkOut,
  createSession,
  estimateWaitMinutes,
  lockPartners,
  recordResult,
  replacePlayer,
  setAvgGameMinutes,
  startCourtManually,
  unlockPartners,
} from './engine'
import type { RosterPlayer, SessionState } from './types'

const player = (id: number, skill: RosterPlayer['skill'] = 3): RosterPlayer => ({
  id,
  name: `P${id}`,
  skill,
})

function withPlayers(state: SessionState, count: number): SessionState {
  let s = state
  for (let id = 1; id <= count; id++) s = checkIn(s, player(id))
  return s
}

describe('createSession', () => {
  it('rejects court counts outside 1-15', () => {
    expect(() => createSession('doubles', 0)).toThrow(RangeError)
    expect(() => createSession('doubles', 16)).toThrow(RangeError)
  })
})

describe('game length', () => {
  it('defaults to 12 minutes and accepts a custom length', () => {
    expect(createSession('doubles', 1).avgGameMinutes).toBe(12)
    expect(createSession('doubles', 1, { avgGameMinutes: 20 }).avgGameMinutes).toBe(20)
  })

  it('rejects lengths outside 5-60 or non-integers', () => {
    expect(() => createSession('doubles', 1, { avgGameMinutes: 4 })).toThrow(RangeError)
    expect(() => createSession('doubles', 1, { avgGameMinutes: 61 })).toThrow(RangeError)
    expect(() => setAvgGameMinutes(createSession('doubles', 1), 7.5)).toThrow(RangeError)
  })

  it('changes the wait estimate without mutating the old state', () => {
    const s = assignCourts(withPlayers(createSession('doubles', 1), 5))
    const slower = setAvgGameMinutes(s, 24)
    expect(estimateWaitMinutes(s, 5, s.avgGameMinutes)).toBe(12)
    expect(estimateWaitMinutes(slower, 5, slower.avgGameMinutes)).toBe(24)
    expect(s.avgGameMinutes).toBe(12)
  })
})

describe('checkIn / checkOut', () => {
  it('queues players in arrival order and ignores duplicates', () => {
    let s = createSession('doubles', 1)
    s = checkIn(s, player(1))
    s = checkIn(s, player(2))
    s = checkIn(s, player(1))
    expect(s.queue).toEqual([1, 2])
  })

  it('sends a returning player to the back of the queue', () => {
    let s = withPlayers(createSession('doubles', 1), 3)
    s = checkOut(s, 1)
    expect(s.onBreak).toEqual([1])
    s = checkIn(s, player(1))
    expect(s.queue).toEqual([2, 3, 1])
    expect(s.onBreak).toEqual([])
  })

  it('refuses to check out a player who is on a court', () => {
    const s = assignCourts(withPlayers(createSession('doubles', 1), 4))
    expect(() => checkOut(s, 1)).toThrow()
  })
})

describe('assignCourts', () => {
  it('fills courts first come, first served and leaves the rest queued', () => {
    const s = assignCourts(withPlayers(createSession('doubles', 2), 6))
    expect(s.courts[0].teams?.flat().sort()).toEqual([1, 2, 3, 4])
    expect(s.courts[1].teams).toBeNull()
    expect(s.queue).toEqual([5, 6])
  })

  it('balances doubles teams by skill', () => {
    let s = createSession('doubles', 1)
    for (const [id, skill] of [[1, 6], [2, 5], [3, 2], [4, 1]] as const) {
      s = checkIn(s, player(id, skill))
    }
    const [a, b] = assignCourts(s).courts[0].teams!
    const key = (t: number[]) => t.slice().sort().join()
    expect([key(a), key(b)].sort()).toEqual(['1,4', '2,3'])
  })

  it('pairs two players per court in singles', () => {
    const s = assignCourts(withPlayers(createSession('singles', 2), 5))
    expect(s.courts[0].teams).toEqual([[1], [2]])
    expect(s.courts[1].teams).toEqual([[3], [4]])
    expect(s.queue).toEqual([5])
  })

  it('does not overwrite a court already in play', () => {
    const s = assignCourts(withPlayers(createSession('doubles', 1), 8))
    expect(assignCourts(s)).toEqual(s)
  })
})

describe('recordResult', () => {
  it('frees the court and requeues winners then losers behind waiting players', () => {
    const s = assignCourts(withPlayers(createSession('doubles', 1), 6))
    const { state, winners, losers } = recordResult(s, 1, 0)
    expect(state.courts[0].teams).toBeNull()
    expect(state.queue).toEqual([5, 6, ...winners, ...losers])
    expect(winners).toHaveLength(2)
    expect(losers).toHaveLength(2)
  })

  it('does not mutate the previous state (undo-safe)', () => {
    const s = assignCourts(withPlayers(createSession('doubles', 1), 4))
    const snapshot = structuredClone(s)
    recordResult(s, 1, 1)
    expect(s).toEqual(snapshot)
  })

  it('throws for an empty court', () => {
    expect(() => recordResult(createSession('doubles', 1), 1, 0)).toThrow()
  })

  it('rotates the next waiting group onto the court', () => {
    let s = assignCourts(withPlayers(createSession('doubles', 1), 8))
    expect(s.courts[0].teams!.flat().sort()).toEqual([1, 2, 3, 4])
    s = assignCourts(recordResult(s, 1, 0).state)
    expect(s.courts[0].teams!.flat().sort()).toEqual([5, 6, 7, 8])
  })
})

describe('cancelMatch', () => {
  it('returns players to the front of the queue', () => {
    const s = assignCourts(withPlayers(createSession('doubles', 1), 5))
    const c = cancelMatch(s, 1)
    expect(c.courts[0].teams).toBeNull()
    expect(c.queue.slice(0, 4).sort()).toEqual([1, 2, 3, 4])
    expect(c.queue[4]).toBe(5)
  })
})

describe('replacePlayer', () => {
  it('subs in the front of the queue on the same side and sends the leaver on break', () => {
    const s = assignCourts(withPlayers(createSession('doubles', 1), 5))
    const sideOf1 = s.courts[0].teams![0].includes(1) ? 0 : 1
    const r = replacePlayer(s, 1, 1)
    expect(r.courts[0].teams![sideOf1]).toContain(5)
    expect(r.courts[0].teams!.flat()).not.toContain(1)
    expect(r.queue).toEqual([])
    expect(r.onBreak).toEqual([1])
  })

  it('subs in a chosen waiting player, not just the front of the queue', () => {
    const s = assignCourts(withPlayers(createSession('doubles', 1), 6))
    const r = replacePlayer(s, 1, 2, 6)
    expect(r.courts[0].teams!.flat()).toContain(6)
    expect(r.queue).toEqual([5])
  })

  it('throws when the substitute is not queued', () => {
    const s = assignCourts(withPlayers(createSession('doubles', 1), 4))
    expect(() => replacePlayer(s, 1, 1)).toThrow()
  })
})

describe('estimateWaitMinutes', () => {
  it('is 0 when a court is free for the player', () => {
    const s = withPlayers(createSession('doubles', 2), 4)
    expect(estimateWaitMinutes(s, 1, 12)).toBe(0)
  })

  it('grows with queue position and returns null for non-queued players', () => {
    const s = assignCourts(withPlayers(createSession('doubles', 2), 16))
    // 2 courts busy, 8 waiting: player 9 is next (one court must free), player 13 is a match further back.
    expect(estimateWaitMinutes(s, 9, 12)).toBe(6)
    expect(estimateWaitMinutes(s, 13, 12)).toBe(12)
    expect(estimateWaitMinutes(s, 1, 12)).toBeNull()
  })
})

describe('partner locking', () => {
  it('locks two checked-in players and unlocks by either partner', () => {
    let s = withPlayers(createSession('doubles', 1), 3)
    s = lockPartners(s, 1, 3)
    expect(s.partners).toEqual([[1, 3]])
    expect(unlockPartners(s, 3).partners).toEqual([])
    expect(unlockPartners(s, 2).partners).toEqual([[1, 3]])
  })

  it('rejects invalid locks', () => {
    const s = withPlayers(createSession('doubles', 1), 3)
    expect(() => lockPartners(s, 1, 1)).toThrow()
    expect(() => lockPartners(s, 1, 99)).toThrow()
    expect(() => lockPartners(withPlayers(createSession('singles', 1), 3), 1, 2)).toThrow()
    const locked = lockPartners(s, 1, 2)
    expect(() => lockPartners(locked, 2, 3)).toThrow()
  })

  it('keeps partners on the same team and requeues them together after a game', () => {
    let s = lockPartners(withPlayers(createSession('doubles', 1), 8), 1, 4)
    s = assignCourts(s)
    const [a, b] = s.courts[0].teams!
    expect([a, b].some((t) => t.includes(1) && t.includes(4))).toBe(true)

    const { state } = recordResult(s, 1, 0)
    const at = state.queue.indexOf(1)
    expect(Math.abs(at - state.queue.indexOf(4))).toBe(1)
  })

  it('dissolves the lock when one partner is replaced mid-game', () => {
    let s = lockPartners(withPlayers(createSession('doubles', 1), 5), 1, 2)
    s = assignCourts(s)
    s = replacePlayer(s, 1, 1)
    expect(s.partners).toEqual([])
  })

  it('is ignored when a session has no partners (singles stays first come, first served)', () => {
    const s = assignCourts(withPlayers(createSession('singles', 1), 3))
    expect(s.courts[0].teams).toEqual([[1], [2]])
  })
})

describe('lastResult', () => {
  it('records W for winners and L for losers and overwrites on the next game', () => {
    let s = assignCourts(withPlayers(createSession('doubles', 1), 4))
    const first = recordResult(s, 1, 0)
    first.winners.forEach((id) => expect(first.state.lastResult[id]).toBe('W'))
    first.losers.forEach((id) => expect(first.state.lastResult[id]).toBe('L'))

    s = assignCourts(first.state)
    const second = recordResult(s, 1, 1)
    second.winners.forEach((id) => expect(second.state.lastResult[id]).toBe('W'))
  })
})

describe('startCourtManually', () => {
  const mixedMen = () => {
    let st = createSession('doubles', 1, { matchmaking: 'mixed' })
    for (let id = 1; id <= 5; id++) st = checkIn(st, { id, name: `P${id}`, skill: 3, gender: 'M' })
    return st
  }

  it('leaves a mixed court open when no mixed group exists, then lets staff start it', () => {
    const s = assignCourts(mixedMen())
    expect(s.courts[0].teams).toBeNull()
    const started = startCourtManually(s, 1)
    expect(started.courts[0].teams!.flat().sort()).toEqual([1, 2, 3, 4])
    expect(started.queue).toEqual([5])
  })

  it('refuses a busy court or too few players', () => {
    const busy = assignCourts(withPlayers(createSession('doubles', 1), 4))
    expect(() => startCourtManually(busy, 1)).toThrow()
    expect(() => startCourtManually(withPlayers(createSession('doubles', 1), 3), 1)).toThrow()
  })
})
