import { partnerOf, selectGroup, splitGroup } from '../matchmaking/grouping'
import type { GameMode, MatchmakingMode, RosterPlayer, SessionState } from './types'

/**
 * Court rotation engine. Every function is pure: it returns a new state and
 * never mutates its input, so undo is just keeping the previous state.
 */

export const playersPerCourt = (mode: GameMode) => (mode === 'doubles' ? 4 : 2)

export const DEFAULT_AVG_GAME_MINUTES = 12
export const MIN_AVG_GAME_MINUTES = 5
export const MAX_AVG_GAME_MINUTES = 60

export const isValidGameMinutes = (minutes: number) =>
  Number.isInteger(minutes) && minutes >= MIN_AVG_GAME_MINUTES && minutes <= MAX_AVG_GAME_MINUTES

export interface SessionOptions {
  avgGameMinutes?: number
  /** Doubles only; singles is always first come, first served. */
  matchmaking?: MatchmakingMode
}

export function createSession(
  mode: GameMode,
  courtCount: number,
  { avgGameMinutes = DEFAULT_AVG_GAME_MINUTES, matchmaking = 'balanced' }: SessionOptions = {},
): SessionState {
  if (!Number.isInteger(courtCount) || courtCount < 1 || courtCount > 15) {
    throw new RangeError('courtCount must be an integer from 1 to 15')
  }
  if (!isValidGameMinutes(avgGameMinutes)) {
    throw new RangeError('avgGameMinutes must be an integer from 5 to 60')
  }
  return {
    mode,
    avgGameMinutes,
    matchmaking,
    partners: [],
    lastResult: {},
    courts: Array.from({ length: courtCount }, (_, i) => ({ id: i + 1, teams: null })),
    players: {},
    queue: [],
    onBreak: [],
  }
}

/** Change the assumed game length used for wait estimates. */
export function setAvgGameMinutes(state: SessionState, minutes: number): SessionState {
  if (!isValidGameMinutes(minutes)) {
    throw new RangeError('avgGameMinutes must be an integer from 5 to 60')
  }
  return { ...state, avgGameMinutes: minutes }
}

export function playingIds(state: SessionState): number[] {
  return state.courts.flatMap((c) => (c.teams ? c.teams.flat() : []))
}

const isPlaying = (state: SessionState, id: number) => playingIds(state).includes(id)

/**
 * Check a player in (or back in from a break). They join the back of the
 * queue, so late arrivals never jump ahead. No-op if already queued or playing.
 */
export function checkIn(state: SessionState, player: RosterPlayer): SessionState {
  if (state.queue.includes(player.id) || isPlaying(state, player.id)) return state
  return {
    ...state,
    players: { ...state.players, [player.id]: player },
    queue: [...state.queue, player.id],
    onBreak: state.onBreak.filter((id) => id !== player.id),
  }
}

/** Move a waiting player to a break. Players on a court must be replaced instead. */
export function checkOut(state: SessionState, playerId: number): SessionState {
  if (isPlaying(state, playerId)) {
    throw new Error('Player is on a court; use replacePlayer first')
  }
  if (!state.queue.includes(playerId)) return state
  return {
    ...state,
    queue: state.queue.filter((id) => id !== playerId),
    onBreak: [...state.onBreak, playerId],
  }
}

/**
 * Fill every empty court from the queue. Singles is strictly first come, first
 * served. Doubles groups are chosen by the session's matchmaking mode and split
 * into teams (see src/matchmaking/grouping.ts). A court stays empty until a
 * valid group can be formed.
 */
export function assignCourts(state: SessionState): SessionState {
  let queue = state.queue
  const courts = state.courts.map((court) => {
    if (court.teams) return court
    if (state.mode === 'singles') {
      if (queue.length < 2) return court
      const [a, b] = queue
      queue = queue.slice(2)
      return { ...court, teams: [[a], [b]] as [number[], number[]] }
    }
    const group = selectGroup(state, queue)
    if (!group) return court
    queue = queue.filter((id) => !group.includes(id))
    return { ...court, teams: splitGroup(state, group) }
  })
  return { ...state, courts, queue }
}

export interface GameResult {
  state: SessionState
  winners: number[]
  losers: number[]
}

/**
 * Record a finished game. `winner` is the index (0 or 1) of the winning side.
 * The court is freed and both sides rejoin the back of the queue, winners
 * first. Call assignCourts afterwards to stage the next match.
 */
