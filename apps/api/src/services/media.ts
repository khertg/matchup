import { MEDIA_LIMITS, avatarKey, type AvatarInfo, type PutAvatarRequest } from '@q2dink/shared'
import { createHash } from 'node:crypto'
import type { Db, Queryable } from '../db'
import { AppError } from '../errors'

export type ImageType = 'image/png' | 'image/jpeg' | 'image/webp'

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/
const COLOR = /^#[0-9a-f]{6}$/

/**
 * The image type by looking at the bytes, never at what the client says. Anything that is not a
 * PNG, JPEG or WebP (an SVG, HTML, a renamed file) is refused, so nothing scriptable is ever served.
 */
export function sniffImage(bytes: Buffer): ImageType | null {
  if (bytes.length > 12 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (
    bytes.length > 12 &&
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

/** Check base64 image text: well formed, within `maxBytes` once decoded, and really an image. */
function checkImage(data: unknown, maxBytes: number): { type: ImageType; data: string } {
  if (typeof data !== 'string' || data.length === 0 || data.length % 4 !== 0 || !BASE64.test(data)) {
    throw new AppError('invalid_request')
  }
  // The decoded size is known from the text length before anything is decoded.
  const size = (data.length / 4) * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0)
  if (size > maxBytes) throw new AppError('payload_too_large')
  const type = sniffImage(Buffer.from(data, 'base64'))
  if (!type) throw new AppError('invalid_request')
  return { type, data }
}

/** A key from a URL: already trimmed and lower case, and short. Anything else is not a player. */
export function checkKey(key: string): string {
  if (key.length < 1 || key.length > 80 || key !== avatarKey(key)) throw new AppError('invalid_request')
  return key
}

const toEpoch = (value: unknown) => new Date(value as string | number | Date).getTime()

export async function putLogo(db: Queryable, slug: string, data: unknown): Promise<void> {
  const image = checkImage(data, MEDIA_LIMITS.logoBytes)
  await db.query(
    `insert into club_logos (club_slug, content_type, data, updated_at) values ($1, $2, $3, now())
     on conflict (club_slug) do update
       set content_type = excluded.content_type, data = excluded.data, updated_at = excluded.updated_at`,
    [slug, image.type, image.data],
  )
}

export async function deleteLogo(db: Queryable, slug: string): Promise<void> {
  await db.query('delete from club_logos where club_slug = $1', [slug])
}

export interface StoredImage {
  type: ImageType
  bytes: Buffer
  /** Milliseconds since the epoch; changes with the image. */
  version: number
}

export async function getLogo(db: Queryable, slug: string): Promise<StoredImage | null> {
  const { rows } = await db.query<{ content_type: ImageType; data: string; updated_at: unknown }>(
    'select content_type, data, updated_at from club_logos where club_slug = $1',
    [slug],
  )
  const row = rows[0]
  return row ? { type: row.content_type, bytes: Buffer.from(row.data, 'base64'), version: toEpoch(row.updated_at) } : null
}

/** Only pictographs (with their modifiers and joiners): no letters, digits or markup. */
function isEmoji(text: string): boolean {
  const chars = [...text]
  if (chars.length < 1 || chars.length > MEDIA_LIMITS.emojiChars) return false
  return /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u200d|\ufe0f)+$/u.test(text)
}

/** Save an avatar, replacing the player's earlier one. A club keeps at most MEDIA_LIMITS.avatars. */
export async function putAvatar(db: Db, slug: string, key: string, body: PutAvatarRequest): Promise<void> {
  checkKey(key)
  let emoji: string | null = null
  let color: string | null = null
  let photo: { type: ImageType; data: string } | null = null

  if (body.kind === 'photo') {
    if (!body.photo || body.emoji !== undefined || body.color !== undefined) throw new AppError('invalid_request')
    photo = checkImage(body.photo.data, MEDIA_LIMITS.avatarPhotoBytes)
  } else if (body.kind === 'emoji') {
    if (typeof body.emoji !== 'string' || !isEmoji(body.emoji) || body.photo) throw new AppError('invalid_request')
    emoji = body.emoji
  } else if (body.kind === 'initials') {
    if (body.photo || body.emoji !== undefined) throw new AppError('invalid_request')
  } else {
    throw new AppError('invalid_request')
  }
  if (body.color !== undefined) {
    if (typeof body.color !== 'string' || !COLOR.test(body.color)) throw new AppError('invalid_request')
    color = body.color
  }
  if (body.kind === 'initials' && !color) throw new AppError('invalid_request')

  await db.transaction(async (tx) => {
    const existing = await tx.query('select 1 from club_avatars where club_slug = $1 and name_key = $2', [slug, key])
    if (existing.rowCount === 0) {
      const { rows } = await tx.query<{ n: string | number }>(
        'select count(*) as n from club_avatars where club_slug = $1',
        [slug],
      )
      if (Number(rows[0].n) >= MEDIA_LIMITS.avatars) throw new AppError('payload_too_large')
    }
    await tx.query(
      `insert into club_avatars (club_slug, name_key, kind, emoji, color, content_type, photo, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (club_slug, name_key) do update set
         kind = excluded.kind, emoji = excluded.emoji, color = excluded.color,
         content_type = excluded.content_type, photo = excluded.photo, updated_at = excluded.updated_at`,
      [slug, key, body.kind, emoji, color, photo?.type ?? null, photo?.data ?? null],
    )
  })
}

export async function deleteAvatar(db: Queryable, slug: string, key: string): Promise<void> {
  await db.query('delete from club_avatars where club_slug = $1 and name_key = $2', [slug, checkKey(key)])
}

/** Remove every player photo (emoji and initials avatars stay): sharing photos was switched off. */
export async function deleteAvatarPhotos(db: Queryable, slug: string): Promise<void> {
  await db.query("delete from club_avatars where club_slug = $1 and kind = 'photo'", [slug])
}

/** Every avatar, without the photos themselves, and a validator that changes when any of them do. */
export async function getAvatarIndex(
  db: Queryable,
  slug: string,
): Promise<{ avatars: Record<string, AvatarInfo>; logo: { v: number } | null; etag: string }> {
  const { rows } = await db.query<{
    name_key: string
    kind: AvatarInfo['kind']
    emoji: string | null
    color: string | null
    updated_at: unknown
  }>(
    'select name_key, kind, emoji, color, updated_at from club_avatars where club_slug = $1 order by name_key',
    [slug],
  )
  const avatars: Record<string, AvatarInfo> = {}
  for (const r of rows) {
    avatars[r.name_key] = {
      kind: r.kind,
      ...(r.emoji ? { emoji: r.emoji } : {}),
      ...(r.color ? { color: r.color } : {}),
      v: toEpoch(r.updated_at),
    }
  }
  const logoRow = await db.query<{ updated_at: unknown }>('select updated_at from club_logos where club_slug = $1', [slug])
  const logo = logoRow.rows[0] ? { v: toEpoch(logoRow.rows[0].updated_at) } : null
  const etag = `W/"${createHash('sha1').update(JSON.stringify({ avatars, logo })).digest('hex').slice(0, 20)}"`
  return { avatars, logo, etag }
}

export async function getAvatarPhoto(db: Queryable, slug: string, key: string): Promise<StoredImage | null> {
  const { rows } = await db.query<{ content_type: ImageType; photo: string; updated_at: unknown }>(
    "select content_type, photo, updated_at from club_avatars where club_slug = $1 and name_key = $2 and kind = 'photo'",
    [slug, key],
  )
  const row = rows[0]
  return row ? { type: row.content_type, bytes: Buffer.from(row.photo, 'base64'), version: toEpoch(row.updated_at) } : null
}
