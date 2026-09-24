import { lifetimeDelta, type LifetimeCounts } from '@/rotation/lifetime'
import type { SessionState } from '@/rotation/types'
import { db } from './db'
import { findSavedPlayer } from './roster'

/**
 * Add this session's per-player totals to the saved all-time totals on the club's roster. Pass what
 * an earlier save already added (a session that was resumed) and only the new games are added. Players
 * are matched to saved ones by name, since a session's ids are its own; anyone not saved here is skipped.
 */
export async function saveLifetimeStats(
  session: SessionState,
  counted: LifetimeCounts = {},
  clubSlug?: string,
): Promise<void> {
  await db.transaction('rw', db.players, async () => {
    for (const [idText, delta] of Object.entries(lifetimeDelta(session, counted))) {
      const name = session.players[Number(idText)]?.name
      const player = name === undefined ? undefined : await findSavedPlayer(clubSlug, name)
      if (!player) continue
      await db.players.update(player.id, {
        games: (player.games ?? 0) + delta.games,
        wins: (player.wins ?? 0) + delta.wins,
        losses: (player.losses ?? 0) + delta.losses,
      })
    }
  })
}
