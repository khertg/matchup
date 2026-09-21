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

/** Whether player photos are also shown on the club's public live page. Off unless staff turn it on. */
export async function getSharePhotos(): Promise<boolean> {
  return (await db.settings.get(SHARE_PHOTOS))?.value === true
}

export async function setSharePhotos(on: boolean): Promise<void> {
  await db.settings.put({ key: SHARE_PHOTOS, value: on })
}

const PURGE_PHOTOS = 'purgePhotos'

/** Photos were switched off while the club may still hold some: they are taken down when it is reachable. */
export async function getPhotoPurgePending(): Promise<boolean> {
  return (await db.settings.get(PURGE_PHOTOS))?.value === true
}

export async function setPhotoPurgePending(pending: boolean): Promise<void> {
  await db.settings.put({ key: PURGE_PHOTOS, value: pending })
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
