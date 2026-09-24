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
import { addOrGetPlayer, setRosterAvatar } from '@/db/roster'
import {
  getLogoSetting,
  getPhotoSharingPending,
  getSharePhotos,
  getSyncClub,
  setLogoSetting,
  setSharePhotos,
} from '@/db/settings'
import { CloudError, type CloudApi } from './api'
import { useClubAuth } from './auth'
import { adoptClub, setPhotoSharing, syncMedia } from './sync'

const club = { slug: 'downtown', name: 'Downtown', token: 'tok-1' }
const PHOTO = { kind: 'photo' as const, data: 'data:image/webp;base64,QUJD' }
const EMOJI = { kind: 'emoji' as const, value: '🎾', color: '#123456' }
const INITIALS = { kind: 'initials' as const, color: '#abcdef' }

type Fn = (...args: unknown[]) => Promise<void>

function fakeApi(overrides: Partial<Record<'putLogo' | 'deleteLogo' | 'putAvatar' | 'deleteAvatar' | 'putPhotoSharing', Fn>> = {}) {
  const api = {
    putLogo: vi.fn(overrides.putLogo ?? (async () => {})),
    deleteLogo: vi.fn(overrides.deleteLogo ?? (async () => {})),
    putAvatar: vi.fn(overrides.putAvatar ?? (async () => {})),
    deleteAvatar: vi.fn(overrides.deleteAvatar ?? (async () => {})),
    putPhotoSharing: vi.fn(overrides.putPhotoSharing ?? (async () => {})),
  }
  return { api, cloudApi: api as unknown as CloudApi }
}

const dirty = async () => (await db.players.filter((p) => p.avatarDirty === true).toArray()).map((p) => p.name)

beforeEach(async () => {
  await db.players.clear()
  await db.settings.clear()
  useClubAuth.setState({ club, pendingLifetime: [] })
})

