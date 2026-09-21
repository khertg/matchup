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
import { getPendingRenames } from '@/db/settings'
import { CloudError, type CloudApi } from './api'
import { useClubAuth } from './auth'
import { adoptClub, flushRenames, queueClubRename, syncMedia } from './sync'

const club = { slug: 'downtown', name: 'Downtown', token: 'tok-1' }
type Fn = (...args: unknown[]) => Promise<void>

function fakeApi(overrides: Partial<Record<'renamePlayer' | 'recordLifetime', Fn>> = {}) {
  const calls: string[] = []
  const api = {
    renamePlayer: vi.fn(async (...args: unknown[]) => {
      calls.push(`rename ${args[1]}>${args[2]}`)
      await overrides.renamePlayer?.(...args)
    }),
    recordLifetime: vi.fn(async (...args: unknown[]) => {
      calls.push('lifetime')
      await overrides.recordLifetime?.(...args)
    }),
    putHistory: vi.fn(async () => {}),
    putLogo: vi.fn(async () => {}),
    deleteLogo: vi.fn(async () => {}),
    putAvatar: vi.fn(async () => {}),
    deleteAvatar: vi.fn(async () => {}),
    deleteAvatarPhotos: vi.fn(async () => {}),
  }
  return { api, cloudApi: api as unknown as CloudApi, calls }
}

const batch = (name: string) => ({
  batchId: '00000000-0000-4000-8000-000000000001',
  slug: 'downtown',
  players: [{ name, games: 2, wins: 1, losses: 1 }],
})

beforeEach(async () => {
  await db.settings.clear()
  await db.players.clear()
  await db.history.clear()
  useClubAuth.setState({ club, pendingLifetime: [] })
})

describe('queueClubRename', () => {
  it('tells the club, and forgets the rename once the club has it', async () => {
    const { api, cloudApi } = fakeApi()
    await queueClubRename('Ann', 'Anne', cloudApi)
    await vi.waitFor(async () => expect(await getPendingRenames()).toEqual([]))
    expect(api.renamePlayer).toHaveBeenCalledWith('tok-1', 'Ann', 'Anne')
  })

  it('does nothing without a cloud, or when the name did not change', async () => {
    await queueClubRename('Ann', 'Anne', null)
    await queueClubRename('Ann', 'Ann', fakeApi().cloudApi)
    expect(await getPendingRenames()).toEqual([])
  })

  it('gives totals still waiting to upload the new name, so they cannot recreate the old one', async () => {
    useClubAuth.setState({ pendingLifetime: [batch('  ann ')] })
    await queueClubRename('Ann', 'Anne', fakeApi().cloudApi)
    expect(useClubAuth.getState().pendingLifetime[0].players[0].name).toBe('Anne')
  })

  it('sends the rename before the waiting totals, so the totals land on the new name', async () => {
    useClubAuth.setState({ pendingLifetime: [batch('Ann')] })
    const { calls, cloudApi } = fakeApi()
    await queueClubRename('Ann', 'Anne', cloudApi)
    await vi.waitFor(() => expect(calls).toEqual(['rename Ann>Anne', 'lifetime']))
  })
})

describe('flushRenames', () => {
  it('sends several renames in the order they were made', async () => {
    const { calls, cloudApi } = fakeApi()
    useClubAuth.setState({ club: null })
    await queueClubRename('Ann', 'Anne', cloudApi) // signed out: queued, not sent
    await queueClubRename('Anne', 'Annie', cloudApi)
    expect(calls).toEqual([])
    expect(await getPendingRenames()).toEqual([
      { from: 'Ann', to: 'Anne' },
      { from: 'Anne', to: 'Annie' },
    ])
    useClubAuth.setState({ club })
    expect(await flushRenames(cloudApi)).toBe(true)
    expect(calls).toEqual(['rename Ann>Anne', 'rename Anne>Annie'])
    expect(await getPendingRenames()).toEqual([])
  })

  it('keeps a rename for later when the connection fails, and sends it next time', async () => {
    let failing = true
    const { calls, cloudApi } = fakeApi({
      renamePlayer: async () => {
        if (failing) throw new CloudError('network')
      },
    })
    await queueClubRename('Ann', 'Anne', cloudApi)
    await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0))
    await vi.waitFor(async () => expect(await getPendingRenames()).toHaveLength(1))
    failing = false
    expect(await flushRenames(cloudApi)).toBe(true)
    expect(await getPendingRenames()).toEqual([])
  })

  it('gives up on a rename the club refuses, without holding up the others', async () => {
    const { calls, cloudApi } = fakeApi({
      renamePlayer: async (_token, from) => {
        if (from === 'Bad') throw new CloudError('invalid_request')
      },
    })
    useClubAuth.setState({ club: null })
    await queueClubRename('Bad', 'Worse', cloudApi)
    await queueClubRename('Ann', 'Anne', cloudApi)
    useClubAuth.setState({ club })
    expect(await flushRenames(cloudApi)).toBe(true)
    expect(calls).toEqual(['rename Bad>Worse', 'rename Ann>Anne'])
    expect(await getPendingRenames()).toEqual([])
  })

  it('signs out and keeps everything when the login has expired', async () => {
    const { cloudApi } = fakeApi({
      renamePlayer: async () => {
        throw new CloudError('invalid_token')
      },
    })
    useClubAuth.setState({ club: null })
    await queueClubRename('Ann', 'Anne', cloudApi)
    useClubAuth.setState({ club })
    expect(await flushRenames(cloudApi)).toBe(false)
    expect(useClubAuth.getState().club).toBeNull()
    expect(await getPendingRenames()).toHaveLength(1)
  })

  it('does nothing when signed out or without a cloud', async () => {
    const { api, cloudApi } = fakeApi()
    useClubAuth.setState({ club: null })
    expect(await flushRenames(cloudApi)).toBe(false)
    useClubAuth.setState({ club })
    expect(await flushRenames(null)).toBe(false)
    expect(api.renamePlayer).not.toHaveBeenCalled()
  })
})

describe('when a different club logs in on the same device', () => {
  it("never sends the earlier club's renames to the new club", async () => {
    await adoptClub('downtown') // this device syncs for downtown
    useClubAuth.setState({ club: null })
    await queueClubRename('Ann', 'Anne', fakeApi().cloudApi)
    expect(await getPendingRenames()).toHaveLength(1)

    useClubAuth.setState({ club: { slug: 'uptown', name: 'Uptown', token: 'tok-2' } })
    const { api, cloudApi } = fakeApi()
    expect(await flushRenames(cloudApi)).toBe(true)
    expect(api.renamePlayer).not.toHaveBeenCalled()
    expect(await getPendingRenames()).toEqual([])
  })

  it('a rename made before any club was remembered goes to the first club that syncs', async () => {
    const { api, cloudApi } = fakeApi()
    await queueClubRename('Ann', 'Anne', cloudApi)
    await vi.waitFor(() => expect(api.renamePlayer).toHaveBeenCalledTimes(1))
    await syncMedia(cloudApi)
    expect(api.renamePlayer).toHaveBeenCalledWith('tok-1', 'Ann', 'Anne')
  })
})
