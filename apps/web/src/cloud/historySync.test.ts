import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import { db } from '@/db/db'
import { archiveSession, unsyncedHistory } from '@/db/history'
import { checkIn, createSession } from '@/rotation/engine'
import { CloudError, type CloudApi } from './api'
import { useClubAuth } from './auth'
import { syncHistory } from './sync'

const club = { slug: 'downtown', name: 'Downtown', token: 'tok-1' }

function someSession() {
  let s = createSession('doubles', 1)
  for (let id = 1; id <= 4; id++) s = checkIn(s, { id, name: `P${id}`, skill: 3 })
  return s
}

const archive = (id: string, now: number) =>
  archiveSession({ id, location: `Club ${id}`, startedAt: 1, session: someSession(), lifetimeCounted: {}, now })

function fakeApi(putHistory: (...args: unknown[]) => Promise<void> = async () => {}) {
  const api = { putHistory: vi.fn(putHistory) }
  return { api, cloudApi: api as unknown as CloudApi }
}

beforeEach(async () => {
  await db.history.clear()
  useClubAuth.setState({ club, pendingLifetime: [] })
})

describe('syncHistory', () => {
  it('sends every session the club does not have, and marks them sent', async () => {
    await archive('a', 1_000)
    await archive('b', 2_000)
    const { api, cloudApi } = fakeApi()

    expect(await syncHistory(cloudApi)).toBe(true)
    expect(api.putHistory).toHaveBeenCalledTimes(2)
    const [token, id, entry, backup] = api.putHistory.mock.calls[0] as [string, string, Record<string, unknown>, Record<string, unknown>]
    expect(token).toBe('tok-1')
    expect(['a', 'b']).toContain(id)
    expect(entry).toMatchObject({ mode: 'doubles', players: 4, games: 0 })
    expect(new Date(entry.endedAt as string).toISOString()).toBe(entry.endedAt)
    expect(backup).toMatchObject({ schemaVersion: 1, lifetimeCounted: {} })
    expect(await unsyncedHistory()).toHaveLength(0)
  })

  it('sends nothing the second time', async () => {
    await archive('a', 1_000)
    const { api, cloudApi } = fakeApi()
    await syncHistory(cloudApi)
    await syncHistory(cloudApi)
    expect(api.putHistory).toHaveBeenCalledTimes(1)
  })

  it('sends a session again when it ends again after being resumed', async () => {
    await archive('a', 1_000)
    const { api, cloudApi } = fakeApi()
    await syncHistory(cloudApi)
    await archive('a', 9_000) // resumed, played, ended again: same id, replaced, not yet sent
    await syncHistory(cloudApi)
    expect(api.putHistory).toHaveBeenCalledTimes(2)
    expect(await db.history.count()).toBe(1)
  })

  it('leaves a session for later when the connection fails, and reports it', async () => {
    await archive('a', 1_000)
    const { cloudApi } = fakeApi(async () => {
      throw new CloudError('network', 'offline')
    })
    expect(await syncHistory(cloudApi)).toBe(false)
    expect(await unsyncedHistory()).toHaveLength(1)

    const working = fakeApi()
    expect(await syncHistory(working.cloudApi)).toBe(true)
    expect(await unsyncedHistory()).toHaveLength(0)
  })

  it('gives up on a session the server will never accept, without holding up the others', async () => {
    await archive('a', 1_000)
    await archive('b', 2_000)
    const { api, cloudApi } = fakeApi(async (_token, id) => {
      if (id === 'a') throw new CloudError('payload_too_large', 'too big')
    })
    expect(await syncHistory(cloudApi)).toBe(true)
    expect(api.putHistory).toHaveBeenCalledTimes(2)
    expect(await unsyncedHistory()).toHaveLength(0)
  })

  it('signs out and keeps everything when the login has expired', async () => {
    await archive('a', 1_000)
    const { cloudApi } = fakeApi(async () => {
      throw new CloudError('invalid_token', 'expired')
    })
    expect(await syncHistory(cloudApi)).toBe(false)
    expect(useClubAuth.getState().club).toBeNull()
    expect(await unsyncedHistory()).toHaveLength(1)
  })

  it('does nothing when signed out or without a cloud', async () => {
    await archive('a', 1_000)
    const { api, cloudApi } = fakeApi()
    useClubAuth.setState({ club: null })
    expect(await syncHistory(cloudApi)).toBe(false)
    useClubAuth.setState({ club })
    expect(await syncHistory(null)).toBe(false)
    expect(api.putHistory).not.toHaveBeenCalled()
    expect(await unsyncedHistory()).toHaveLength(1)
  })
})
