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

  it('ends the session', () => {
    store().startSession('Club', 'singles', 1)
    store().endSession()
    expect(store().session).toBeNull()
  })
})
