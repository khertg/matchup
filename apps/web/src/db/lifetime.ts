import type { SessionState } from '@/rotation/types'
import { db } from './db'

/** Add this session's per-player totals to the saved all-time totals on the roster. */
export async function saveLifetimeStats(session: SessionState): Promise<void> {
  await db.transaction('rw', db.players, async () => {
    for (const [idText, stats] of Object.entries(session.stats)) {
      if (stats.games === 0) continue
      const id = Number(idText)
      const player = await db.players.get(id)
      if (!player) continue
      await db.players.update(id, {
        games: (player.games ?? 0) + stats.games,
        wins: (player.wins ?? 0) + stats.wins,
        losses: (player.losses ?? 0) + stats.losses,
      })
    }
  })
}
