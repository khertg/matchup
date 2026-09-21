import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { addOrGetPlayer, markPhotosDirty, setRosterAvatar } from './roster'
import {
  getLogoSetting,
  getPhotoPurgePending,
  getSharePhotos,
  markLogoSynced,
  setLogoSetting,
  setPhotoPurgePending,
  setSharePhotos,
} from './settings'

beforeEach(async () => {
  await db.players.clear()
  await db.settings.clear()
})

const PHOTO = { kind: 'photo' as const, data: 'data:image/webp;base64,AAAA' }
const EMOJI = { kind: 'emoji' as const, value: '🎾', color: '#123456' }

describe('roster avatars', () => {
  it('are set on the roster player, marked as not yet sent, and replaced', async () => {
    const ann = await addOrGetPlayer('Ann', 3)
    await setRosterAvatar(ann.id, EMOJI)
    expect(await db.players.get(ann.id)).toMatchObject({ avatar: EMOJI, avatarDirty: true })
    await setRosterAvatar(ann.id, PHOTO)
    expect((await db.players.get(ann.id))?.avatar).toEqual(PHOTO)
  })

  it('can be removed, which is also a change to send', async () => {
    const ann = await addOrGetPlayer('Ann', 3)
    await setRosterAvatar(ann.id, EMOJI)
    await setRosterAvatar(ann.id, null)
    const saved = await db.players.get(ann.id)
    expect(saved?.avatar).toBeUndefined()
    expect(saved?.avatarDirty).toBe(true)
  })

  it('belong to one player only, and keep skill, gender and all-time totals', async () => {
    const ann = await addOrGetPlayer('Ann', 5, 'F')
    const bob = await addOrGetPlayer('Bob', 3)
    await db.players.update(ann.id, { games: 4, wins: 3, losses: 1 })
    await setRosterAvatar(ann.id, EMOJI)
    expect(await db.players.get(ann.id)).toMatchObject({ skill: 5, gender: 'F', games: 4, wins: 3, losses: 1 })
    expect((await db.players.get(bob.id))?.avatar).toBeUndefined()
  })

  it('never travel into a session: checking a player in copies only who they are', async () => {
    const ann = await addOrGetPlayer('Ann', 3)
    await setRosterAvatar(ann.id, PHOTO)
    const again = await addOrGetPlayer('ann', 3)
    expect(Object.keys(again).sort()).toEqual(['gender', 'id', 'name', 'skill'])
  })

  it('are all marked as not sent when photo sharing is turned on, but only the photos', async () => {
    const ann = await addOrGetPlayer('Ann', 3)
    const bob = await addOrGetPlayer('Bob', 3)
    const cy = await addOrGetPlayer('Cy', 3)
    await setRosterAvatar(ann.id, PHOTO)
    await setRosterAvatar(bob.id, EMOJI)
    await db.players.toCollection().modify({ avatarDirty: false })

    await markPhotosDirty()
    expect((await db.players.get(ann.id))?.avatarDirty).toBe(true)
    expect((await db.players.get(bob.id))?.avatarDirty).toBe(false)
    expect((await db.players.get(cy.id))?.avatarDirty).toBe(false)
  })
})

describe('device settings', () => {
  it('keep the logo, marked as not sent, until it is sent', async () => {
    expect(await getLogoSetting()).toBeUndefined()
    await setLogoSetting('data:image/png;base64,AAAA')
    expect(await getLogoSetting()).toEqual({ data: 'data:image/png;base64,AAAA', dirty: true })
    await markLogoSynced()
    expect(await getLogoSetting()).toEqual({ data: 'data:image/png;base64,AAAA', dirty: false })
  })

  it('remember a removed logo until the club has been told, then forget it', async () => {
    await setLogoSetting('data:image/png;base64,AAAA')
    await markLogoSynced()
    await setLogoSetting(null)
    expect(await getLogoSetting()).toEqual({ data: null, dirty: true })
    await markLogoSynced()
    expect(await getLogoSetting()).toBeUndefined()
  })

  it('sync of nothing is fine', async () => {
    await markLogoSynced()
    expect(await getLogoSetting()).toBeUndefined()
  })

  it('share photos only once switched on, and remember a pending take-down', async () => {
    expect(await getSharePhotos()).toBe(false)
    await setSharePhotos(true)
    expect(await getSharePhotos()).toBe(true)
    await setSharePhotos(false)
    expect(await getSharePhotos()).toBe(false)

    expect(await getPhotoPurgePending()).toBe(false)
    await setPhotoPurgePending(true)
    expect(await getPhotoPurgePending()).toBe(true)
  })
})
