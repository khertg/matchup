import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The stores persist to localStorage; give the node test environment a tiny in-memory one.
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

import type { RosterPlayer } from '@/rotation/types'
import { useSessionStore } from '@/store/session'
import { CloudError, type CloudApi } from './api'
import { useClubAuth } from './auth'
import { flushPendingLifetime, startCloudSync, useSyncStore } from './sync'

const club = { slug: 'downtown', name: 'Downtown', token: 'tok-1' }

type AsyncMock = ReturnType<typeof vi.fn<(...args: unknown[]) => Promise<void>>>

function fakeApi(overrides: { publish?: AsyncMock; clear?: AsyncMock; recordLifetime?: AsyncMock } = {}) {
  const api = {
    publish: overrides.publish ?? vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
    clear: overrides.clear ?? vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
    recordLifetime:
      overrides.recordLifetime ?? vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  }
  return { api, cloudApi: api as unknown as CloudApi }
}

const player = (id: number): RosterPlayer => ({ id, name: `P${id}`, skill: 3, gender: 'F' })
const session = () => useSessionStore.getState()

let listeners: Map<string, Set<() => void>>
const online = { value: true }

beforeEach(() => {
  vi.useFakeTimers()
  listeners = new Map()
  online.value = true
  vi.stubGlobal('navigator', { get onLine() { return online.value } })
  vi.stubGlobal('window', {
    addEventListener: (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(fn)
    },
    removeEventListener: (type: string, fn: () => void) => listeners.get(type)?.delete(fn),
  })
  const fire = (type: string) => listeners.get(type)?.forEach((fn) => fn())
  ;(globalThis as { fire?: (t: string) => void }).fire = fire

  useSessionStore.setState({ location: '', session: null, previous: null })
  useClubAuth.setState({ club: null, pendingLifetime: [] })
  useSyncStore.setState({ status: 'off' })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const fire = (type: string) => (globalThis as unknown as { fire: (t: string) => void }).fire(type)

describe('flushPendingLifetime', () => {
  const batch = (batchId: string, slug = 'downtown') => ({
    batchId,
    slug,
    players: [{ name: 'Ann', games: 2, wins: 2, losses: 0 }],
  })

  it('sends this club\'s queued totals once and removes them', async () => {
    const { api, cloudApi } = fakeApi()
    useClubAuth.setState({ club, pendingLifetime: [batch('a'), batch('b'), batch('other', 'elsewhere')] })

    expect(await flushPendingLifetime(cloudApi)).toBe(true)
    expect(api.recordLifetime).toHaveBeenCalledTimes(2)
    expect(api.recordLifetime).toHaveBeenCalledWith('tok-1', 'a', batch('a').players)
    expect(useClubAuth.getState().pendingLifetime.map((p) => p.batchId)).toEqual(['other'])
  })

  it('keeps totals queued when the network fails, so a later retry can send them', async () => {
    const { cloudApi } = fakeApi({
      recordLifetime: vi.fn(async () => {
        throw new CloudError('network')
      }),
    })
    useClubAuth.setState({ club, pendingLifetime: [batch('a')] })

    expect(await flushPendingLifetime(cloudApi)).toBe(false)
    expect(useClubAuth.getState().pendingLifetime).toHaveLength(1)
    expect(useClubAuth.getState().club).not.toBeNull()
  })

  it('signs out when the club login has expired', async () => {
    const { cloudApi } = fakeApi({
      recordLifetime: vi.fn(async () => {
        throw new CloudError('invalid_token')
      }),
    })
    useClubAuth.setState({ club, pendingLifetime: [batch('a')] })

    await flushPendingLifetime(cloudApi)
    expect(useClubAuth.getState().club).toBeNull()
  })

  it('does nothing when signed out or when cloud is not configured', async () => {
    const { api, cloudApi } = fakeApi()
    useClubAuth.setState({ club: null, pendingLifetime: [batch('a')] })
    expect(await flushPendingLifetime(cloudApi)).toBe(false)
    expect(await flushPendingLifetime(null)).toBe(false)
    expect(api.recordLifetime).not.toHaveBeenCalled()
  })
})

describe('startCloudSync', () => {
  it('does nothing without cloud credentials', () => {
    expect(startCloudSync(null)()).toBeUndefined()
  })

  it('publishes session changes while signed in, without private details', async () => {
    const { api, cloudApi } = fakeApi()
    useClubAuth.setState({ club })
    const stop = startCloudSync(cloudApi)

    session().startSession('Downtown Open', 'doubles', 1)
    session().checkInPlayer(player(1))
    await vi.advanceTimersByTimeAsync(500)

    expect(api.publish).toHaveBeenCalledTimes(1)
    const [token, publicSnap, backup] = api.publish.mock.calls[0] as unknown as [string, { location: string }, { session: unknown }]
    expect(token).toBe('tok-1')
    expect(publicSnap.location).toBe('Downtown Open')
    expect(JSON.stringify(publicSnap)).not.toContain('gender')
    expect(JSON.stringify(backup)).toContain('gender') // the private backup keeps everything
    expect(useSyncStore.getState().status).toBe('synced')
    stop()
  })

  it('publishes nothing while signed out', async () => {
    const { api, cloudApi } = fakeApi()
    const stop = startCloudSync(cloudApi)
    session().startSession('Local only', 'doubles', 1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(api.publish).not.toHaveBeenCalled()
    expect(useSyncStore.getState().status).toBe('off')
    stop()
  })

  it('publishes an already-running session as soon as staff sign in', async () => {
    const { api, cloudApi } = fakeApi()
    const stop = startCloudSync(cloudApi)
    session().startSession('Started offline', 'doubles', 1)

    useClubAuth.getState().signIn(club)
    await vi.advanceTimersByTimeAsync(500)
    expect(api.publish).toHaveBeenCalledTimes(1)
    stop()
  })

  it('never clears the cloud session just because a device with no session signs in', async () => {
    const { api, cloudApi } = fakeApi()
    const stop = startCloudSync(cloudApi)
    useClubAuth.getState().signIn(club)
    await vi.advanceTimersByTimeAsync(5000)
    expect(api.clear).not.toHaveBeenCalled()
    expect(api.publish).not.toHaveBeenCalled()
    stop()
  })

  it('clears the live session when the session ends', async () => {
    const { api, cloudApi } = fakeApi()
    useClubAuth.setState({ club })
    const stop = startCloudSync(cloudApi)
    session().startSession('Club', 'doubles', 1)
    await vi.advanceTimersByTimeAsync(500)

    session().endSession()
    await vi.advanceTimersByTimeAsync(500)
    expect(api.clear).toHaveBeenCalledWith('tok-1')
    stop()
  })

  it('signs out and stops retrying when the login has expired', async () => {
    const { api, cloudApi } = fakeApi({
      publish: vi.fn(async () => {
        throw new CloudError('invalid_token')
      }),
    })
    useClubAuth.setState({ club })
    const stop = startCloudSync(cloudApi)
    session().startSession('Club', 'doubles', 1)
    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(60_000)

    expect(useClubAuth.getState().club).toBeNull()
    expect(api.publish).toHaveBeenCalledTimes(1)
    stop()
  })

  it('waits while offline and publishes the latest state when the connection returns', async () => {
    const { api, cloudApi } = fakeApi()
    useClubAuth.setState({ club })
    const stop = startCloudSync(cloudApi)

    online.value = false
    session().startSession('Offline Club', 'doubles', 1)
    session().checkInPlayer(player(1))
    session().checkInPlayer(player(2))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(api.publish).not.toHaveBeenCalled()
    expect(useSyncStore.getState().status).toBe('offline')

    online.value = true
    fire('online')
    await vi.advanceTimersByTimeAsync(0)
    expect(api.publish).toHaveBeenCalledTimes(1)
    const backup = api.publish.mock.calls[0][2] as unknown as { session: { queue: number[] } }
    expect(backup.session.queue).toEqual([1, 2])
    stop()
  })

  it('stops publishing once stopped', async () => {
    const { api, cloudApi } = fakeApi()
    useClubAuth.setState({ club })
    const stop = startCloudSync(cloudApi)
    stop()
    session().startSession('Club', 'doubles', 1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(api.publish).not.toHaveBeenCalled()
  })
})
