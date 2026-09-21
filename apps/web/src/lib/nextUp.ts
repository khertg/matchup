import { playersPerCourt } from '@/rotation/engine'
import type { SessionState } from '@/rotation/types'

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/**
 * Why no group can start yet, in words staff can act on. Use it when
 * nextGroup(session) is null.
 */
export function waitingMessage(session: SessionState): string {
  const needed = playersPerCourt(session.mode)
  const waiting = session.queue.length
  if (waiting === 0) return 'No one is waiting.'
  if (waiting < needed) return `Waiting for ${plural(needed - waiting, 'more player')}.`
  if (session.mode === 'doubles' && session.matchmaking === 'mixed') {
    return 'Waiting for two men and two women. You can also start with whoever is waiting.'
  }
  return 'No group can be formed from the players waiting yet.'
}
