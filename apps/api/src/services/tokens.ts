import { createHash, randomBytes } from 'node:crypto'
import type { Queryable } from '../db'

const TOKEN_PATTERN = /^[0-9a-f]{64}$/

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** Create a staff token for a club. Only its hash is stored; the token itself is returned once. */
export async function issueToken(db: Queryable, slug: string, ttlDays: number): Promise<string> {
  const token = randomBytes(32).toString('hex')
  await db.query('delete from club_tokens where expires_at < now()')
  await db.query(
    `insert into club_tokens (token_hash, club_slug, expires_at)
     values ($1, $2, now() + ($3 * interval '1 day'))`,
    [hashToken(token), slug, ttlDays],
  )
  return token
}

/** The club a valid, unexpired token belongs to, or null. */
export async function resolveToken(db: Queryable, token: string): Promise<string | null> {
  if (!TOKEN_PATTERN.test(token)) return null
  const { rows } = await db.query<{ club_slug: string }>(
    'select club_slug from club_tokens where token_hash = $1 and expires_at > now()',
    [hashToken(token)],
  )
  return rows[0]?.club_slug ?? null
}

export async function revokeToken(db: Queryable, token: string): Promise<void> {
  await db.query('delete from club_tokens where token_hash = $1', [hashToken(token)])
}

export async function revokeAllTokens(db: Queryable, slug: string): Promise<void> {
  await db.query('delete from club_tokens where club_slug = $1', [slug])
}
