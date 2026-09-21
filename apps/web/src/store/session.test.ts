import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RosterPlayer } from '@/rotation/types'

// The store persists to localStorage; give the node test environment a tiny in-memory one.
vi.hoisted(() => {
  const data = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    },
  })
})

import { activePlayerCount, useSessionStore } from './session'

const player = (id: number): RosterPlayer => ({ id, name: `P${id}`, skill: 3 })
const store = () => useSessionStore.getState()

function checkInMany(count: number) {
  for (let id = 1; id <= count; id++) store().checkInPlayer(player(id))
}

beforeEach(() => {
  useSessionStore.setState({ location: '', session: null, previous: null })
})

describe('session store', () => {
  it('starts a session with empty courts', () => {
    store().startSession('Downtown Club', 'doubles', 2)
    expect(store().location).toBe('Downtown Club')
    expect(store().session?.courts).toHaveLength(2)
    expect(store().session?.queue).toEqual([])
  })

  it('does not start a game by itself, however many players check in', () => {
    store().startSession('Club', 'doubles', 2)
    checkInMany(8)
    expect(store().session!.courts.every((c) => c.teams === null)).toBe(true)
    expect(store().session!.queue).toHaveLength(8)
  })

  it('starts the next group on the chosen court', () => {
    store().startSession('Club', 'doubles', 2)
    checkInMany(6)
    store().startGame(2)
    expect(store().session!.courts[0].teams).toBeNull()
    expect(store().session!.courts[1].teams?.flat().sort()).toEqual([1, 2, 3, 4])
    expect(store().session!.queue).toEqual([5, 6])
  })

  it('refuses to start with too few players and changes nothing', () => {
    store().startSession('Club', 'doubles', 1)
    checkInMany(3)
    expect(() => store().startGame(1)).toThrow('Not enough players')
    expect(store().session!.queue).toEqual([1, 2, 3])
  })

  it('clears the pending result undo when a game starts', () => {
    store().startSession('Club', 'doubles', 2)
    checkInMany(8)
    store().startGame(1)
    store().recordResult(1, 0)
    store().startGame(1)
    expect(store().undo()).toBe(false)
  })

  describe('session identity', () => {
    it('gives each new session its own id and start time, with nothing counted yet', () => {
      store().startSession('One', 'doubles', 1)
      const first = store()
      expect(first.sessionId).toMatch(/^[0-9a-f-]{36}$/)
      expect(first.startedAt).toBeGreaterThan(0)
      expect(first.lifetimeCounted).toEqual({})
      store().endSession()
      store().startSession('Two', 'doubles', 1)
      expect(store().sessionId).not.toBe(first.sessionId)
    })

    it('is cleared when the session ends', () => {
      store().startSession('One', 'doubles', 1)
      store().markLifetimeCounted({ 1: { games: 2, wins: 1, losses: 1 } })
      store().endSession()
      expect(store()).toMatchObject({ sessionId: '', startedAt: 0, lifetimeCounted: {}, session: null })
    })

    it('is kept when a session is resumed, so ending it again updates the same history entry', () => {
      store().startSession('One', 'doubles', 1)
      const session = store().session!
      const meta = { sessionId: 'abc', startedAt: 123, lifetimeCounted: { 1: { games: 1, wins: 1, losses: 0 } } }
      store().endSession()
      store().loadSession('One', session, meta)
      expect(store()).toMatchObject({ ...meta, location: 'One' })
    })

    it('gets a fresh identity when loaded without one (a session resumed from the club’s live backup)', () => {
      store().startSession('One', 'doubles', 1)
      const session = store().session!
      store().endSession()
      store().loadSession('One', session)
      expect(store().sessionId).toMatch(/^[0-9a-f-]{36}$/)
      expect(store().lifetimeCounted).toEqual({})
    })

    it('remembers what was counted, and survives a reload', async () => {
      store().startSession('One', 'doubles', 1)
      store().markLifetimeCounted({ 1: { games: 2, wins: 1, losses: 1 } })
      const { sessionId } = store()
      await useSessionStore.persist.rehydrate()
      expect(store().sessionId).toBe(sessionId)
      expect(store().lifetimeCounted).toEqual({ 1: { games: 2, wins: 1, losses: 1 } })
    })

    it('gives a session that was already running before history existed an identity on upgrade', async () => {
      store().startSession('Old', 'doubles', 1)
      const session = store().session!
      localStorage.setItem('matchup-session', JSON.stringify({ state: { location: 'Old', session }, version: 5 }))
      await useSessionStore.persist.rehydrate()
      expect(store().location).toBe('Old')
      expect(store().sessionId).toMatch(/^[0-9a-f-]{36}$/)
      expect(store().startedAt).toBeGreaterThan(0)
      expect(store().lifetimeCounted).toEqual({})
    })

    it('has no identity when an upgraded store had no session running', async () => {
      localStorage.setItem('matchup-session', JSON.stringify({ state: { location: '', session: null }, version: 5 }))
      await useSessionStore.persist.rehydrate()
      expect(store()).toMatchObject({ session: null, sessionId: '', startedAt: 0 })
    })
  })

  describe('checking in several players', () => {
    it('queues them in the order given, without starting anything', () => {
      store().startSession('Club', 'doubles', 1)
      expect(store().checkInPlayers([player(3), player(1), player(2), player(4)])).toBe(4)
      expect(store().session!.queue).toEqual([3, 1, 2, 4])
      expect(store().session!.courts[0].teams).toBeNull()
    })

    it('skips anyone already checked in and says how many were new', () => {
      store().startSession('Club', 'doubles', 1)
      store().checkInPlayer(player(2))
      expect(store().checkInPlayers([player(1), player(2), player(3), player(3)])).toBe(2)
      expect(store().session!.queue).toEqual([2, 1, 3])
    })

    it('clears the pending result undo once, and does nothing for an empty or repeated list', () => {
      store().startSession('Club', 'doubles', 1)
      checkInMany(4)
      store().startGame(1)
      store().recordResult(1, 0)
      const before = store().session
      expect(store().checkInPlayers([])).toBe(0)
      expect(store().checkInPlayers([player(1)])).toBe(0)
      expect(store().session).toBe(before)
      expect(store().undo()).toBe(true) // still possible: nothing changed

      store().recordResult(1, 0)
      expect(store().checkInPlayers([player(5), player(6)])).toBe(2)
      expect(store().undo()).toBe(false)
    })
  })

  it('reports false when a player is checked in twice', () => {
    store().startSession('Club', 'doubles', 1)
    expect(store().checkInPlayer(player(1))).toBe(true)
    expect(store().checkInPlayer(player(1))).toBe(false)
  })

  it('requeues players after a result and leaves the court open', () => {
    store().startSession('Club', 'doubles', 1)
    checkInMany(8)
    store().startGame(1)
    store().recordResult(1, 0)
    expect(store().session!.courts[0].teams).toBeNull()
    expect(store().session!.queue.slice(0, 4).sort()).toEqual([5, 6, 7, 8])
    expect(store().session!.queue.slice(4).sort()).toEqual([1, 2, 3, 4])
  })

  it('undoes the last result', () => {
    store().startSession('Club', 'doubles', 1)
    checkInMany(8)
    store().startGame(1)
    const before = store().session
    store().recordResult(1, 1)
    expect(store().undo()).toBe(true)
    expect(store().session).toEqual(before)
  })

  it('refuses to undo after another change so later actions are not lost', () => {
    store().startSession('Club', 'doubles', 1)
    checkInMany(8)
    store().startGame(1)
    store().recordResult(1, 0)
    store().checkInPlayer(player(9))
    expect(store().undo()).toBe(false)
    expect(store().session!.queue).toContain(9)
  })

  it('cancels a match and puts its players back in the queue', () => {
    store().startSession('Club', 'doubles', 1)
    checkInMany(4)
    store().startGame(1)
    store().cancelMatch(1)
    expect(store().session!.courts[0].teams).toBeNull()
    expect(store().session!.queue).toHaveLength(4)
  })

  it('checks a waiting player out to a break', () => {
    store().startSession('Club', 'doubles', 1)
    checkInMany(2)
    store().checkOutPlayer(1)
    expect(store().session!.onBreak).toEqual([1])
    expect(activePlayerCount(store().session!)).toBe(1)
  })

  it('uses the chosen game length', () => {
    store().startSession('Club', 'doubles', 1, { avgGameMinutes: 20 })
    expect(store().session!.avgGameMinutes).toBe(20)
  })

  it('keeps a pending undo and does not revert the game length when it changes', () => {
    store().startSession('Club', 'doubles', 1)
    checkInMany(8)
    store().startGame(1)
    store().recordResult(1, 0)
    store().setAvgGameMinutes(30)
    expect(store().undo()).toBe(true)
    expect(store().session!.avgGameMinutes).toBe(30)
    expect(store().session!.courts[0].teams?.flat().sort()).toEqual([1, 2, 3, 4])
  })

  it('replaces a playing player with a chosen waiting one', () => {
    store().startSession('Club', 'doubles', 1)
    checkInMany(6)
    store().startGame(1)
    store().replacePlayer(1, 1, 6)
    expect(store().session!.courts[0].teams!.flat()).toContain(6)
    expect(store().session!.onBreak).toEqual([1])
    expect(store().session!.queue).toEqual([5])
  })

  it('starts a match with the locked pair on one team, and locking never starts one', () => {
    store().startSession('Club', 'doubles', 1)
    checkInMany(4)
    store().lockPartners(1, 3)
    expect(store().session!.courts[0].teams).toBeNull()
    store().startGame(1)
    const teams = store().session!.courts[0].teams!
    expect(teams.some((t) => t.includes(1) && t.includes(3))).toBe(true)
  })

  it('starts an open mixed court by hand', () => {
    store().startSession('Club', 'doubles', 1, { matchmaking: 'mixed' })
    for (let id = 1; id <= 4; id++) {
      store().checkInPlayer({ id, name: `P${id}`, skill: 3, gender: 'M' })
    }
    expect(() => store().startGame(1)).toThrow('Not enough players')
    store().startGame(1, { ignoreMode: true })
    expect(store().session!.courts[0].teams!.flat().sort()).toEqual([1, 2, 3, 4])
  })

  it('tracks stats per result and undo reverts them', () => {
    store().startSession('Club', 'doubles', 1)
    checkInMany(4)
    store().startGame(1)
    store().recordResult(1, 0)
    expect(Object.keys(store().session!.stats)).toHaveLength(4)
    expect(store().undo()).toBe(true)
    expect(store().session!.stats).toEqual({})
  })

  describe('scores and time played', () => {
    afterEach(() => vi.useRealTimers())

    it('records a score, deriving the winner', () => {
      store().startSession('Club', 'doubles', 1)
      checkInMany(4)
      store().startGame(1)
      const [teamA, teamB] = store().session!.courts[0].teams!
      store().recordScore(1, 7, 11)
      expect(store().session!.courts[0].teams).toBeNull()
      for (const id of teamB) {
        expect(store().session!.stats[id]).toMatchObject({ wins: 1, pointsFor: 11, pointsAgainst: 7, scoredGames: 1 })
      }
      for (const id of teamA) {
        expect(store().session!.stats[id]).toMatchObject({ losses: 1, pointsFor: 7, pointsAgainst: 11 })
      }
    })

    it('requeues players after a score like after a result', () => {
      store().startSession('Club', 'doubles', 1)
      checkInMany(8)
      store().startGame(1)
      store().recordScore(1, 11, 5)
      expect(store().session!.queue.slice(0, 4).sort()).toEqual([5, 6, 7, 8])
      expect(store().session!.queue.slice(4).sort()).toEqual([1, 2, 3, 4])
    })

    it('undoes a score, restoring the game in progress and its start time', () => {
      store().startSession('Club', 'doubles', 1)
      checkInMany(8)
      store().startGame(1)
      const before = store().session
      store().recordScore(1, 11, 5)
      expect(store().previous).toEqual(before)
      expect(store().undo()).toBe(true)
      expect(store().session).toEqual(before)
      expect(store().session!.stats).toEqual({})
      expect(store().session!.courts[0].startedAt).toBeDefined()
    })

    it('refuses to undo a score after another change', () => {
      store().startSession('Club', 'doubles', 1)
      checkInMany(4)
      store().startGame(1)
      store().recordScore(1, 11, 5)
      store().checkInPlayer(player(9))
      expect(store().undo()).toBe(false)
    })

    it('refuses level and out-of-range scores and changes nothing', () => {
      store().startSession('Club', 'doubles', 1)
      checkInMany(4)
      store().startGame(1)
      const before = store().session
      expect(() => store().recordScore(1, 7, 7)).toThrow(RangeError)
      expect(() => store().recordScore(1, 100, 7)).toThrow(RangeError)
      expect(store().session).toBe(before)
      expect(store().previous).toBeNull()
    })

    it('startGame stamps the court with the time, and a result adds the time played', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T10:00:00Z'))
      store().startSession('Club', 'doubles', 1)
      checkInMany(4)
      store().startGame(1)
      expect(store().session!.courts[0].startedAt).toBe(Date.parse('2026-01-01T10:00:00Z'))
      vi.setSystemTime(new Date('2026-01-01T10:07:30Z'))
      store().recordResult(1, 0)
      for (const id of [1, 2, 3, 4]) expect(store().session!.stats[id].secondsPlayed).toBe(450)
      expect(store().session!.courts[0]).not.toHaveProperty('startedAt')
    })

    it('a score adds the time played too, and undo takes it back', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T10:00:00Z'))
      store().startSession('Club', 'doubles', 1)
      checkInMany(4)
      store().startGame(1)
      vi.setSystemTime(new Date('2026-01-01T10:12:00Z'))
      store().recordScore(1, 11, 9)
      expect(store().session!.stats[1]).toMatchObject({ secondsPlayed: 720, scoredGames: 1 })
      store().undo()
      expect(store().session!.stats).toEqual({})
    })

    it('cancelling a game records no time', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T10:00:00Z'))
      store().startSession('Club', 'doubles', 1)
      checkInMany(4)
      store().startGame(1)
      vi.setSystemTime(new Date('2026-01-01T10:20:00Z'))
      store().cancelMatch(1)
      expect(store().session!.stats).toEqual({})
    })
  })

  it('unlocks partners', () => {
    store().startSession('Club', 'doubles', 1)
    checkInMany(2)
    store().lockPartners(1, 2)
    store().unlockPartners(2)
    expect(store().session!.partners).toEqual([])
  })

  it('starts a session with the chosen matchmaking mode', () => {
    store().startSession('Club', 'doubles', 1, { matchmaking: 'mixed' })
    expect(store().session!.matchmaking).toBe('mixed')
  })

  describe('managing courts', () => {
    const courts = () => store().session!.courts

    it('adds a new court open, without starting anything on it', () => {
      store().startSession('Club', 'doubles', 1)
      checkInMany(8)
      store().addCourt()
      expect(courts()).toHaveLength(2)
      expect(courts()[1].name).toBe('Court 2')
      expect(courts()[1].teams).toBeNull()
      expect(store().session!.queue).toHaveLength(8)
    })

    it('lets staff start the new court by hand', () => {
      store().startSession('Club', 'doubles', 1)
      checkInMany(8)
      store().startGame(1)
      store().addCourt()
      store().startGame(2)
      expect(courts()[1].teams?.flat().sort()).toEqual([5, 6, 7, 8])
      expect(store().session!.queue).toEqual([])
    })

    it('puts a cancelled game’s players first in the queue when a busy court closes', () => {
      store().startSession('Club', 'doubles', 2)
      checkInMany(4)
      store().startGame(1)
      store().closeCourt(1)
      expect(courts().map((c) => c.id)).toEqual([2])
      expect(courts()[0].teams).toBeNull()
      expect(store().session!.queue.slice().sort()).toEqual([1, 2, 3, 4])
    })

    it('keeps the queue order of a cancelled game’s players ahead of those still waiting', () => {
      store().startSession('Club', 'doubles', 2)
      checkInMany(5) // player 5 waits
      store().startGame(1)
      store().closeCourt(1)
      expect(courts().map((c) => c.id)).toEqual([2])
      expect(store().session!.queue.slice(0, 4).sort()).toEqual([1, 2, 3, 4])
      expect(store().session!.queue[4]).toBe(5)
    })

    it('renames and reorders courts, and results still land on the right court', () => {
      store().startSession('Club', 'doubles', 3)
      checkInMany(4)
      store().startGame(1)
      store().renameCourt(1, 'Center Court')
      store().moveCourt(1, 1)
      expect(courts().map((c) => c.name)).toEqual(['Court 2', 'Center Court', 'Court 3'])
      store().recordResult(1, 0) // by id, unaffected by the new order
      expect(courts().find((c) => c.id === 1)!.teams).toBeNull()
      expect(courts().every((c) => c.teams === null)).toBe(true)
      expect(store().session!.queue.slice().sort()).toEqual([1, 2, 3, 4])
    })

    it('lets an invalid name through as an error instead of changing anything', () => {
      store().startSession('Club', 'doubles', 2)
      expect(() => store().renameCourt(1, 'court 2')).toThrow(RangeError)
      expect(courts().map((c) => c.name)).toEqual(['Court 1', 'Court 2'])
    })

    it('every court change clears the pending result undo', () => {
      const actions: [string, () => void][] = [
        ['add', () => store().addCourt()],
        ['rename', () => store().renameCourt(1, 'Renamed')],
        ['move', () => store().moveCourt(1, 1)],
        ['close', () => store().closeCourt(2)],
      ]
      for (const [label, act] of actions) {
        store().startSession('Club', 'doubles', 2)
        checkInMany(8)
        store().startGame(1)
        store().recordResult(1, 0)
        act()
        expect(store().undo(), label).toBe(false)
      }
    })

    it('will not close the last court', () => {
      store().startSession('Club', 'doubles', 1)
      expect(() => store().closeCourt(1)).toThrow(RangeError)
      expect(courts()).toHaveLength(1)
    })
  })

  it('ends the session', () => {
    store().startSession('Club', 'singles', 1)
    store().endSession()
    expect(store().session).toBeNull()
  })
})
