import { describe, expect, it } from 'vitest'
import {
  addCourt,
  cancelMatch,
  checkIn,
  checkOut,
  closeCourt,
  createSession,
  defaultCourtName,
  estimateWaitMinutes,
  lockPartners,
  MAX_COURTS,
  moveCourt,
  nextGroup,
  recordResult,
  renameCourt,
  replacePlayer,
  setAvgGameMinutes,
  startGame,
  unlockPartners,
} from './engine'
import { fillCourts } from './testing'
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
    const s = fillCourts(withPlayers(createSession('doubles', 1), 5))
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
    const s = fillCourts(withPlayers(createSession('doubles', 1), 4))
    expect(() => checkOut(s, 1)).toThrow()
  })
})

describe('nothing starts by itself', () => {
  it('keeps every court open while people check in', () => {
    const s = withPlayers(createSession('doubles', 2), 8)
    expect(s.courts.every((c) => c.teams === null)).toBe(true)
    expect(s.queue).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('leaves the court open after a result', () => {
    const s = recordResult(fillCourts(withPlayers(createSession('doubles', 1), 8)), 1, 0).state
    expect(s.courts[0].teams).toBeNull()
    expect(s.queue).toHaveLength(8)
  })
})

describe('nextGroup', () => {
  it('is the first four waiting players, split into two teams', () => {
    const group = nextGroup(withPlayers(createSession('doubles', 2), 6))!
    expect(group.players.slice().sort()).toEqual([1, 2, 3, 4])
    expect(group.teams.flat()).toEqual(group.players)
    expect(group.teams.map((t) => t.length)).toEqual([2, 2])
  })

  it('balances doubles teams by skill', () => {
    let s = createSession('doubles', 1)
    for (const [id, skill] of [[1, 6], [2, 5], [3, 2], [4, 1]] as const) {
      s = checkIn(s, player(id, skill))
    }
    const [a, b] = nextGroup(s)!.teams
    const key = (t: number[]) => t.slice().sort().join()
    expect([key(a), key(b)].sort()).toEqual(['1,4', '2,3'])
  })

  it('is the first two players in singles', () => {
    const group = nextGroup(withPlayers(createSession('singles', 2), 5))!
    expect(group.teams).toEqual([[1], [2]])
    expect(group.players).toEqual([1, 2])
  })

  it('is null when too few players wait', () => {
    expect(nextGroup(withPlayers(createSession('doubles', 1), 3))).toBeNull()
    expect(nextGroup(withPlayers(createSession('singles', 1), 1))).toBeNull()
    expect(nextGroup(createSession('doubles', 1))).toBeNull()
  })

  it('does not depend on a court being open', () => {
    const s = fillCourts(withPlayers(createSession('doubles', 1), 8))
    expect(nextGroup(s)!.players.slice().sort()).toEqual([5, 6, 7, 8])
  })

  it('skips players on a break', () => {
    const s = checkOut(withPlayers(createSession('doubles', 1), 5), 1)
    expect(nextGroup(s)!.players.slice().sort()).toEqual([2, 3, 4, 5])
  })

  it('keeps a locked pair together on one team', () => {
    const s = lockPartners(withPlayers(createSession('doubles', 1), 8), 1, 4)
    const { teams } = nextGroup(s)!
    expect(teams.some((t) => t.includes(1) && t.includes(4))).toBe(true)
  })

  it('does not change the state it was given', () => {
    const s = withPlayers(createSession('doubles', 1), 6)
    const snapshot = structuredClone(s)
    nextGroup(s)
    expect(s).toEqual(snapshot)
  })
})

describe('startGame', () => {
  it('stages exactly the previewed teams and removes those players from the queue', () => {
    const s = withPlayers(createSession('doubles', 2), 6)
    const preview = nextGroup(s)!
    const started = startGame(s, 1)
    expect(started.courts[0].teams).toEqual(preview.teams)
    expect(started.courts[1].teams).toBeNull()
    expect(started.queue).toEqual([5, 6])
  })

  it('starts the chosen court, not the first open one', () => {
    const s = startGame(withPlayers(createSession('doubles', 2), 4), 2)
    expect(s.courts[0].teams).toBeNull()
    expect(s.courts[1].teams!.flat().sort()).toEqual([1, 2, 3, 4])
  })

  it('moves next up on to the following group', () => {
    const s = startGame(withPlayers(createSession('doubles', 2), 8), 1)
    expect(nextGroup(s)!.players.slice().sort()).toEqual([5, 6, 7, 8])
  })

  it('pairs two players in singles', () => {
    const s = startGame(withPlayers(createSession('singles', 1), 3), 1)
    expect(s.courts[0].teams).toEqual([[1], [2]])
    expect(s.queue).toEqual([3])
  })

  it('refuses a busy court, an unknown court and too few players', () => {
    const busy = startGame(withPlayers(createSession('doubles', 2), 8), 1)
    expect(() => startGame(busy, 1)).toThrow('already has a game in progress')
    expect(() => startGame(busy, 9)).toThrow()
    expect(() => startGame(withPlayers(createSession('doubles', 1), 3), 1)).toThrow(
      'Not enough players',
    )
  })

  it('never changes the state it was given', () => {
    const s = withPlayers(createSession('doubles', 1), 5)
    const snapshot = structuredClone(s)
    startGame(s, 1)
    expect(s).toEqual(snapshot)
  })
})

describe('recordResult', () => {
  it('frees the court and requeues winners then losers behind waiting players', () => {
    const s = fillCourts(withPlayers(createSession('doubles', 1), 6))
    const { state, winners, losers } = recordResult(s, 1, 0)
    expect(state.courts[0].teams).toBeNull()
    expect(state.queue).toEqual([5, 6, ...winners, ...losers])
    expect(winners).toHaveLength(2)
    expect(losers).toHaveLength(2)
  })

  it('does not mutate the previous state (undo-safe)', () => {
    const s = fillCourts(withPlayers(createSession('doubles', 1), 4))
    const snapshot = structuredClone(s)
    recordResult(s, 1, 1)
    expect(s).toEqual(snapshot)
  })

  it('throws for an empty court', () => {
    expect(() => recordResult(createSession('doubles', 1), 1, 0)).toThrow()
  })

  it('rotates the next waiting group onto the court', () => {
    let s = fillCourts(withPlayers(createSession('doubles', 1), 8))
    expect(s.courts[0].teams!.flat().sort()).toEqual([1, 2, 3, 4])
    s = fillCourts(recordResult(s, 1, 0).state)
    expect(s.courts[0].teams!.flat().sort()).toEqual([5, 6, 7, 8])
  })
})

describe('cancelMatch', () => {
  it('returns players to the front of the queue', () => {
    const s = fillCourts(withPlayers(createSession('doubles', 1), 5))
    const c = cancelMatch(s, 1)
    expect(c.courts[0].teams).toBeNull()
    expect(c.queue.slice(0, 4).sort()).toEqual([1, 2, 3, 4])
    expect(c.queue[4]).toBe(5)
  })
})

describe('replacePlayer', () => {
  it('subs in the front of the queue on the same side and sends the leaver on break', () => {
    const s = fillCourts(withPlayers(createSession('doubles', 1), 5))
    const sideOf1 = s.courts[0].teams![0].includes(1) ? 0 : 1
    const r = replacePlayer(s, 1, 1)
    expect(r.courts[0].teams![sideOf1]).toContain(5)
    expect(r.courts[0].teams!.flat()).not.toContain(1)
    expect(r.queue).toEqual([])
    expect(r.onBreak).toEqual([1])
  })

  it('subs in a chosen waiting player, not just the front of the queue', () => {
    const s = fillCourts(withPlayers(createSession('doubles', 1), 6))
    const r = replacePlayer(s, 1, 2, 6)
    expect(r.courts[0].teams!.flat()).toContain(6)
    expect(r.queue).toEqual([5])
  })

  it('throws when the substitute is not queued', () => {
    const s = fillCourts(withPlayers(createSession('doubles', 1), 4))
    expect(() => replacePlayer(s, 1, 1)).toThrow()
  })
})

describe('court management', () => {
  const names = (s: SessionState) => s.courts.map((c) => c.name)
  const ids = (s: SessionState) => s.courts.map((c) => c.id)

  describe('defaultCourtName', () => {
    it('is the lowest "Court N" not already used, ignoring case', () => {
      const s = createSession('doubles', 3)
      expect(defaultCourtName(s.courts)).toBe('Court 4')
      expect(defaultCourtName(closeCourt(s, 2).courts)).toBe('Court 2')
      expect(defaultCourtName([{ id: 1, name: 'court 1', teams: null }])).toBe('Court 2')
    })
  })

  describe('addCourt', () => {
    it('adds an empty court with the next id and the lowest free name', () => {
      const s = addCourt(createSession('doubles', 2))
      expect(s.courts).toHaveLength(3)
      expect(s.courts[2]).toEqual({ id: 3, name: 'Court 3', teams: null })
    })

    it('reuses a freed number for the name but never an id in use', () => {
      let s = closeCourt(createSession('doubles', 3), 2)
      s = addCourt(s)
      expect(names(s)).toEqual(['Court 1', 'Court 3', 'Court 2'])
      expect(ids(s)).toEqual([1, 3, 4])
    })

    it('takes a chosen name, trimmed, and checks it like a rename', () => {
      const s = addCourt(createSession('doubles', 1), '  Center Court ')
      expect(s.courts[1].name).toBe('Center Court')
      expect(() => addCourt(s, 'center court')).toThrow(RangeError)
      expect(() => addCourt(s, '   ')).toThrow(RangeError)
    })

    it('stops at the limit', () => {
      expect(() => addCourt(createSession('doubles', MAX_COURTS))).toThrow(RangeError)
      expect(addCourt(createSession('doubles', MAX_COURTS - 1)).courts).toHaveLength(MAX_COURTS)
    })

    it('leaves everything else alone and does not change the state it was given', () => {
      const before = fillCourts(withPlayers(createSession('singles', 1), 3))
      const snapshot = structuredClone(before)
      const after = addCourt(before)
      expect(before).toEqual(snapshot)
      expect(after.queue).toEqual(before.queue)
      expect(after.courts[0]).toEqual(before.courts[0])
    })

    it('lets waiting players fill the new court once the queue is assigned', () => {
      const s = fillCourts(addCourt(fillCourts(withPlayers(createSession('doubles', 1), 8))))
      expect(s.courts[1].teams?.flat().sort()).toEqual([5, 6, 7, 8])
      expect(s.queue).toEqual([])
    })
  })

  describe('renameCourt', () => {
    it('renames, trimming the name', () => {
      expect(names(renameCourt(createSession('doubles', 2), 2, '  Center Court  '))).toEqual(['Court 1', 'Center Court'])
    })

    it('lets a court keep its own name, even in a different case', () => {
      expect(names(renameCourt(createSession('doubles', 2), 2, 'COURT 2'))).toEqual(['Court 1', 'COURT 2'])
    })

    it('refuses empty, too long and duplicate names', () => {
      const s = createSession('doubles', 2)
      expect(() => renameCourt(s, 1, '')).toThrow('Give the court a name')
      expect(() => renameCourt(s, 1, '   ')).toThrow(RangeError)
      expect(() => renameCourt(s, 1, 'x'.repeat(41))).toThrow('at most 40')
      expect(renameCourt(s, 1, 'x'.repeat(40)).courts[0].name).toHaveLength(40)
      expect(() => renameCourt(s, 1, ' court 2 ')).toThrow('Another court already has that name')
    })

    it('throws for a court that does not exist', () => {
      expect(() => renameCourt(createSession('doubles', 1), 9, 'x')).toThrow()
    })

    it('does not disturb a game in progress', () => {
      const s = fillCourts(withPlayers(createSession('doubles', 1), 4))
      const renamed = renameCourt(s, 1, 'Center Court')
      expect(renamed.courts[0].teams).toEqual(s.courts[0].teams)
      expect(recordResult(renamed, 1, 0).state.courts[0].name).toBe('Center Court')
    })
  })

  describe('moveCourt', () => {
    it('swaps a court with its neighbour, its game and id going with it', () => {
      const s = fillCourts(withPlayers(createSession('doubles', 3), 4)) // court 1 is playing
      const moved = moveCourt(s, 1, 1)
      expect(ids(moved)).toEqual([2, 1, 3])
      expect(moved.courts[1].teams).toEqual(s.courts[0].teams)
      expect(ids(moveCourt(moved, 1, -1))).toEqual([1, 2, 3])
    })

    it('does nothing past either end', () => {
      const s = createSession('doubles', 3)
      expect(moveCourt(s, 1, -1)).toBe(s)
      expect(moveCourt(s, 3, 1)).toBe(s)
    })

    it('throws for a court that does not exist, and does not change its input', () => {
      const s = createSession('doubles', 3)
      const snapshot = structuredClone(s)
      expect(() => moveCourt(s, 9, 1)).toThrow()
      moveCourt(s, 2, 1)
      expect(s).toEqual(snapshot)
    })
  })

  describe('closeCourt', () => {
    it('removes an empty court and leaves the queue alone', () => {
      const s = withPlayers(createSession('doubles', 2), 3)
      const closed = closeCourt(s, 2)
      expect(ids(closed)).toEqual([1])
      expect(closed.queue).toEqual([1, 2, 3])
    })

    it('cancels a game in progress with no result, and puts its players first in the queue', () => {
      const s = fillCourts(withPlayers(createSession('doubles', 2), 6)) // 1-4 playing, 5 and 6 waiting
      const closed = closeCourt(s, 1)
      expect(ids(closed)).toEqual([2])
      expect(closed.queue.slice(0, 4).sort()).toEqual([1, 2, 3, 4])
      expect(closed.queue.slice(4)).toEqual([5, 6])
      expect(closed.stats).toEqual({})
      expect(closed.lastResult).toEqual({})
    })

    it('lets the cancelled players move onto another open court', () => {
      const s = fillCourts(withPlayers(createSession('doubles', 2), 4)) // court 2 is open
      const restaged = fillCourts(closeCourt(s, 1))
      expect(ids(restaged)).toEqual([2])
      expect(restaged.courts[0].teams?.flat().sort()).toEqual([1, 2, 3, 4])
      expect(restaged.queue).toEqual([])
    })

    it('always keeps one court', () => {
      const s = createSession('doubles', 1)
      expect(() => closeCourt(s, 1)).toThrow('at least one court')
      expect(() => closeCourt(closeCourt(createSession('doubles', 2), 1), 2)).toThrow(RangeError)
    })

    it('throws for a court that does not exist and never changes its input', () => {
      const s = fillCourts(withPlayers(createSession('doubles', 2), 4))
      const snapshot = structuredClone(s)
      expect(() => closeCourt(s, 9)).toThrow()
      closeCourt(s, 1)
      expect(s).toEqual(snapshot)
    })
  })

  describe('any order of changes', () => {
    /** A small seeded generator so a failure can be reproduced. */
    const random = (seed: number) => () => {
      seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296
      return seed / 4_294_967_296
    }

    function checkInvariants(s: SessionState) {
      expect(s.courts.length).toBeGreaterThanOrEqual(1)
      expect(s.courts.length).toBeLessThanOrEqual(MAX_COURTS)
      expect(new Set(ids(s)).size).toBe(s.courts.length)
      expect(new Set(names(s).map((n) => n.toLowerCase())).size).toBe(s.courts.length)
      for (const court of s.courts) expect(court.name.trim()).not.toBe('')

      // Every checked-in player is in exactly one place: on a court, in the queue, or on a break.
      const places = [...s.courts.flatMap((c) => (c.teams ? c.teams.flat() : [])), ...s.queue, ...s.onBreak]
      expect(places.length).toBe(new Set(places).size)
      expect(new Set(places)).toEqual(new Set(Object.keys(s.players).map(Number)))
    }

    it('never loses a player, duplicates one, or reuses a court id or name', () => {
      for (const seed of [1, 2, 3, 4, 5]) {
        const next = random(seed)
        const pick = <T,>(items: T[]) => items[Math.floor(next() * items.length)]
        let s = createSession('doubles', 3)
        let nextPlayer = 1

        for (let step = 0; step < 250; step++) {
          const busy = s.courts.filter((c) => c.teams)
          try {
            switch (Math.floor(next() * 9)) {
              case 0:
                s = checkIn(checkIn(s, player(nextPlayer++)), player(nextPlayer++))
                break
              case 1:
                s = addCourt(s)
                break
              case 2:
                s = closeCourt(s, pick(s.courts).id)
                break
              case 3:
                s = renameCourt(s, pick(s.courts).id, `Court ${Math.floor(next() * 20)}`)
                break
              case 4:
                s = moveCourt(s, pick(s.courts).id, next() < 0.5 ? -1 : 1)
                break
              case 5:
                if (busy.length) s = recordResult(s, pick(busy).id, next() < 0.5 ? 0 : 1).state
                break
              case 6:
                if (busy.length) s = cancelMatch(s, pick(busy).id)
                break
              case 7:
                if (s.queue.length) s = checkOut(s, pick(s.queue))
                break
              default: {
                const open = s.courts.filter((c) => !c.teams)
                if (open.length && nextGroup(s)) s = startGame(s, pick(open).id)
              }
            }
          } catch (error) {
            // Refusing something invalid is fine; anything else is a bug.
            if (!(error instanceof RangeError)) throw error
          }
          checkInvariants(s)
        }
      }
    })
  })
})

describe('estimateWaitMinutes', () => {
  it('is 0 when a court is free for the player', () => {
    const s = withPlayers(createSession('doubles', 2), 4)
    expect(estimateWaitMinutes(s, 1, 12)).toBe(0)
  })

  it('grows with queue position and returns null for non-queued players', () => {
    const s = fillCourts(withPlayers(createSession('doubles', 2), 16))
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
    s = fillCourts(s)
    const [a, b] = s.courts[0].teams!
    expect([a, b].some((t) => t.includes(1) && t.includes(4))).toBe(true)

    const { state } = recordResult(s, 1, 0)
    const at = state.queue.indexOf(1)
    expect(Math.abs(at - state.queue.indexOf(4))).toBe(1)
  })

  it('dissolves the lock when one partner is replaced mid-game', () => {
    let s = lockPartners(withPlayers(createSession('doubles', 1), 5), 1, 2)
    s = fillCourts(s)
    s = replacePlayer(s, 1, 1)
    expect(s.partners).toEqual([])
  })

  it('is ignored when a session has no partners (singles stays first come, first served)', () => {
    const s = fillCourts(withPlayers(createSession('singles', 1), 3))
    expect(s.courts[0].teams).toEqual([[1], [2]])
  })
})

describe('lastResult', () => {
  it('records W for winners and L for losers and overwrites on the next game', () => {
    let s = fillCourts(withPlayers(createSession('doubles', 1), 4))
    const first = recordResult(s, 1, 0)
    first.winners.forEach((id) => expect(first.state.lastResult[id]).toBe('W'))
    first.losers.forEach((id) => expect(first.state.lastResult[id]).toBe('L'))

    s = fillCourts(first.state)
    const second = recordResult(s, 1, 1)
    second.winners.forEach((id) => expect(second.state.lastResult[id]).toBe('W'))
  })
})

describe('mixed doubles', () => {
  const mixed = (genders: ('M' | 'F')[]) => {
    let st = createSession('doubles', 1, { matchmaking: 'mixed' })
    genders.forEach((gender, i) => {
      st = checkIn(st, { id: i + 1, name: `P${i + 1}`, skill: 3, gender })
    })
    return st
  }

  it('has no next group without two men and two women, but staff can override', () => {
    const s = mixed(['M', 'M', 'M', 'M', 'M'])
    expect(nextGroup(s)).toBeNull()
    expect(nextGroup(s, { ignoreMode: true })!.players.slice().sort()).toEqual([1, 2, 3, 4])
    expect(() => startGame(s, 1)).toThrow('Not enough players')
    const started = startGame(s, 1, { ignoreMode: true })
    expect(started.courts[0].teams!.flat().sort()).toEqual([1, 2, 3, 4])
    expect(started.queue).toEqual([5])
  })

  it('pairs a man and a woman on each team when it can', () => {
    const { teams } = nextGroup(mixed(['M', 'M', 'F', 'F']))!
    for (const team of teams) expect(team.some((id) => id <= 2) && team.some((id) => id > 2)).toBe(true)
  })
})
