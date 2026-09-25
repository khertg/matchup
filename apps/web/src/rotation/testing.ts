import { nextGroup, startGame } from './engine'
import type { SessionState } from './types'

/**
 * For tests only. Starts a game on every open court, in board order, for as long
 * as a group can be formed. The app itself never does this: staff start games.
 */
export function fillCourts(state: SessionState): SessionState {
  let current = state
  for (const court of state.courts) {
    if (court.teams || !nextGroup(current, { courtId: court.id })) continue
    current = startGame(current, court.id)
  }
  return current
}
