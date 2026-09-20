import type { Player } from '../db/db'

/** A player who has been saved to the roster and therefore has an id. */
export type RosterPlayer = Player & { id: number }

export type GameMode = 'doubles' | 'singles'

/** How doubles groups are picked from the queue. Singles is always first come, first served. */
export type MatchmakingMode = 'balanced' | 'skill' | 'winners' | 'mixed'

export type LastResult = 'W' | 'L'

export interface PlayerStats {
  games: number
  wins: number
  losses: number
  /** Sum over this player's games of the opposing team's average skill level. */
  opponentSkill: number
}

/** Two sides of player ids. Doubles: 2 per side. Singles: 1 per side. */
export type Teams = [number[], number[]]

export interface Court {
  id: number
  /** null while the court is empty. */
  teams: Teams | null
}

export interface SessionState {
  mode: GameMode
  /** Assumed length of one game, used for wait estimates. */
  avgGameMinutes: number
  matchmaking: MatchmakingMode
  /** Locked doubles partners: always on the same team and queued together. */
  partners: [number, number][]
  /** Outcome of each player's most recent game (used by Winners vs. Losers). */
  lastResult: Record<number, LastResult>
  /** This session's results per player (only players who have finished a game). */
  stats: Record<number, PlayerStats>
  courts: Court[]
  players: Record<number, RosterPlayer>
  /** Waiting players, first in line at index 0. */
  queue: number[]
  /** Checked-out players (on a break); not in the queue. */
  onBreak: number[]
}
