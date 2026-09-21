import { MAX_PLAYER_NAME_LENGTH, avatarKey } from '@matchup/shared'
import type { Db } from '../db'
import { AppError } from '../errors'

const validName = (name: string) => name.length >= 1 && name.length <= MAX_PLAYER_NAME_LENGTH

/**
 * A player was renamed on a staff device: the club's leaderboard row and shared avatar move to the
 * new name (both are matched by lower-case name).
 *
 * - If the new name already has a leaderboard row (another device, or a different person with that
 *   name), the two rows' games, wins and losses are added together. If it already has an avatar, that
 *   one is kept and the old one is dropped.
 * - Safe to repeat and to send late: a name the club has nothing under is a successful no-op, and a
 *   change of capitalisation only updates the name as displayed.
 */
export async function renamePlayer(db: Db, slug: string, fromInput: string, toInput: string): Promise<void> {
  const from = fromInput.trim()
  const to = toInput.trim()
  if (!validName(from) || !validName(to)) throw new AppError('invalid_request')
  const fromKey = avatarKey(from)
  const toKey = avatarKey(to)

  await db.transaction(async (tx) => {
    if (fromKey === toKey) {
      await tx.query('update club_players set name = $3 where club_slug = $1 and name_key = $2', [slug, fromKey, to])
      return
    }

    const { rows } = await tx.query<{ games: number; wins: number; losses: number }>(
      'select games, wins, losses from club_players where club_slug = $1 and name_key = $2',
      [slug, fromKey],
    )
    const row = rows[0]
    if (row) {
      await tx.query(
        `insert into club_players (club_slug, name_key, name, games, wins, losses)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (club_slug, name_key) do update
           set games  = club_players.games  + excluded.games,
               wins   = club_players.wins   + excluded.wins,
               losses = club_players.losses + excluded.losses,
               name   = excluded.name`,
        [slug, toKey, to, row.games, row.wins, row.losses],
      )
      await tx.query('delete from club_players where club_slug = $1 and name_key = $2', [slug, fromKey])
    }

    const avatar = await tx.query('select 1 from club_avatars where club_slug = $1 and name_key = $2', [slug, fromKey])
    if (avatar.rowCount) {
      const target = await tx.query('select 1 from club_avatars where club_slug = $1 and name_key = $2', [slug, toKey])
      if (target.rowCount) {
        await tx.query('delete from club_avatars where club_slug = $1 and name_key = $2', [slug, fromKey])
      } else {
        await tx.query(
          'update club_avatars set name_key = $3, updated_at = now() where club_slug = $1 and name_key = $2',
          [slug, fromKey, toKey],
        )
      }
    }
  })
}
