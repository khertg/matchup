import { queueClubRename } from '@/cloud/sync'
import { renameRosterPlayer } from '@/db/roster'
import { cleanPlayerName, renamePlayer as renameInSession } from '@/rotation/engine'
import { useSessionStore } from '@/store/session'

/**
 * Rename a player everywhere it matters on this device, and remember to move the club's copy:
 * the saved player (so future check-ins use the new name), the running session (queue, courts,
 * standings and the live page follow), and, when a club is connected, the leaderboard row and shared
 * avatar. Sessions that already ended keep the name as it was that day.
 *
 * Nothing changes if the name is refused. Throws a RangeError with a readable message in that case.
 */
export async function renamePlayer(playerId: number, name: string): Promise<{ from: string; to: string }> {
  const to = cleanPlayerName(name)
  const { session, renamePlayer: renameNow } = useSessionStore.getState()
  // Check the running session first, so a refusal leaves the saved player alone too.
  if (session?.players[playerId]) renameInSession(session, playerId, to)

  const renamed = await renameRosterPlayer(playerId, to)
  if (useSessionStore.getState().session?.players[playerId]) renameNow(playerId, renamed.to)
  if (renamed.from !== renamed.to) await queueClubRename(renamed.from, renamed.to)
  return renamed
}
