import type { FullBackupEnvelope, LiveRow, PublicSnapshot } from '@q2dink/shared'
import type { Db, Queryable } from '../db'

const toIso = (value: unknown) => new Date(value as string | number | Date).toISOString()

/** Store the public snapshot and the private backup together. Returns the publish time. */
export async function publishSession(
  db: Db,
  slug: string,
  snapshot: PublicSnapshot,
  backup: FullBackupEnvelope,
): Promise<LiveRow> {
  return db.transaction(async (tx) => {
    const upsert = (table: 'live_sessions' | 'session_backups', state: unknown) =>
      tx.query<{ updated_at: string }>(
        `insert into ${table} (club_slug, state, updated_at)
         values ($1, $2::jsonb, now())
         on conflict (club_slug) do update set state = excluded.state, updated_at = excluded.updated_at
         returning updated_at`,
        [slug, JSON.stringify(state)],
      )
    const live = await upsert('live_sessions', snapshot)
    await upsert('session_backups', backup)
    return { state: snapshot, updatedAt: toIso(live.rows[0].updated_at) }
  })
}

/** The public live session, unless none is running or it has not been updated within `ttlHours`. */
export async function getLiveSession(db: Queryable, slug: string, ttlHours: number): Promise<LiveRow | null> {
  const { rows } = await db.query<{ state: unknown; updated_at: string }>(
    `select state, updated_at from live_sessions
     where club_slug = $1 and updated_at > now() - ($2 * interval '1 hour')`,
    [slug, ttlHours],
  )
  return rows[0] ? { state: rows[0].state, updatedAt: toIso(rows[0].updated_at) } : null
}

/** The private full backup, for resuming on another device. */
export async function getFullSession(db: Queryable, slug: string): Promise<unknown | null> {
  const { rows } = await db.query<{ state: unknown }>(
    'select state from session_backups where club_slug = $1',
    [slug],
  )
  return rows[0]?.state ?? null
}

export async function clearSession(db: Db, slug: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query('delete from live_sessions where club_slug = $1', [slug])
    await tx.query('delete from session_backups where club_slug = $1', [slug])
  })
}
