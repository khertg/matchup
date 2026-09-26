import {
  HISTORY_TRASH_DAYS,
  MAX_HISTORY_PER_CLUB,
  type DeletedHistorySummary,
  type FullBackupEnvelope,
  type HistorySummary,
  type PutHistoryRequest,
} from '@q2dink/shared'
import type { Db, Queryable } from '../db'

export const isHistoryId = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

/** Sessions deleted longer ago than the trash keeps them are removed for good. */
async function emptyTrash(db: Queryable, slug: string): Promise<void> {
  await db.query(
    `delete from session_history where club_slug = $1 and deleted_at < now() - ($2 * interval '1 day')`,
    [slug, HISTORY_TRASH_DAYS],
  )
}

/**
 * Save an ended session, or replace the earlier version of it (a resumed session that ended
 * again). A deleted session stays deleted: a device sending its copy again never brings it back.
 * Keeps only the club's newest MAX_HISTORY_PER_CLUB sessions that are not deleted.
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
         select id from session_history where club_slug = $1 and deleted_at is null
         order by ended_at desc, id offset $2
       )`,
      [slug, MAX_HISTORY_PER_CLUB],
    )
    await emptyTrash(tx, slug)
  })
}

type SummaryRow = {
  id: string
  location: string
  mode: 'doubles' | 'singles'
  players: number
  games: number
  ended_at: string | Date
  deleted_at: string | Date | null
}

const toSummary = (r: SummaryRow): HistorySummary => ({
  id: r.id,
  location: r.location,
  mode: r.mode,
  players: r.players,
  games: r.games,
  endedAt: new Date(r.ended_at).toISOString(),
})

/** The club's past sessions that are not deleted, newest first, without the sessions themselves. */
export async function listHistory(db: Queryable, slug: string): Promise<HistorySummary[]> {
  const { rows } = await db.query<SummaryRow>(
    `select id, location, mode, players, games, ended_at, deleted_at from session_history
     where club_slug = $1 and deleted_at is null order by ended_at desc, id`,
    [slug],
  )
  return rows.map(toSummary)
}

/** Recently deleted: the ones that can still be restored, most recently deleted first. */
export async function listDeletedHistory(db: Queryable, slug: string): Promise<DeletedHistorySummary[]> {
  await emptyTrash(db, slug)
  const { rows } = await db.query<SummaryRow>(
    `select id, location, mode, players, games, ended_at, deleted_at from session_history
     where club_slug = $1 and deleted_at is not null order by deleted_at desc, id`,
    [slug],
  )
  return rows.map((r) => ({ ...toSummary(r), deletedAt: new Date(r.deleted_at!).toISOString() }))
}

/** One past session in full, deleted or not (it can be looked at before it is restored). */
export async function getHistory(db: Queryable, slug: string, id: string): Promise<unknown | null> {
  const { rows } = await db.query<{ state: unknown }>(
    'select state from session_history where club_slug = $1 and id = $2',
    [slug, id.toLowerCase()],
  )
  return rows[0]?.state ?? null
}

/** Move a past session to Recently deleted. It can be restored for HISTORY_TRASH_DAYS. */
export async function deleteHistory(db: Queryable, slug: string, id: string): Promise<void> {
  await db.query(
    'update session_history set deleted_at = now() where club_slug = $1 and id = $2 and deleted_at is null',
    [slug, id.toLowerCase()],
  )
  await emptyTrash(db, slug)
}

/** Bring a deleted past session back. Nothing happens for one that is not deleted (or not there). */
export async function restoreHistory(db: Queryable, slug: string, id: string): Promise<void> {
  await db.query('update session_history set deleted_at = null where club_slug = $1 and id = $2', [slug, id.toLowerCase()])
}

/** Remove a past session for good, deleted or not. */
export async function purgeHistory(db: Queryable, slug: string, id: string): Promise<void> {
  await db.query('delete from session_history where club_slug = $1 and id = $2', [slug, id.toLowerCase()])
}
