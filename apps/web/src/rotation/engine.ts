import { MAX_COURT_NAME_LENGTH } from '@matchup/shared'
import { partnerOf, selectGroup, splitGroup } from '../matchmaking/grouping'
import type {
  Court,
  GameMode,
  MatchmakingMode,
  PlayerStats,
  RosterPlayer,
  SessionState,
  Teams,
} from './types'

/**
 * Court rotation engine. Every function is pure: it returns a new state and
 * never mutates its input, so undo is just keeping the previous state.
 */

export const playersPerCourt = (mode: GameMode) => (mode === 'doubles' ? 4 : 2)

export const MIN_COURTS = 1
export const MAX_COURTS = 15
export { MAX_COURT_NAME_LENGTH }

export const DEFAULT_AVG_GAME_MINUTES = 12
export const MIN_AVG_GAME_MINUTES = 5
export const MAX_AVG_GAME_MINUTES = 60

export const isValidGameMinutes = (minutes: number) =>
  Number.isInteger(minutes) && minutes >= MIN_AVG_GAME_MINUTES && minutes <= MAX_AVG_GAME_MINUTES

/** The highest score a team can be given for one game. */
export const MAX_SCORE = 99

/**
 * The longest game whose time is recorded. A game left open overnight would otherwise credit
 * everyone on it with hours they never played.
 */
export const MAX_GAME_SECONDS = 3 * 60 * 60

/** The stats of a player who has not finished a game. */
export const EMPTY_STATS: Readonly<PlayerStats> = {
  games: 0,
  wins: 0,
  losses: 0,
  opponentSkill: 0,
  pointsFor: 0,
  pointsAgainst: 0,
  scoredGames: 0,
  secondsPlayed: 0,
}

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
  if (!Number.isInteger(courtCount) || courtCount < MIN_COURTS || courtCount > MAX_COURTS) {
    throw new RangeError(`courtCount must be an integer from ${MIN_COURTS} to ${MAX_COURTS}`)
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
    stats: {},
    courts: Array.from({ length: courtCount }, (_, i) => ({
      id: i + 1,
      name: `Court ${i + 1}`,
      teams: null,
    })),
    players: {},
    queue: [],
    onBreak: [],
  }
}

// ---- court management ------------------------------------------------------

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** The lowest "Court N" not in use, so closing Court 2 and adding a court brings Court 2 back. */
export function defaultCourtName(courts: Court[]): string {
  for (let n = 1; ; n++) {
    const name = `Court ${n}`
    if (!courts.some((court) => sameName(court.name, name))) return name
  }
}

/** A name that is trimmed, 1 to 40 characters, and unique among the other courts. */
function checkCourtName(courts: Court[], name: string, exceptId?: number): string {
  const trimmed = name.trim()
  if (trimmed.length < 1) throw new RangeError('Give the court a name')
  if (trimmed.length > MAX_COURT_NAME_LENGTH) {
    throw new RangeError(`Court names can be at most ${MAX_COURT_NAME_LENGTH} characters`)
  }
  if (courts.some((court) => court.id !== exceptId && sameName(court.name, trimmed))) {
    throw new RangeError('Another court already has that name')
  }
  return trimmed
}

function findCourt(state: SessionState, courtId: number): Court {
  const court = state.courts.find((c) => c.id === courtId)
  if (!court) throw new Error(`Court ${courtId} does not exist`)
  return court
}

/** Open another court, named with the lowest free number unless a name is given. */
export function addCourt(state: SessionState, name?: string): SessionState {
  if (state.courts.length >= MAX_COURTS) {
    throw new RangeError(`A session can have at most ${MAX_COURTS} courts`)
  }
  const id = Math.max(0, ...state.courts.map((c) => c.id)) + 1
  const courtName = name === undefined ? defaultCourtName(state.courts) : checkCourtName(state.courts, name)
  return { ...state, courts: [...state.courts, { id, name: courtName, teams: null }] }
}

/** Rename a court. A game in progress is unaffected. */
export function renameCourt(state: SessionState, courtId: number, name: string): SessionState {
  findCourt(state, courtId)
  const courtName = checkCourtName(state.courts, name, courtId)
  return {
    ...state,
    courts: state.courts.map((c) => (c.id === courtId ? { ...c, name: courtName } : c)),
  }
}

