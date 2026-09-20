import { balanceDoubles } from '../matchmaking/balance'
import type { GameMode, RosterPlayer, SessionState, Teams } from './types'

/**
 * Court rotation engine. Every function is pure: it returns a new state and
 * never mutates its input, so undo is just keeping the previous state.
 */

export const playersPerCourt = (mode: GameMode) => (mode === 'doubles' ? 4 : 2)

export function createSession(mode: GameMode, courtCount: number): SessionState {
  if (!Number.isInteger(courtCount) || courtCount < 1 || courtCount > 15) {
    throw new RangeError('courtCount must be an integer from 1 to 15')
  }
  return {
    mode,
    courts: Array.from({ length: courtCount }, (_, i) => ({ id: i + 1, teams: null })),
    players: {},
    queue: [],
    onBreak: [],
  }
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

function splitTeams(state: SessionState, group: number[]): Teams {
  if (state.mode === 'singles') return [[group[0]], [group[1]]]
  const four = group.map((id) => state.players[id]) as [
    RosterPlayer,
    RosterPlayer,
    RosterPlayer,
    RosterPlayer,
  ]
  const { teamA, teamB } = balanceDoubles(four)
  return [teamA.map((p) => p.id!), teamB.map((p) => p.id!)]
}

/**
 * Fill every empty court from the front of the queue (first come, first
 * served). Doubles groups are split into the most even teams by skill.
 */
export function assignCourts(state: SessionState): SessionState {
  const size = playersPerCourt(state.mode)
  let queue = state.queue
  const courts = state.courts.map((court) => {
    if (court.teams || queue.length < size) return court
    const group = queue.slice(0, size)
    queue = queue.slice(size)
    return { ...court, teams: splitTeams(state, group) }
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
    },
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
  }
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
