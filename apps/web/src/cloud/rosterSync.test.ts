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

import type { ClubRosterPlayer } from '@q2dink/shared'
import { db } from '@/db/db'
import { addOrGetPlayer, listRoster, mergeClubRoster, renameRosterPlayer, setRosterSkill } from '@/db/roster'
import { CloudError, type CloudApi } from './api'
import { useClubAuth } from './auth'
import { syncRoster } from './sync'

const downtown = { slug: 'downtown', name: 'Downtown', token: 'tok-1' }
const uptown = { slug: 'uptown', name: 'Uptown', token: 'tok-2' }

/** A club server holding one roster per token, like the real one keyed by lower-case name. */
function fakeApi(options: { putRoster?: (players: ClubRosterPlayer[]) => Promise<void> } = {}) {
  const rosters = new Map<string, Map<string, ClubRosterPlayer>>()
  const club = (token: string) => rosters.get(token) ?? rosters.set(token, new Map()).get(token)!
  const sent: ClubRosterPlayer[][] = []
  const api = {
    renamePlayer: vi.fn(async () => {}),
    putRoster: vi.fn(async (token: string, players: ClubRosterPlayer[]) => {
      sent.push(players)
      await options.putRoster?.(players)
      for (const p of players) club(token).set(p.name.toLowerCase(), p)
    }),
    fetchRoster: vi.fn(async (token: string) => [...club(token).values()]),
  }
  return { api, cloudApi: api as unknown as CloudApi, sent, club }
}

const names = async (slug: string | undefined) => (await listRoster(slug)).map((p) => p.name)

beforeEach(async () => {
  await db.settings.clear()
  await db.players.clear()
  useClubAuth.setState({ club: downtown, pendingLifetime: [] })
})

describe('a club roster', () => {
  it('lists only the club’s own players; a name can be saved once per club', async () => {
    await addOrGetPlayer('Ann', 3, undefined, 'downtown')
    await addOrGetPlayer('Bob', 2, undefined, 'downtown')
    const other = await addOrGetPlayer('ann', 5, undefined, 'uptown')
    expect(await names('downtown')).toEqual(['Ann', 'Bob'])
    expect(await names('uptown')).toEqual(['ann'])
    expect(other.skill).toBe(5)
    expect((await addOrGetPlayer('ANN', 5, undefined, 'uptown')).id).toBe(other.id)
    expect(await db.players.count()).toBe(3)
  })

  it('without a club (no cloud) lists just the players no club has taken', async () => {
    await addOrGetPlayer('Ann', 3)
    await addOrGetPlayer('Bob', 3, undefined, 'downtown')
    expect(await names(undefined)).toEqual(['Ann'])
  })

  it('checks a rename against the player’s own club only', async () => {
    const ann = await addOrGetPlayer('Ann', 3, undefined, 'downtown')
    await addOrGetPlayer('Bob', 3, undefined, 'uptown')
    await expect(renameRosterPlayer(ann.id, 'Bob')).resolves.toEqual({ from: 'Ann', to: 'Bob' })
    await addOrGetPlayer('Cy', 3, undefined, 'downtown')
    await expect(renameRosterPlayer(ann.id, 'cy')).rejects.toThrow(RangeError)
  })
})

describe('mergeClubRoster', () => {
  it('adds the club’s new players and takes its changes, but keeps changes not yet sent', async () => {
    const ann = await addOrGetPlayer('Ann', 3, undefined, 'downtown')
    const bob = await addOrGetPlayer('Bob', 3, undefined, 'downtown')
    await db.players.update(ann.id, { rosterDirty: false, avatar: { kind: 'emoji', value: '🎾', color: '#123456' }, games: 7 })
    await mergeClubRoster('downtown', [
      { name: 'ANN', skill: 5, gender: 'F' },
      { name: 'bob', skill: 1 },
      { name: 'Cy', skill: 4, gender: 'M' },
    ])
    const [a, b, c] = await listRoster('downtown')
    expect(a).toMatchObject({ id: ann.id, name: 'Ann', skill: 5, gender: 'F', games: 7, avatar: { kind: 'emoji' } })
    expect(b).toMatchObject({ id: bob.id, skill: 3, rosterDirty: true })
    expect(c).toMatchObject({ name: 'Cy', skill: 4, gender: 'M', clubSlug: 'downtown', rosterDirty: false })
    expect(await names('uptown')).toEqual([])
  })
})

describe('syncRoster', () => {
  it('takes the players no club had yet, sends them, and marks them sent', async () => {
    await addOrGetPlayer('Ann', 3, 'F')
    await addOrGetPlayer('Bob', 2)
    const { cloudApi, sent } = fakeApi()
    expect(await syncRoster(cloudApi)).toBe(true)
    expect(sent).toEqual([[{ name: 'Ann', skill: 3, gender: 'F' }, { name: 'Bob', skill: 2 }]])
    expect(await names('downtown')).toEqual(['Ann', 'Bob'])
    expect((await db.players.toArray()).every((p) => p.rosterDirty === false)).toBe(true)

    // Nothing changed: nothing is sent again.
    await syncRoster(cloudApi)
    expect(sent).toHaveLength(1)
  })

  it('sends only what changed, and brings in what another device of the club saved', async () => {
    const { cloudApi, sent, club } = fakeApi()
    const ann = await addOrGetPlayer('Ann', 3, undefined, 'downtown')
    await syncRoster(cloudApi)
    club('tok-1').set('dee', { name: 'Dee', skill: 6 })
    await setRosterSkill(ann.id, 4)
    await syncRoster(cloudApi)
    expect(sent.at(-1)).toEqual([{ name: 'Ann', skill: 4 }])
    expect(await names('downtown')).toEqual(['Ann', 'Dee'])
  })

  it('never sends one club’s players to another, and files what it brings in under the club signed in', async () => {
    await addOrGetPlayer('Ann', 3, undefined, 'downtown')
    const { cloudApi, sent, club } = fakeApi()
    club('tok-2').set('zed', { name: 'Zed', skill: 2 })
    useClubAuth.setState({ club: uptown })
    await syncRoster(cloudApi)
    expect(sent).toEqual([])
    expect(await names('uptown')).toEqual(['Zed'])
    expect(await names('downtown')).toEqual(['Ann'])
  })

  it('keeps a player marked when they changed again while being sent', async () => {
    const ann = await addOrGetPlayer('Ann', 3, undefined, 'downtown')
    const { cloudApi } = fakeApi({ putRoster: () => setRosterSkill(ann.id, 6) })
    await syncRoster(cloudApi)
    expect(await db.players.get(ann.id)).toMatchObject({ skill: 6, rosterDirty: true })
  })

  it('keeps changes for later when the club cannot be reached', async () => {
    await addOrGetPlayer('Ann', 3, undefined, 'downtown')
    const { cloudApi } = fakeApi({ putRoster: () => Promise.reject(new CloudError('network', 'offline')) })
    expect(await syncRoster(cloudApi)).toBe(false)
    expect((await listRoster('downtown'))[0].rosterDirty).toBe(true)
  })
})