/** Move a court one place up (-1) or down (1) in the board order. Does nothing at either end. */
export function moveCourt(state: SessionState, courtId: number, offset: -1 | 1): SessionState {
  const index = state.courts.findIndex((c) => c.id === courtId)
  if (index === -1) throw new Error(`Court ${courtId} does not exist`)
  const target = index + offset
  if (target < 0 || target >= state.courts.length) return state
  const courts = [...state.courts]
  ;[courts[index], courts[target]] = [courts[target], courts[index]]
  return { ...state, courts }
}

/**
 * Close a court. A game in progress is cancelled with no result and its players
 * go back to the front of the queue. A session always keeps at least one court.
 */
export function closeCourt(state: SessionState, courtId: number): SessionState {
  const court = findCourt(state, courtId)
  if (state.courts.length <= MIN_COURTS) throw new RangeError('A session needs at least one court')
  return {
    ...state,
    courts: state.courts.filter((c) => c.id !== courtId),
    // The cancelled game records no time.
    queue: court.teams ? [...court.teams.flat(), ...state.queue] : state.queue,
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
    ...withoutPickIncluding(state, playerId),
    queue: state.queue.filter((id) => id !== playerId),
    onBreak: [...state.onBreak, playerId],
  }
}

/** The group that would play next, already split into teams. */
export interface NextGroup {
  /** Team A first, then Team B. */
  players: number[]
  teams: Teams
}

export interface NextGroupOptions {
  /** Choose as if the mode were auto-balanced (the mixed-doubles "start with who is waiting" override). */
  ignoreMode?: boolean
}

/**
 * Who would play next, or null if no group can be formed yet. Games never start
 * by themselves: staff see this group as "Next up" and start it on a court of
 * their choice. Singles is first come, first served (two players). Doubles
 * groups follow the session's matchmaking mode and locked partners and are
 * split into teams (see src/matchmaking/grouping.ts). The teams shown here are
 * exactly the teams startGame puts on court.
 */
export function nextGroup(state: SessionState, options: NextGroupOptions = {}): NextGroup | null {
  const picked = pickedGroup(state)
  if (picked) return picked
  if (state.mode === 'singles') {
    if (state.queue.length < 2) return null
    const [a, b] = state.queue
    return { players: [a, b], teams: [[a], [b]] }
  }
  const group = selectGroup(state, state.queue, options)
  if (!group) return null
  const teams = splitGroup(state, group)
  return { players: teams.flat(), teams }
}

/** The staff-chosen group, split into teams, while all of it is still waiting; otherwise null. */
function pickedGroup(state: SessionState): NextGroup | null {
  const pick = state.nextUpPick
  if (!pick || pick.length !== playersPerCourt(state.mode)) return null
  if (new Set(pick).size !== pick.length || !pick.every((id) => state.queue.includes(id))) return null
  const teams: Teams = state.mode === 'singles' ? [[pick[0]], [pick[1]]] : splitGroup(state, pick)
  return { players: teams.flat(), teams }
}

/** Whether the next group is one staff chose, rather than the automatic pick. */
export const isNextUpPicked = (state: SessionState) => pickedGroup(state) !== null

/** The state without a staff-chosen group. Anything that changes who is waiting or playing ends the choice. */
function withoutPick(state: SessionState): SessionState {
  if (state.nextUpPick === undefined) return state
  const { nextUpPick: _pick, ...rest } = state
  return rest
}

/** The state without the staff-chosen group if this player is in it. */
function withoutPickIncluding(state: SessionState, playerId: number): SessionState {
  return state.nextUpPick?.includes(playerId) ? withoutPick(state) : state
}

/**
 * Change who is in the next group: `inId` (waiting, not already in it) takes the place of `outId`
 * (in it). `outId` stays in the queue where they were. The group is kept as chosen until a game
 * starts or one of them leaves the queue. Locked pairs of both players are dissolved, since a pair
 * cannot stay together across the change.
 */
export function replaceNextUp(state: SessionState, outId: number, inId: number): SessionState {
  const group = nextGroup(state)
  if (!group) throw new Error('There is no next group to change')
  if (!group.players.includes(outId)) throw new Error(`Player ${outId} is not in the next group`)
  if (group.players.includes(inId) || !state.queue.includes(inId)) {
    throw new Error('The replacement must be a waiting player who is not already in the next group')
  }
  return {
    ...state,
    nextUpPick: group.players.map((id) => (id === outId ? inId : id)),
    partners: state.partners.filter((pair) => !pair.includes(outId) && !pair.includes(inId)),
  }
}

