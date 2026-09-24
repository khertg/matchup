import { MAX_PLAYER_NAME_LENGTH, MAX_ROSTER_PLAYERS, avatarKey, type ClubRosterPlayer } from '@q2dink/shared'
import type { Db, Queryable } from '../db'
import { AppError } from '../errors'

/**
 * Add players to the club's roster, or update the ones it already has under those names (ignoring
 * case). A club keeps at most MAX_ROSTER_PLAYERS; a batch that would go past that is refused whole.
 */
export async function putRoster(db: Db, slug: string, players: ClubRosterPlayer[]): Promise<void> {
  const rows = new Map<string, ClubRosterPlayer>()
  for (const p of players) {
    const name = p.name.trim()
    if (name.length < 1 || name.length > MAX_PLAYER_NAME_LENGTH) throw new AppError('invalid_request')
    // A later entry for the same name wins, as if they had been sent one after another.
    rows.set(avatarKey(name), { name, skill: p.skill, ...(p.gender ? { gender: p.gender } : {}) })
  }
  if (rows.size === 0) return

  await db.transaction(async (tx) => {
    const keys = [...rows.keys()]
    const { rows: counts } = await tx.query<{ total: string | number; known: string | number }>(
      `select count(*) as total, count(*) filter (where name_key = any($2::text[])) as known
       from club_roster where club_slug = $1`,
      [slug, keys],
    )
    const added = keys.length - Number(counts[0].known)
    if (Number(counts[0].total) + added > MAX_ROSTER_PLAYERS) throw new AppError('payload_too_large')

    for (const [key, p] of rows) {
      await tx.query(
        `insert into club_roster (club_slug, name_key, name, skill, gender, updated_at)
         values ($1, $2, $3, $4, $5, now())
         on conflict (club_slug, name_key) do update set
           name = excluded.name, skill = excluded.skill, gender = excluded.gender, updated_at = now()`,
        [slug, key, p.name, p.skill, p.gender ?? null],
      )
    }
  })
}

/** The club's saved players, by name. */
export async function getRoster(db: Queryable, slug: string): Promise<ClubRosterPlayer[]> {
  const { rows } = await db.query<{ name: string; skill: number; gender: 'M' | 'F' | null }>(
    'select name, skill, gender from club_roster where club_slug = $1 order by name_key',
    [slug],
  )
  return rows.map((r) => ({ name: r.name, skill: Number(r.skill), ...(r.gender ? { gender: r.gender } : {}) }))
}
