import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('stages a match automatically once four players are checked in', () => {
    store().startSession('Club', 'doubles', 1)
    checkInMany(3)
    expect(store().session!.courts[0].teams).toBeNull()
    checkInMany(4)
    expect(store().session!.courts[0].teams?.flat().sort()).toEqual([1, 2, 3, 4])
    expect(store().session!.queue).toEqual([])
  })

  it('reports false when a player is checked in twice', () => {
    store().startSession('Club', 'doubles', 1)
    expect(store().checkInPlayer(player(1))).toBe(true)
    expect(store().checkInPlayer(player(1))).toBe(false)
  })

  it('requeues players after a result and refills the court from the queue', () => {
    store().startSession('Club', 'doubles', 1)
    checkInMany(8)
    store().recordResult(1, 0)
    expect(store().session!.courts[0].teams?.flat().sort()).toEqual([5, 6, 7, 8])
    expect(store().session!.queue.slice().sort()).toEqual([1, 2, 3, 4])
  })

  it('undoes the last result', () => {
    store().startSession('Club', 'doubles', 1)
    checkInMany(8)
    const before = store().session
    store().recordResult(1, 1)
    expect(store().undo()).toBe(true)
    expect(store().session).toEqual(before)
  })

  it('refuses to undo after another change so later actions are not lost', () => {
    store().startSession('Club', 'doubles', 1)
    checkInMany(8)
    store().recordResult(1, 0)
    store().checkInPlayer(player(9))
    expect(store().undo()).toBe(false)
    expect(store().session!.queue).toContain(9)
  })

  it('cancels a match without restaging it immediately', () => {
    store().startSession('Club', 'doubles', 1)
    checkInMany(4)
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
    store().recordResult(1, 0)
    store().setAvgGameMinutes(30)
    expect(store().undo()).toBe(true)
    expect(store().session!.avgGameMinutes).toBe(30)
    expect(store().session!.courts[0].teams?.flat().sort()).toEqual([1, 2, 3, 4])
  })

  it('replaces a playing player with a chosen waiting one', () => {
    store().startSession('Club', 'doubles', 1)
    checkInMany(6)
    store().replacePlayer(1, 1, 6)
    expect(store().session!.courts[0].teams!.flat()).toContain(6)
    expect(store().session!.onBreak).toEqual([1])
    expect(store().session!.queue).toEqual([5])
  })

  it('stages a match with the locked pair on one team once four players are in', () => {
    store().startSession('Club', 'doubles', 1)
    checkInMany(3)
    store().lockPartners(1, 3)
    expect(store().session!.courts[0].teams).toBeNull()
    store().checkInPlayer(player(4))
    const teams = store().session!.courts[0].teams!
    expect(teams.some((t) => t.includes(1) && t.includes(3))).toBe(true)
  })

  it('starts an open mixed court by hand', () => {
    store().startSession('Club', 'doubles', 1, { matchmaking: 'mixed' })
    for (let id = 1; id <= 4; id++) {
      store().checkInPlayer({ id, name: `P${id}`, skill: 3, gender: 'M' })
    }
    expect(store().session!.courts[0].teams).toBeNull()
    store().startCourt(1)
    expect(store().session!.courts[0].teams!.flat().sort()).toEqual([1, 2, 3, 4])
  })

  it('tracks stats per result and undo reverts them', () => {
    store().startSession('Club', 'doubles', 1)
    checkInMany(4)
    store().recordResult(1, 0)
    expect(Object.keys(store().session!.stats)).toHaveLength(4)
    expect(store().undo()).toBe(true)
    expect(store().session!.stats).toEqual({})
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

  it('ends the session', () => {
    store().startSession('Club', 'singles', 1)
    store().endSession()
    expect(store().session).toBeNull()
  })
})