/** Go back to the automatic next group. */
export function resetNextUp(state: SessionState): SessionState {
  return withoutPick(state)
}

export interface StartGameOptions extends NextGroupOptions {
  /**
   * When the game starts (ms since the epoch), so its duration can be recorded. The engine never
   * reads the clock itself; the store passes Date.now(). Without it the game records no time.
   */
  now?: number
}

/**
 * Put the next group on an open court. Throws if the court is busy or unknown,
 * or if no group can be formed. The players leave the queue.
 */
export function startGame(state: SessionState, courtId: number, options: StartGameOptions = {}): SessionState {
  const court = findCourt(state, courtId)
  if (court.teams) throw new Error(`${court.name} already has a game in progress`)
  const group = nextGroup(state, options)
  if (!group) throw new Error('Not enough players are waiting to start a game')
  return {
    ...withoutPick(state),
    courts: state.courts.map((c) =>
      c.id === courtId
        ? { ...c, teams: group.teams, ...(options.now === undefined ? {} : { startedAt: options.now }) }
        : c,
    ),
    queue: state.queue.filter((id) => !group.players.includes(id)),
  }
}

export interface GameResult {
  state: SessionState
  winners: number[]
  losers: number[]
}

export interface ResultOptions {
  /** When the game ended (ms since the epoch). Without it the game records no time. */
  now?: number
}

export const isValidScore = (n: number) => Number.isInteger(n) && n >= 0 && n <= MAX_SCORE

/** Why a score cannot be recorded, or null if it can. Scores are whole numbers from 0 to MAX_SCORE and never level. */
export function scoreProblem(a: number, b: number): string | null {
  if (!isValidScore(a) || !isValidScore(b)) return `Scores must be whole numbers from 0 to ${MAX_SCORE}`
  if (a === b) return 'The scores are level. A game needs a winner.'
  return null
}

const TEAM_LABELS = ['Team A', 'Team B'] as const

/**
 * Why a score cannot be recorded for a game that this team won, or null if it can: the same checks
 * as scoreProblem, and the winner's score must be the higher one.
 */
export function winnerScoreProblem(winner: 0 | 1, scoreA: number, scoreB: number): string | null {
  const problem = scoreProblem(scoreA, scoreB)
  if (problem) return problem
  const winnerScore = winner === 0 ? scoreA : scoreB
  const otherScore = winner === 0 ? scoreB : scoreA
  return winnerScore > otherScore ? null : `${TEAM_LABELS[winner]} won, so their score must be higher.`
}

/**
 * Whole seconds the game on this court has lasted, from 0 to MAX_GAME_SECONDS. 0 when the
 * game has no start time (it began before times were tracked) or no end time is given.
 */
function gameSeconds(court: Court, now: number | undefined): number {
  if (court.startedAt === undefined || now === undefined) return 0
  const seconds = Math.floor((now - court.startedAt) / 1000)
  return Number.isFinite(seconds) ? Math.min(Math.max(seconds, 0), MAX_GAME_SECONDS) : 0
}

/** The court with no game on it. Also drops the start time. */
const openCourt = (court: Court): Court => ({ id: court.id, name: court.name, teams: null })

/**
 * Record a finished game. `winner` is the index (0 or 1) of the winning side.
 * The court is freed and both sides rejoin the back of the queue, winners
 * first. Nothing starts by itself: staff start the next game with startGame.
 * No score is kept (see recordScore), but the game's time is recorded when `now` is given.
 */
export function recordResult(
  state: SessionState,
  courtId: number,
  winner: 0 | 1,
  { now }: ResultOptions = {},
): GameResult {
  return finishGame(state, courtId, winner, undefined, now)
}

/**
 * Record a finished game from its score. The higher score wins; equal scores, or scores that are
 * not whole numbers from 0 to MAX_SCORE, throw a RangeError. Otherwise exactly like recordResult,
 * and it also adds the points to everyone's totals.
 */
export function recordScore(
  state: SessionState,
  courtId: number,
  scoreA: number,
  scoreB: number,
  { now }: ResultOptions = {},
): GameResult {
  const problem = scoreProblem(scoreA, scoreB)
  if (problem) throw new RangeError(problem)
  return finishGame(state, courtId, scoreA > scoreB ? 0 : 1, [scoreA, scoreB], now)
}

