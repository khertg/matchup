import type { Player } from '../db/db'

/** A player who has been saved to the roster and therefore has an id. */
export type RosterPlayer = Player & { id: number }

export type GameMode = 'doubles' | 'singles'

/** Two sides of player ids. Doubles: 2 per side. Singles: 1 per side. */
export type Teams = [number[], number[]]

export interface Court {
  id: number
  /** null while the court is empty. */
  teams: Teams | null
}

export interface SessionState {
  mode: GameMode
  courts: Court[]
  players: Record<number, RosterPlayer>
  /** Waiting players, first in line at index 0. */
  queue: number[]
  /** Checked-out players (on a break); not in the queue. */
  onBreak: number[]
}
