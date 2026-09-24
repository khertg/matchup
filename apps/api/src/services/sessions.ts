import type { FullBackupEnvelope, LiveRow, PublicSnapshot, PublishMeta, SessionStateRow } from '@q2dink/shared'
import type { Db, Queryable } from '../db'

const toIso = (value: unknown) => new Date(value as string | number | Date).toISOString()

type StoredRow = { revision: string | number; session_id: string | null; started_at: unknown; state: unknown }

const toStateRow = (row: StoredRow): SessionStateRow => ({
  revision: Number(row.revision),
  sessionId: row.session_id,
  startedAt: row.started_at ? toIso(row.started_at) : null,
  full: row.state,
})

export type PublishResult = { row: LiveRow; revision: number } | { conflict: SessionStateRow | null }

/**
 * Store the public snapshot and the private backup together, moving the revision on. With
 * `meta.baseRevision` (several staff devices running one session) the write is refused, returning the
 * club's copy, when that copy has moved on since, belongs to another session, or has ended; without it
 * (an older app) the write simply replaces whatever is there.
 */
export async function publishSession(
  db: Db,
  slug: string,
  snapshot: PublicSnapshot,
  backup: FullBackupEnvelope,
  meta: PublishMeta = {},
): Promise<PublishResult> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<StoredRow>(
      'select revision, session_id, started_at, state from session_backups where club_slug = $1',
      [slug],
    )
    const stored = rows[0]
    if (meta.baseRevision !== undefined) {
      if (!stored) {
        // Nothing running: a new session may start, but a change to one that has since ended may not.
        if (meta.baseRevision > 0) return { conflict: null }
      } else {
        const otherSession = meta.sessionId !== undefined && stored.session_id !== null && stored.session_id !== meta.sessionId
        if (otherSession || Number(stored.revision) !== meta.baseRevision) return { conflict: toStateRow(stored) }
      }
    }
    const revision = (stored ? Number(stored.revision) : 0) + 1

    const live = await tx.query<{ updated_at: string }>(
      `insert into live_sessions (club_slug, state, updated_at)
       values ($1, $2::jsonb, now())
       on conflict (club_slug) do update set state = excluded.state, updated_at = excluded.updated_at
       returning updated_at`,
      [slug, JSON.stringify(snapshot)],
    )
    await tx.query(
      `insert into session_backups (club_slug, state, updated_at, revision, session_id, started_at)
       values ($1, $2::jsonb, now(), $3, $4, $5)
       on conflict (club_slug) do update set
         state = excluded.state, updated_at = excluded.updated_at, revision = excluded.revision,
         session_id = coalesce(excluded.session_id, session_backups.session_id),
         started_at = coalesce(excluded.started_at, session_backups.started_at)`,
      [slug, JSON.stringify(backup), revision, meta.sessionId ?? null, meta.startedAt ?? null],
    )
    return { row: { state: snapshot, updatedAt: toIso(live.rows[0].updated_at), revision }, revision }
  })
}

/** The public live session, unless none is running or it has not been updated within `ttlHours`. */
export async function getLiveSession(db: Queryable, slug: string, ttlHours: number): Promise<LiveRow | null> {
  const { rows } = await db.query<{ state: unknown; updated_at: string; revision: string | number | null }>(
    `select l.state, l.updated_at, b.revision from live_sessions l
     left join session_backups b on b.club_slug = l.club_slug
     where l.club_slug = $1 and l.updated_at > now() - ($2 * interval '1 hour')`,
    [slug, ttlHours],
  )
  const row = rows[0]
  if (!row) return null
  return {
    state: row.state,
    updatedAt: toIso(row.updated_at),
    ...(row.revision !== null ? { revision: Number(row.revision) } : {}),
  }
}

/** The private full backup, for resuming on another device. */
export async function getFullSession(db: Queryable, slug: string): Promise<unknown | null> {
  const { rows } = await db.query<{ state: unknown }>(
    'select state from session_backups where club_slug = $1',
    [slug],
  )
  return rows[0]?.state ?? null
}

/** The private copy with its revision and session, for staff devices running the session together. */
export async function getSessionState(db: Queryable, slug: string): Promise<SessionStateRow | null> {
  const { rows } = await db.query<StoredRow>(
    'select revision, session_id, started_at, state from session_backups where club_slug = $1',
    [slug],
  )
  return rows[0] ? toStateRow(rows[0]) : null
}

/**
 * End the running session. With `sessionId`, only if that is the session running, so a device ending
 * a session cannot take down one another device has started since. Returns whether it cleared anything.
 */
export async function clearSession(db: Db, slug: string, sessionId?: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    if (sessionId !== undefined) {
      const { rows } = await tx.query<{ session_id: string | null }>(
        'select session_id from session_backups where club_slug = $1',
        [slug],
      )
      const running = rows[0]?.session_id
      if (running && running !== sessionId) return false
    }
    const live = await tx.query('delete from live_sessions where club_slug = $1', [slug])
    const backup = await tx.query('delete from session_backups where club_slug = $1', [slug])
    return (live.rowCount ?? 0) + (backup.rowCount ?? 0) > 0
  })
}