describe('syncMedia', () => {
  it('sends emoji and initials avatars, by lower-case name, and marks them sent', async () => {
    await setRosterAvatar((await addOrGetPlayer('Ann Lee', 3)).id, EMOJI)
    await setRosterAvatar((await addOrGetPlayer('Bob', 3)).id, INITIALS)
    const { api, cloudApi } = fakeApi()

    expect(await syncMedia(cloudApi)).toBe(true)
    expect(api.putAvatar).toHaveBeenCalledWith('tok-1', 'ann lee', { kind: 'emoji', emoji: '🎾', color: '#123456' })
    expect(api.putAvatar).toHaveBeenCalledWith('tok-1', 'bob', { kind: 'initials', color: '#abcdef' })
    expect(await dirty()).toEqual([])
  })

  it('sends nothing the second time', async () => {
    await setRosterAvatar((await addOrGetPlayer('Ann', 3)).id, EMOJI)
    const { api, cloudApi } = fakeApi()
    await syncMedia(cloudApi)
    await syncMedia(cloudApi)
    expect(api.putAvatar).toHaveBeenCalledTimes(1)
  })

  it('sends photos as base64 whether or not the live page shows them, for the club’s other staff devices', async () => {
    await setRosterAvatar((await addOrGetPlayer('Ann', 3)).id, PHOTO)
    const { api, cloudApi } = fakeApi()
    expect(await getSharePhotos()).toBe(false)
    await syncMedia(cloudApi)
    expect(api.putAvatar).toHaveBeenCalledWith('tok-1', 'ann', { kind: 'photo', photo: { data: 'QUJD' } })
    expect(api.deleteAvatar).not.toHaveBeenCalled()
    expect(await dirty()).toEqual([])
  })

  it('sends, once per club, the photos that stayed on the device while they only went with sharing on', async () => {
    const ann = await addOrGetPlayer('Ann', 3, undefined, 'downtown')
    await setRosterAvatar(ann.id, PHOTO)
    await setRosterAvatar((await addOrGetPlayer('Bob', 3, undefined, 'downtown')).id, EMOJI)
    await db.players.toCollection().modify({ avatarDirty: false }) // as an older version left them

    const { api, cloudApi } = fakeApi()
    await syncMedia(cloudApi)
    expect(api.putAvatar).toHaveBeenCalledTimes(1)
    expect(api.putAvatar.mock.calls[0][1]).toBe('ann')
    await syncMedia(cloudApi)
    expect(api.putAvatar).toHaveBeenCalledTimes(1)
  })

  it('tells the club when the photo switch changes, and deletes nothing', async () => {
    const { api, cloudApi } = fakeApi()
    await setPhotoSharing(true, cloudApi)
    await setPhotoSharing(false, cloudApi)
    expect(api.putPhotoSharing.mock.calls.map((c) => c[1])).toEqual([true, false])
    expect(api.deleteAvatar).not.toHaveBeenCalled()
    expect(await getPhotoSharingPending()).toBe(false)
  })

  it('still tells the club later when it could not be reached', async () => {
    const failing = fakeApi({
      putPhotoSharing: async () => {
        throw new CloudError('network', 'offline')
      },
    })
    await setPhotoSharing(true, failing.cloudApi)
    expect(await getPhotoSharingPending()).toBe(true)

    const working = fakeApi()
    expect(await syncMedia(working.cloudApi)).toBe(true)
    expect(working.api.putPhotoSharing).toHaveBeenCalledWith('tok-1', true)
    expect(await getPhotoSharingPending()).toBe(false)
  })

  it('sends a removed avatar as a removal', async () => {
    const ann = await addOrGetPlayer('Ann', 3)
    await setRosterAvatar(ann.id, EMOJI)
    await setRosterAvatar(ann.id, null)
    const { api, cloudApi } = fakeApi()
    await syncMedia(cloudApi)
    expect(api.deleteAvatar).toHaveBeenCalledWith('tok-1', 'ann')
    expect(api.putAvatar).not.toHaveBeenCalled()
  })

  it('sends the logo, and a removed logo as a removal, then forgets the pending change', async () => {
    await setLogoSetting('data:image/png;base64,QUJD')
    const first = fakeApi()
    await syncMedia(first.cloudApi)
    expect(first.api.putLogo).toHaveBeenCalledWith('tok-1', 'QUJD')
    expect((await getLogoSetting())?.dirty).toBe(false)

    await setLogoSetting(null)
    const second = fakeApi()
    await syncMedia(second.cloudApi)
    expect(second.api.deleteLogo).toHaveBeenCalledWith('tok-1')
    expect(await getLogoSetting()).toBeUndefined()
  })

  it('leaves changes for later when the connection fails, and reports it', async () => {
    await setRosterAvatar((await addOrGetPlayer('Ann', 3)).id, EMOJI)
    await setLogoSetting('data:image/png;base64,QUJD')
    const failing = fakeApi({
      putLogo: async () => {
        throw new CloudError('network', 'offline')
      },
    })
    expect(await syncMedia(failing.cloudApi)).toBe(false)
    expect(await dirty()).toEqual(['Ann'])
    expect((await getLogoSetting())?.dirty).toBe(true)

    const working = fakeApi()
    expect(await syncMedia(working.cloudApi)).toBe(true)
    expect(await dirty()).toEqual([])
    expect((await getLogoSetting())?.dirty).toBe(false)
  })

  it('gives up on an avatar the server will never accept, without holding up the others', async () => {
    await setRosterAvatar((await addOrGetPlayer('Ann', 3)).id, EMOJI)
    await setRosterAvatar((await addOrGetPlayer('Bob', 3)).id, INITIALS)
    const { api, cloudApi } = fakeApi({
      putAvatar: async (_token, key) => {
        if (key === 'ann') throw new CloudError('payload_too_large', 'full')
      },
    })
    expect(await syncMedia(cloudApi)).toBe(true)
    expect(api.putAvatar).toHaveBeenCalledTimes(2)
    expect(await dirty()).toEqual([])
  })

  it('signs out and keeps everything when the login has expired', async () => {
    await setRosterAvatar((await addOrGetPlayer('Ann', 3)).id, EMOJI)
    const { cloudApi } = fakeApi({
      putAvatar: async () => {
        throw new CloudError('invalid_token', 'expired')
      },
    })
    expect(await syncMedia(cloudApi)).toBe(false)
    expect(useClubAuth.getState().club).toBeNull()
    expect(await dirty()).toEqual(['Ann'])
  })

  it('does not lose an avatar that was changed again while the first was being sent', async () => {
    const ann = await addOrGetPlayer('Ann', 3)
    await setRosterAvatar(ann.id, EMOJI)
    const { cloudApi } = fakeApi({
      putAvatar: async () => {
        await setRosterAvatar(ann.id, INITIALS) // changed again mid-send
      },
    })
    await syncMedia(cloudApi)
    expect(await dirty()).toEqual(['Ann'])
    const again = fakeApi()
    await syncMedia(again.cloudApi)
    expect(again.api.putAvatar).toHaveBeenCalledWith('tok-1', 'ann', { kind: 'initials', color: '#abcdef' })
    expect(await dirty()).toEqual([])
  })

  it('does nothing when signed out or without a cloud', async () => {
    await setRosterAvatar((await addOrGetPlayer('Ann', 3)).id, EMOJI)
    const { api, cloudApi } = fakeApi()
    useClubAuth.setState({ club: null })
    expect(await syncMedia(cloudApi)).toBe(false)
    useClubAuth.setState({ club })
    expect(await syncMedia(null)).toBe(false)
    expect(api.putAvatar).not.toHaveBeenCalled()
    expect(await dirty()).toEqual(['Ann'])
  })
})

