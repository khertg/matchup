import { db } from './db'

/** The club logo kept on this device. `data` is a small data URL, or null once the logo was removed. */
export interface LogoSetting {
  data: string | null
  /** The club's cloud copy is out of date (changed or removed here, not yet sent). */
  dirty: boolean
}

const LOGO = 'logo'
const SHARE_PHOTOS = 'sharePhotos'

export async function getLogoSetting(): Promise<LogoSetting | undefined> {
  return (await db.settings.get(LOGO))?.value as LogoSetting | undefined
}

/** Set (a data URL) or remove (null) the club logo, and mark the club's copy as out of date. */
export async function setLogoSetting(data: string | null): Promise<void> {
  await db.settings.put({ key: LOGO, value: { data, dirty: true } satisfies LogoSetting })
}

/** The club now has this logo (or none): forget the pending change. A removed logo leaves no record. */
export async function markLogoSynced(): Promise<void> {
  const current = await getLogoSetting()
  if (!current) return
  if (current.data === null) await db.settings.delete(LOGO)
  else await db.settings.put({ key: LOGO, value: { ...current, dirty: false } satisfies LogoSetting })
}

/**
 * Whether player photos are also shown on the club's public live page. A club-wide setting: this is
 * this device's copy, refreshed from the club on every sync. Off unless staff turn it on.
 */
export async function getSharePhotos(): Promise<boolean> {
  return (await db.settings.get(SHARE_PHOTOS))?.value === true
}

export async function setSharePhotos(on: boolean): Promise<void> {
  await db.settings.put({ key: SHARE_PHOTOS, value: on })
}

const PHOTO_SHARING_PENDING = 'photoSharingPending'

/** The photo switch was changed here and the club has not been told yet. */
export async function getPhotoSharingPending(): Promise<boolean> {
  return (await db.settings.get(PHOTO_SHARING_PENDING))?.value === true
}

export async function setPhotoSharingPending(pending: boolean): Promise<void> {
  await db.settings.put({ key: PHOTO_SHARING_PENDING, value: pending })
}

const PHOTOS_SENT_FOR = 'photosSentFor'

/**
 * Clubs this device has sent all its players' photos to. Photos used to stay on the device while the
 * club did not show them publicly; each club gets the ones it missed once.
 */
export async function photosSentFor(slug: string): Promise<boolean> {
  const value = (await db.settings.get(PHOTOS_SENT_FOR))?.value
  return Array.isArray(value) && value.includes(slug)
}

export async function markPhotosSentFor(slug: string): Promise<void> {
  const value = (await db.settings.get(PHOTOS_SENT_FOR))?.value
  const slugs = Array.isArray(value) ? (value as string[]) : []
  if (!slugs.includes(slug)) await db.settings.put({ key: PHOTOS_SENT_FOR, value: [...slugs, slug] })
}

const SYNC_CLUB = 'syncClub'

/** The club this device's pending logo and avatar uploads are for, once one has logged in. */
export async function getSyncClub(): Promise<string | undefined> {
  const value = (await db.settings.get(SYNC_CLUB))?.value
  return typeof value === 'string' ? value : undefined
}

export async function setSyncClub(slug: string): Promise<void> {
  await db.settings.put({ key: SYNC_CLUB, value: slug })
}

const PENDING_RENAMES = 'pendingRenames'

/** A player was renamed here; the club's leaderboard row and avatar have not moved to the new name yet. */
export interface PendingRename {
  from: string
  to: string
}

export async function getPendingRenames(): Promise<PendingRename[]> {
  const value = (await db.settings.get(PENDING_RENAMES))?.value
  return Array.isArray(value) ? (value as PendingRename[]) : []
}

export async function addPendingRename(rename: PendingRename): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    await db.settings.put({ key: PENDING_RENAMES, value: [...(await getPendingRenames()), rename] })
  })
}

/** The club has this rename: forget the first pending one that matches. */
export async function removePendingRename(rename: PendingRename): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const list = await getPendingRenames()
    const index = list.findIndex((r) => r.from === rename.from && r.to === rename.to)
    if (index < 0) return
    const rest = list.filter((_, i) => i !== index)
    if (rest.length === 0) await db.settings.delete(PENDING_RENAMES)
    else await db.settings.put({ key: PENDING_RENAMES, value: rest })
  })
}

export async function clearPendingRenames(): Promise<void> {
  await db.settings.delete(PENDING_RENAMES)
}