export function recordResult(state: SessionState, courtId: number, winner: 0 | 1): GameResult {
  const court = state.courts.find((c) => c.id === courtId)
  if (!court?.teams) throw new Error(`Court ${courtId} has no game in progress`)
  const winners = court.teams[winner]
  const losers = court.teams[winner === 0 ? 1 : 0]
  return {
    winners,
    losers,
    state: {
      ...state,
      courts: state.courts.map((c) => (c.id === courtId ? { ...c, teams: null } : c)),
      queue: [...state.queue, ...winners, ...losers],
      lastResult: {
        ...state.lastResult,
        ...Object.fromEntries(winners.map((id) => [id, 'W' as const])),
        ...Object.fromEntries(losers.map((id) => [id, 'L' as const])),
      },
    },
  }
}

/**
 * Stage a game on an empty court from whoever is waiting, ignoring the
 * matchmaking mode. Lets staff start a mixed-doubles court that has no valid
 * mixed group yet. Locked partners are still kept together.
 */
export function startCourtManually(state: SessionState, courtId: number): SessionState {
  const court = state.courts.find((c) => c.id === courtId)
  if (!court || court.teams) throw new Error(`Court ${courtId} is not open`)
  const group = selectGroup(state, state.queue, { ignoreMode: true })
  if (!group) throw new Error('Not enough players are waiting to start a game')
  return {
    ...state,
    courts: state.courts.map((c) => (c.id === courtId ? { ...c, teams: splitGroup(state, group) } : c)),
    queue: state.queue.filter((id) => !group.includes(id)),
  }
}

/** Abandon a game without a result. Its players return to the front of the queue. */
export function cancelMatch(state: SessionState, courtId: number): SessionState {
  const court = state.courts.find((c) => c.id === courtId)
  if (!court?.teams) throw new Error(`Court ${courtId} has no game in progress`)
  return {
    ...state,
    courts: state.courts.map((c) => (c.id === courtId ? { ...c, teams: null } : c)),
    queue: [...court.teams.flat(), ...state.queue],
  }
}

/**
 * Swap a player out of a live game. The substitute defaults to the front of
 * the queue and takes the same side; the leaving player goes on a break.
 */
export function replacePlayer(
  state: SessionState,
  courtId: number,
  outId: number,
  inId: number | undefined = state.queue[0],
): SessionState {
  const court = state.courts.find((c) => c.id === courtId)
  if (!court?.teams?.flat().includes(outId)) {
    throw new Error(`Player ${outId} is not playing on court ${courtId}`)
  }
  if (inId === undefined || !state.queue.includes(inId)) {
    throw new Error('Substitute must be a player waiting in the queue')
  }
  const swap = (side: number[]) => side.map((id) => (id === outId ? inId : id))
  return {
    ...state,
    courts: state.courts.map((c) =>
      c.id === courtId ? { ...c, teams: [swap(court.teams![0]), swap(court.teams![1])] } : c,
    ),
    queue: state.queue.filter((id) => id !== inId),
    onBreak: [...state.onBreak, outId],
    // Whoever leaves is no longer bound to their partner.
    partners: state.partners.filter((pair) => !pair.includes(outId)),
  }
}

/**
 * Lock two checked-in players as partners: they always share a team and wait
 * in the queue together. Doubles only; a player can have one partner.
 */
export function lockPartners(state: SessionState, a: number, b: number): SessionState {
  if (state.mode !== 'doubles') throw new Error('Partners can only be locked in doubles')
  if (a === b) throw new Error('A player cannot partner themselves')
  if (!state.players[a] || !state.players[b]) throw new Error('Both players must be checked in')
  if (partnerOf(state.partners, a) !== undefined || partnerOf(state.partners, b) !== undefined) {
    throw new Error('A player is already locked with a partner')
  }
  return { ...state, partners: [...state.partners, [a, b]] }
}

/** Dissolve the partner lock that includes this player (no-op if none). */
export function unlockPartners(state: SessionState, playerId: number): SessionState {
  return { ...state, partners: state.partners.filter((pair) => !pair.includes(playerId)) }
}

/**
 * Rough minutes until a queued player is on court, assuming games last
 * `avgGameMinutes` and courts free up evenly staggered. Returns null if the
 * player is not in the queue.
 */
export function estimateWaitMinutes(
  state: SessionState,
  playerId: number,
  avgGameMinutes: number,
): number | null {
  const position = state.queue.indexOf(playerId)
  if (position === -1) return null
  const freeCourts = state.courts.filter((c) => !c.teams).length
  const matchesAhead = Math.floor(position / playersPerCourt(state.mode))
  const courtsToFree = Math.max(0, matchesAhead - freeCourts + 1)
  return Math.round((courtsToFree * avgGameMinutes) / state.courts.length)
}
