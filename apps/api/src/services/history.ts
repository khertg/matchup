import {
  MAX_HISTORY_PER_CLUB,
  type FullBackupEnvelope,
  type HistorySummary,
  type PutHistoryRequest,
} from '@matchup/shared'
import type { Db, Queryable } from '../db'

export const isHistoryId = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

/**
 * Save an ended session, or replace the earlier version of it (a resumed session that ended
 * again). Keeps only the club's newest MAX_HISTORY_PER_CLUB sessions.
 */
export async function putHistory(
  db: Db,
  slug: string,
  id: string,
  body: Omit<PutHistoryRequest, 'full'>,
  full: FullBackupEnvelope,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query(
      `insert into session_history (club_slug, id, location, mode, players, games, ended_at, state)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       on conflict (club_slug, id) do update set
         location = excluded.location, mode = excluded.mode, players = excluded.players,
         games = excluded.games, ended_at = excluded.ended_at, state = excluded.state`,
      [slug, id.toLowerCase(), full.location, body.mode, body.players, body.games, body.endedAt, JSON.stringify(full)],
    )
    await tx.query(
      `delete from session_history
       where club_slug = $1 and id in (
         select id from session_history where club_slug = $1
         order by ended_at desc, id offset $2
       )`,
      [slug, MAX_HISTORY_PER_CLUB],
    )
  })
}

/** Newest first, without the sessions themselves. */
export async function listHistory(db: Queryable, slug: string): Promise<HistorySummary[]> {
  const { rows } = await db.query<{
    id: string
    location: string
    mode: 'doubles' | 'singles'
    players: number
    games: number
    ended_at: string | Date
  }>(
    `select id, location, mode, players, games, ended_at from session_history
     where club_slug = $1 order by ended_at desc, id`,
    [slug],
  )
  return rows.map((r) => ({
    id: r.id,
    location: r.location,
    mode: r.mode,
    players: r.players,
    games: r.games,
    endedAt: new Date(r.ended_at).toISOString(),
  }))
}

export async function getHistory(db: Queryable, slug: string, id: string): Promise<unknown | null> {
  const { rows } = await db.query<{ state: unknown }>(
    'select state from session_history where club_slug = $1 and id = $2',
    [slug, id.toLowerCase()],
  )
  return rows[0]?.state ?? null
}

export async function deleteHistory(db: Queryable, slug: string, id: string): Promise<void> {
  await db.query('delete from session_history where club_slug = $1 and id = $2', [slug, id.toLowerCase()])
}
