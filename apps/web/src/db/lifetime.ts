import { lifetimeDelta, type LifetimeCounts } from '@/rotation/lifetime'
import type { SessionState } from '@/rotation/types'
import { db } from './db'

/**
 * Add this session's per-player totals to the saved all-time totals on the roster. Pass what
 * an earlier save already added (a session that was resumed) and only the new games are added.
 */
export async function saveLifetimeStats(
  session: SessionState,
  counted: LifetimeCounts = {},
): Promise<void> {
  await db.transaction('rw', db.players, async () => {
    for (const [idText, delta] of Object.entries(lifetimeDelta(session, counted))) {
      const id = Number(idText)
      const player = await db.players.get(id)
      if (!player) continue
      await db.players.update(id, {
        games: (player.games ?? 0) + delta.games,
        wins: (player.wins ?? 0) + delta.wins,
        losses: (player.losses ?? 0) + delta.losses,
      })
    }
  })
}
