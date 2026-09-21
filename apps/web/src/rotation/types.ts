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
  /** Points this player's team scored, over the games that had a score entered. */
  pointsFor: number
  /** Points the opposing teams scored against this player, over the same games. */
  pointsAgainst: number
  /** Games that had a score entered. Winner-only results count as a game but not here. */
  scoredGames: number
  /** Total time on court, in whole seconds. */
  secondsPlayed: number
}

/** Two sides of player ids. Doubles: 2 per side. Singles: 1 per side. */
export type Teams = [number[], number[]]

export interface Court {
  /** Never changes and is never reused while the court exists; results and undo refer to it. */
  id: number
  /** What people call the court. Editable, and unique within the session. */
  name: string
  /** null while the court is empty. */
  teams: Teams | null
  /**
   * When the game in progress started (ms since the epoch), so its duration can be recorded.
   * Missing for a game started before this was tracked; such a game records no time.
   */
  startedAt?: number
}

/** A finished game, kept in the order it ended. Cancelled games are not recorded. */
export interface MatchRecord {
  /** The court's name when the game ended; courts can be renamed or closed afterwards. */
  courtName: string
  teams: Teams
  /** Index of the winning side. */
  winner: 0 | 1
  /** Team A, then Team B. Missing when only the winner was recorded. */
  score?: [number, number]
  /** Whole seconds on court; 0 when the game's start time was not known. */
  seconds: number
  /** When the game ended (ms since the epoch), if known. */
  endedAt?: number
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
  /**
   * The next group as staff chose it (see replaceNextUp), overriding the automatic pick while every
   * one of them is still waiting. Missing means automatic.
   */
  nextUpPick?: number[]
  /** Every game finished this session, oldest first. Missing in sessions saved before this was kept. */
  matches?: MatchRecord[]
}