/**
 * Shared by recordResult and recordScore. The game's time is credited to whoever is on the court
 * when it ends: a substitute made mid-game gets all of it and the player who left gets none.
 */
function finishGame(
  state: SessionState,
  courtId: number,
  winner: 0 | 1,
  score: [number, number] | undefined,
  now: number | undefined,
): GameResult {
  const court = state.courts.find((c) => c.id === courtId)
  if (!court?.teams) throw new Error(`Court ${courtId} has no game in progress`)
  const loser = winner === 0 ? 1 : 0
  const winners = court.teams[winner]
  const losers = court.teams[loser]
  const seconds = gameSeconds(court, now)
  const stats = { ...state.stats }
  const averageSkill = (ids: number[]) =>
    ids.reduce((sum, id) => sum + state.players[id].skill, 0) / ids.length
  const tally = (ids: number[], opponents: number[], won: boolean) => {
    const opponentSkill = averageSkill(opponents)
    const pointsFor = score?.[won ? winner : loser] ?? 0
    const pointsAgainst = score?.[won ? loser : winner] ?? 0
    for (const id of ids) {
      const prev = stats[id] ?? EMPTY_STATS
      stats[id] = {
        games: prev.games + 1,
        wins: prev.wins + (won ? 1 : 0),
        losses: prev.losses + (won ? 0 : 1),
        opponentSkill: prev.opponentSkill + opponentSkill,
        pointsFor: prev.pointsFor + pointsFor,
        pointsAgainst: prev.pointsAgainst + pointsAgainst,
        scoredGames: prev.scoredGames + (score ? 1 : 0),
        secondsPlayed: prev.secondsPlayed + seconds,
      }
    }
  }
  tally(winners, losers, true)
  tally(losers, winners, false)
  return {
    winners,
    losers,
    state: {
      ...state,
      courts: state.courts.map((c) => (c.id === courtId ? openCourt(c) : c)),
      queue: [...state.queue, ...winners, ...losers],
      lastResult: {
        ...state.lastResult,
        ...Object.fromEntries(winners.map((id) => [id, 'W' as const])),
        ...Object.fromEntries(losers.map((id) => [id, 'L' as const])),
      },
      stats,
      matches: [
        ...(state.matches ?? []),
        {
          courtName: court.name,
          teams: court.teams,
          winner,
          ...(score ? { score } : {}),
          seconds,
          ...(now === undefined ? {} : { endedAt: now }),
        },
      ],
    },
  }
}

/** Abandon a game without a result or a time. Its players return to the front of the queue. */
export function cancelMatch(state: SessionState, courtId: number): SessionState {
  const court = state.courts.find((c) => c.id === courtId)
  if (!court?.teams) throw new Error(`Court ${courtId} has no game in progress`)
  return {
    ...state,
    courts: state.courts.map((c) => (c.id === courtId ? openCourt(c) : c)),
    queue: [...court.teams.flat(), ...state.queue],
  }
}

export interface ReplacePlayerOptions {
  /** Send the player who comes off on a break. Otherwise they go to the front of the queue. */
  sendOnBreak?: boolean
}

/**
 * Swap a player out of a live game. The substitute defaults to the front of the queue and takes
 * the same side. The player who comes off goes to the front of the queue, or on a break when
 * asked to.
 */
export function replacePlayer(
  state: SessionState,
  courtId: number,
  outId: number,
  inId: number | undefined = state.queue[0],
  { sendOnBreak = false }: ReplacePlayerOptions = {},
): SessionState {
  const court = state.courts.find((c) => c.id === courtId)
  if (!court?.teams?.flat().includes(outId)) {
    throw new Error(`Player ${outId} is not playing on court ${courtId}`)
  }
  if (inId === undefined || !state.queue.includes(inId)) {
    throw new Error('Substitute must be a player waiting in the queue')
  }
  const swap = (side: number[]) => side.map((id) => (id === outId ? inId : id))
  const waiting = state.queue.filter((id) => id !== inId)
  return {
    ...withoutPickIncluding(state, inId),
    courts: state.courts.map((c) =>
      c.id === courtId ? { ...c, teams: [swap(court.teams![0]), swap(court.teams![1])] } : c,
    ),
    queue: sendOnBreak ? waiting : [outId, ...waiting],
    onBreak: sendOnBreak ? [...state.onBreak, outId] : state.onBreak,
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