describe('when a different club logs in on the same device', () => {
  const uptown = { slug: 'uptown', name: 'Uptown', token: 'tok-2' }

  it('the first club to sync takes the pending changes and is remembered', async () => {
    await setRosterAvatar((await addOrGetPlayer('Ann', 3)).id, EMOJI)
    const { api, cloudApi } = fakeApi()
    await syncMedia(cloudApi)
    expect(api.putAvatar).toHaveBeenCalledTimes(1)
    expect(await getSyncClub()).toBe('downtown')
  })

  it("never sends the earlier club's unsent avatars or logo to the new club", async () => {
    await syncMedia(fakeApi().cloudApi) // downtown is now the club this device syncs for
    await setRosterAvatar((await addOrGetPlayer('Ann', 3)).id, EMOJI)
    await setLogoSetting('data:image/png;base64,QUJD')
    await setSharePhotos(true)

    useClubAuth.setState({ club: uptown })
    const { api, cloudApi } = fakeApi()
    expect(await syncMedia(cloudApi)).toBe(true)
    expect(api.putAvatar).not.toHaveBeenCalled()
    expect(api.putLogo).not.toHaveBeenCalled()
    expect(api.deleteAvatar).not.toHaveBeenCalled()
    expect(await dirty()).toEqual([])
    expect((await getLogoSetting())?.dirty).toBe(false)
    expect(await getSyncClub()).toBe('uptown')
    // The new club starts with photos private, and the earlier club's choice is not carried over.
    expect(await getSharePhotos()).toBe(false)
  })

  it("still sends what the new club's own staff change afterwards", async () => {
    await syncMedia(fakeApi().cloudApi)
    useClubAuth.setState({ club: uptown })
    await syncMedia(fakeApi().cloudApi)
    await setRosterAvatar((await addOrGetPlayer('Bob', 3)).id, INITIALS)
    const { api, cloudApi } = fakeApi()
    await syncMedia(cloudApi)
    expect(api.putAvatar).toHaveBeenCalledWith('tok-2', 'bob', { kind: 'initials', color: '#abcdef' })
  })

  it('the same club logging back in keeps its pending changes and its photo choice', async () => {
    await syncMedia(fakeApi().cloudApi)
    await setSharePhotos(true)
    await setRosterAvatar((await addOrGetPlayer('Ann', 3)).id, EMOJI)
    await adoptClub('downtown')
    expect(await dirty()).toEqual(['Ann'])
    expect(await getSharePhotos()).toBe(true)
  })

  it('keeps a photo switch the club has not heard of while the same club is still the one syncing', async () => {
    await syncMedia(fakeApi().cloudApi)
    const failing = fakeApi({
      putPhotoSharing: async () => {
        throw new CloudError('network')
      },
    })
    await setPhotoSharing(true, failing.cloudApi)
    await adoptClub('downtown')
    expect(await getPhotoSharingPending()).toBe(true)

    // A different club never gets the earlier club's switch.
    await adoptClub('uptown')
    expect(await getPhotoSharingPending()).toBe(false)
  })
})
