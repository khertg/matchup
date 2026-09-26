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
import {
  archiveSession,
  getHistory,
  markHistorySynced,
  purgeHistoryRecord,
  restoreHistoryRecord,
  softDeleteHistory,
  unsyncedHistory,
} from '@/db/history'
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

describe('syncHistory across clubs', () => {
  const archiveFor = (id: string, clubSlug?: string) =>
    archiveSession({ id, location: `Club ${id}`, startedAt: 1, session: someSession(), lifetimeCounted: {}, clubSlug, now: 1_000 })

  it('never sends a session that ended under another club, and sends it when that club logs in', async () => {
    await archiveFor('theirs', 'uptown')
    const { api, cloudApi } = fakeApi()

    expect(await syncHistory(cloudApi)).toBe(true) // logged in as downtown
    expect(api.putHistory).not.toHaveBeenCalled()
    expect(await unsyncedHistory('uptown')).toHaveLength(1)

    useClubAuth.setState({ club: { slug: 'uptown', name: 'Uptown', token: 'tok-2' } })
    await syncHistory(cloudApi)
    expect(api.putHistory).toHaveBeenCalledTimes(1)
    expect(api.putHistory.mock.calls[0][0]).toBe('tok-2')
    expect(await unsyncedHistory('uptown')).toHaveLength(0)
  })

  it("sends this club's own sessions and leaves the other club's alone in the same pass", async () => {
    await archiveFor('mine', 'downtown')
    await archiveFor('theirs', 'uptown')
    const { api, cloudApi } = fakeApi()
    await syncHistory(cloudApi)
    expect(api.putHistory.mock.calls.map((c) => c[1])).toEqual(['mine'])
  })

  it('gives a session from before clubs were recorded to the first club that syncs it, and no other', async () => {
    await archiveFor('old')
    const { api, cloudApi } = fakeApi()
    await syncHistory(cloudApi)
    expect(api.putHistory).toHaveBeenCalledTimes(1)
    expect((await db.history.get('old'))?.clubSlug).toBe('downtown')
    // It is now downtown's: even if it had to be sent again, it would not go to uptown.
    await db.history.update('old', { synced: false })
    useClubAuth.setState({ club: { slug: 'uptown', name: 'Uptown', token: 'tok-2' } })
    await syncHistory(cloudApi)
    expect(api.putHistory).toHaveBeenCalledTimes(1)
  })
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
    expect(await unsyncedHistory('downtown')).toHaveLength(0)
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
    expect(await unsyncedHistory('downtown')).toHaveLength(1)

    const working = fakeApi()
    expect(await syncHistory(working.cloudApi)).toBe(true)
    expect(await unsyncedHistory('downtown')).toHaveLength(0)
  })

  it('gives up on a session the server will never accept, without holding up the others', async () => {
    await archive('a', 1_000)
    await archive('b', 2_000)
    const { api, cloudApi } = fakeApi(async (_token, id) => {
      if (id === 'a') throw new CloudError('payload_too_large', 'too big')
    })
    expect(await syncHistory(cloudApi)).toBe(true)
    expect(api.putHistory).toHaveBeenCalledTimes(2)
    expect(await unsyncedHistory('downtown')).toHaveLength(0)
  })

  it('signs out and keeps everything when the login has expired', async () => {
    await archive('a', 1_000)
    const { cloudApi } = fakeApi(async () => {
      throw new CloudError('invalid_token', 'expired')
    })
    expect(await syncHistory(cloudApi)).toBe(false)
    expect(useClubAuth.getState().club).toBeNull()
    expect(await unsyncedHistory('downtown')).toHaveLength(1)
  })

  it('does nothing when signed out or without a cloud', async () => {
    await archive('a', 1_000)
    const { api, cloudApi } = fakeApi()
    useClubAuth.setState({ club: null })
    expect(await syncHistory(cloudApi)).toBe(false)
    useClubAuth.setState({ club })
    expect(await syncHistory(null)).toBe(false)
    expect(api.putHistory).not.toHaveBeenCalled()
    expect(await unsyncedHistory('downtown')).toHaveLength(1)
  })
})

describe('deletes, restores and removals made on this device', () => {
  function trashApi(failing = false) {
    const fail = async () => {
      if (failing) throw new CloudError('network')
    }
    const api = {
      putHistory: vi.fn(async () => {}),
      deleteHistory: vi.fn(fail),
      restoreHistory: vi.fn(fail),
    }
    return { api, cloudApi: api as unknown as CloudApi }
  }
  const synced = async (id: string) => {
    await archive(id, 1_000)
    await markHistorySynced(id, 'downtown')
  }

  it('are sent to the club, and then forgotten', async () => {
    await synced('a')
    await synced('b')
    await synced('c')
    await softDeleteHistory('a')
    await softDeleteHistory('b')
    await restoreHistoryRecord('b')
    await purgeHistoryRecord('c', true)
    const { api, cloudApi } = trashApi()
    expect(await syncHistory(cloudApi)).toBe(true)
    expect(api.deleteHistory.mock.calls).toEqual(
      expect.arrayContaining([
        ['tok-1', 'a', { permanent: false }],
        ['tok-1', 'c', { permanent: true }],
      ]),
    )
    expect(api.restoreHistory.mock.calls).toEqual([['tok-1', 'b']])
    expect((await getHistory('a'))?.deletionPending).toBeUndefined()
    expect((await getHistory('a'))?.deletedAt).toBeDefined() // still in Recently deleted
    expect((await getHistory('b'))?.deletionPending).toBeUndefined()
    expect(await getHistory('c')).toBeUndefined() // gone for good once the club knows
  })

  it('wait for the connection when it fails', async () => {
    await synced('a')
    await softDeleteHistory('a')
    expect(await syncHistory(trashApi(true).cloudApi)).toBe(false)
    expect((await getHistory('a'))?.deletionPending).toBe('delete')
    expect(await syncHistory(trashApi().cloudApi)).toBe(true)
    expect((await getHistory('a'))?.deletionPending).toBeUndefined()
  })

  it('send nothing about a session removed for good before the club ever had it', async () => {
    await archive('never-sent', 1_000)
    await purgeHistoryRecord('never-sent', true)
    const { api, cloudApi } = trashApi()
    await syncHistory(cloudApi)
    expect(api.putHistory).not.toHaveBeenCalled()
    expect(api.deleteHistory).toHaveBeenCalledWith('tok-1', 'never-sent', { permanent: true })
    expect(await getHistory('never-sent')).toBeUndefined()
  })
})
