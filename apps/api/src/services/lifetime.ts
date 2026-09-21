import { MAX_PLAYER_NAME_LENGTH, type LifetimePlayer } from '@q2dink/shared'
import type { Db, Queryable } from '../db'
import { AppError } from '../errors'

export const MAX_PLAYERS_PER_BATCH = 500
const MAX_COUNT = 100_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validate(batchId: string, players: LifetimePlayer[]): void {
  if (!UUID.test(batchId)) throw new AppError('invalid_players')
  if (players.length > MAX_PLAYERS_PER_BATCH) throw new AppError('invalid_players')
  for (const p of players) {
    const name = p.name.trim()
    const counts = [p.games, p.wins, p.losses]
    if (name.length < 1 || name.length > MAX_PLAYER_NAME_LENGTH) throw new AppError('invalid_players')
    if (!counts.every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_COUNT)) {
      throw new AppError('invalid_players')
    }
  }
}

/**
 * Add a finished session's totals to the club leaderboard. Each `batchId` is
 * applied once, so a client can safely retry after a dropped connection.
 * Names match ignoring case and surrounding spaces.
 */
export async function recordLifetime(
  db: Db,
  slug: string,
  batchId: string,
  players: LifetimePlayer[],
): Promise<void> {
  validate(batchId, players)
  await db.transaction(async (tx) => {
    const claimed = await tx.query(
      `insert into lifetime_batches (club_slug, batch_id) values ($1, $2)
       on conflict do nothing returning batch_id`,
      [slug, batchId.toLowerCase()],
    )
    if (claimed.rowCount === 0) return // already applied

    for (const p of players) {
      const name = p.name.trim()
      await tx.query(
        `insert into club_players (club_slug, name_key, name, games, wins, losses)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (club_slug, name_key) do update
           set games  = club_players.games  + excluded.games,
               wins   = club_players.wins   + excluded.wins,
               losses = club_players.losses + excluded.losses,
               name   = excluded.name`,
        [slug, name.toLowerCase(), name, p.games, p.wins, p.losses],
      )
    }
  })
}

/** The club leaderboard, best first: most wins, then best win rate, then most games (as the web app ranks it). */
export async function getLeaderboard(db: Queryable, slug: string): Promise<LifetimePlayer[]> {
  const { rows } = await db.query<LifetimePlayer>(
    `select name, games, wins, losses from club_players
     where club_slug = $1
     order by wins desc,
              case when games = 0 then 0 else wins::float8 / games end desc,
              games desc,
              name asc
     limit 1000`,
    [slug],
  )
  return rows
}
