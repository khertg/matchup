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
