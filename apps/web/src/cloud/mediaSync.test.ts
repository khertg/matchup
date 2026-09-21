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
import { getLogoSetting, getPhotoPurgePending, setLogoSetting } from '@/db/settings'
import { CloudError, type CloudApi } from './api'
import { useClubAuth } from './auth'
import { setPhotoSharing, syncMedia } from './sync'

const club = { slug: 'downtown', name: 'Downtown', token: 'tok-1' }
const PHOTO = { kind: 'photo' as const, data: 'data:image/webp;base64,QUJD' }
const EMOJI = { kind: 'emoji' as const, value: '🎾', color: '#123456' }
const INITIALS = { kind: 'initials' as const, color: '#abcdef' }

type Fn = (...args: unknown[]) => Promise<void>

function fakeApi(overrides: Partial<Record<'putLogo' | 'deleteLogo' | 'putAvatar' | 'deleteAvatar' | 'deleteAvatarPhotos', Fn>> = {}) {
  const api = {
    putLogo: vi.fn(overrides.putLogo ?? (async () => {})),
    deleteLogo: vi.fn(overrides.deleteLogo ?? (async () => {})),
    putAvatar: vi.fn(overrides.putAvatar ?? (async () => {})),
    deleteAvatar: vi.fn(overrides.deleteAvatar ?? (async () => {})),
    deleteAvatarPhotos: vi.fn(overrides.deleteAvatarPhotos ?? (async () => {})),
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

  it('keeps photos on the device while sharing is off, and takes down any the club held', async () => {
    await setRosterAvatar((await addOrGetPlayer('Ann', 3)).id, PHOTO)
    const { api, cloudApi } = fakeApi()
    await syncMedia(cloudApi)
    expect(api.putAvatar).not.toHaveBeenCalled()
    expect(api.deleteAvatar).toHaveBeenCalledWith('tok-1', 'ann')
    expect(await dirty()).toEqual([])
  })

  it('sends a photo as base64 once sharing is on', async () => {
    await setRosterAvatar((await addOrGetPlayer('Ann', 3)).id, PHOTO)
    const { api, cloudApi } = fakeApi()
    await setPhotoSharing(true, cloudApi)
    expect(api.putAvatar).toHaveBeenCalledWith('tok-1', 'ann', { kind: 'photo', photo: { data: 'QUJD' } })
    expect(api.deleteAvatarPhotos).not.toHaveBeenCalled()
  })

  it('sends photos already on the device when sharing is switched on, and only photos', async () => {
    await setRosterAvatar((await addOrGetPlayer('Ann', 3)).id, PHOTO)
    await setRosterAvatar((await addOrGetPlayer('Bob', 3)).id, EMOJI)
    const { api, cloudApi } = fakeApi()
    await syncMedia(cloudApi) // sharing off: the emoji goes, the photo does not
    api.putAvatar.mockClear()
    api.deleteAvatar.mockClear()

    await setPhotoSharing(true, cloudApi)
    expect(api.putAvatar).toHaveBeenCalledTimes(1)
    expect(api.putAvatar.mock.calls[0][1]).toBe('ann')
  })

  it('takes every photo down when sharing is switched off, and keeps emoji', async () => {
    const { api, cloudApi } = fakeApi()
    await setPhotoSharing(true, cloudApi)
    await setPhotoSharing(false, cloudApi)
    expect(api.deleteAvatarPhotos).toHaveBeenCalledTimes(1)
    expect(await getPhotoPurgePending()).toBe(false)
  })

  it('still takes the photos down later when the club could not be reached', async () => {
    const failing = fakeApi({
      deleteAvatarPhotos: async () => {
        throw new CloudError('network', 'offline')
      },
    })
    await setPhotoSharing(false, failing.cloudApi)
    expect(await getPhotoPurgePending()).toBe(true)

    const working = fakeApi()
    expect(await syncMedia(working.cloudApi)).toBe(true)
    expect(working.api.deleteAvatarPhotos).toHaveBeenCalledTimes(1)
    expect(await getPhotoPurgePending()).toBe(false)
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
