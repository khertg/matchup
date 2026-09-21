import type { MatchmakingMode, SessionState, Teams } from '@/rotation/types'

/**
 * Doubles matchmaking: choose four players from the queue, then split them
 * into two teams.
 *
 * The queue is read as "units": a solo player, or a locked partner pair that
 * sits together at the later partner's spot. The first unit that can be
 * completed into a group is the anchor, so first come, first served always
 * holds for the player at the front. The other spots are then filled by the
 * chosen mode, looking only a few units ahead so nobody far back jumps the line.
 */

/** How many units behind the anchor the scored modes may look. */
export const LOOKAHEAD_UNITS = 8
/** Cap for the plain first-come fallback, to bound the search on huge queues. */
const FALLBACK_POOL_UNITS = 24

type Partners = SessionState['partners']
type Score = number[]

interface Unit {
  ids: number[]
  /** Sum of the members' queue indices (a pair counts its later spot twice); lower means they have waited longer. */
  cost: number
}

interface Mode {
  feasible: (state: SessionState, ids: number[]) => boolean
  score: (state: SessionState, ids: number[], cost: number) => Score
}

export function partnerOf(partners: Partners, id: number): number | undefined {
  for (const [a, b] of partners) {
    if (a === id) return b
    if (b === id) return a
  }
  return undefined
}

function buildUnits(queue: number[], partners: Partners): Unit[] {
  const seen = new Set<number>()
  const units: Unit[] = []
  queue.forEach((id, index) => {
    if (seen.has(id)) return
    const partner = partnerOf(partners, id)
    const partnerIndex = partner === undefined ? -1 : queue.indexOf(partner)
    if (partner === undefined || partnerIndex === -1) {
      seen.add(id)
      units.push({ ids: [id], cost: index })
    } else if (partnerIndex < index) {
      // A pair is only a unit while both partners are waiting, and it stands at the later
      // partner's spot, so being locked never moves anyone ahead of people who were waiting.
      seen.add(id)
      seen.add(partner)
      units.push({ ids: [partner, id], cost: index * 2 })
    }
    // else: the partner is further back; the pair is added when the queue reaches them.
  })
  return units
}

function* combos(units: Unit[], need: number, start = 0, chosen: Unit[] = []): Generator<Unit[]> {
  if (need === 0) {
    yield chosen
    return
  }
  for (let i = start; i < units.length; i++) {
    const size = units[i].ids.length
    if (size <= need) yield* combos(units, need - size, i + 1, [...chosen, units[i]])
  }
}

const compare = (a: Score, b: Score) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

const genderCount = (state: SessionState, ids: number[], gender: 'M' | 'F') =>
  ids.filter((id) => state.players[id].gender === gender).length

/** Two men and two women, and every locked pair in the group is one of each. */
export function isMixedGroup(state: SessionState, ids: number[]): boolean {
  if (genderCount(state, ids, 'M') !== 2 || genderCount(state, ids, 'F') !== 2) return false
  return state.partners.every(([a, b]) => {
    if (!ids.includes(a) || !ids.includes(b)) return true
    return state.players[a].gender !== state.players[b].gender
  })
}

const MODES: Record<MatchmakingMode, Mode> = {
  balanced: {
    feasible: () => true,
    score: (_s, _ids, cost) => [cost],
  },
  skill: {
    feasible: () => true,
    score: (state, ids, cost) => {
      const skills = ids.map((id) => state.players[id].skill)
      return [Math.max(...skills) - Math.min(...skills), cost]
    },
  },
  winners: {
    feasible: () => true,
    score: (state, ids, cost) => {
      const won = ids.filter((id) => state.lastResult[id] === 'W').length
      const lost = ids.filter((id) => state.lastResult[id] === 'L').length
      // Players with no result yet fit anywhere; only a W/L mix is penalised.
      return [Math.min(won, lost), cost]
    },
  },
  mixed: {
    feasible: isMixedGroup,
    score: (_s, _ids, cost) => [cost],
  },
}

function pickBest(
  state: SessionState,
  anchor: Unit,
  pool: Unit[],
  need: number,
  mode: Mode,
): number[] | null {
  let best: { ids: number[]; score: Score } | null = null
  for (const combo of combos(pool, need)) {
    const ids = [...anchor.ids, ...combo.flatMap((u) => u.ids)]
    if (!mode.feasible(state, ids)) continue
    const cost = anchor.cost + combo.reduce((sum, u) => sum + u.cost, 0)
    const score = mode.score(state, ids, cost)
    if (!best || compare(score, best.score) < 0) best = { ids, score }
  }
  return best?.ids ?? null
}

export interface SelectOptions {
  /** Pick as if the mode were auto-balanced (used when staff start a court by hand). */
  ignoreMode?: boolean
}

/**
 * Pick the four players for the next doubles game, or null if the queue cannot
 * fill a court yet. Returned ids are in queue order.
 *
 * Skill and Winners vs. Losers are preferences and fall back to first come,
 * first served. Mixed doubles is a requirement: with no valid mixed group the
 * court stays open so a non-mixed game is never staged behind staff's back.
 */
export function selectGroup(
  state: SessionState,
  queue: number[],
  { ignoreMode = false }: SelectOptions = {},
): number[] | null {
  const matchmaking = ignoreMode ? 'balanced' : state.matchmaking
  const units = buildUnits(queue, state.partners)
  for (let a = 0; a < units.length; a++) {
    const anchor = units[a]
    const rest = units.slice(a + 1)
    const need = 4 - anchor.ids.length
    if (rest.reduce((n, u) => n + u.ids.length, 0) < need) return null

    let group: number[] | null = null
    if (matchmaking !== 'balanced') {
      // Mixed is a hard requirement, so search wider for a valid group.
      const window = matchmaking === 'mixed' ? FALLBACK_POOL_UNITS : LOOKAHEAD_UNITS
      group = pickBest(state, anchor, rest.slice(0, window), need, MODES[matchmaking])
      if (!group && matchmaking === 'mixed') continue
    }
    group ??= pickBest(state, anchor, rest.slice(0, FALLBACK_POOL_UNITS), need, MODES.balanced)
    if (group) return group.sort((x, y) => queue.indexOf(x) - queue.indexOf(y))
  }
  return null
}

/**
 * Split four players into two teams: keep locked partners together, keep mixed
 * games one man and one woman per side, then minimise the skill gap.
 */
export function splitGroup(state: SessionState, group: number[]): Teams {
  const [a, b, c, d] = group
  const options: Teams[] = [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ]

  const pairs = state.partners.filter(([x, y]) => group.includes(x) && group.includes(y))
  let allowed = options.filter((teams) =>
    pairs.every(([x, y]) => teams.some((side) => side.includes(x) && side.includes(y))),
  )

  if (state.matchmaking === 'mixed' && isMixedGroup(state, group)) {
    const mixedOnly = allowed.filter((teams) =>
      teams.every((side) => genderCount(state, side, 'M') === 1),
    )
    if (mixedOnly.length > 0) allowed = mixedOnly
  }

  const skill = (side: number[]) => side.reduce((sum, id) => sum + state.players[id].skill, 0)
  const gap = (teams: Teams) => Math.abs(skill(teams[0]) - skill(teams[1]))
  return allowed.reduce((best, teams) => (gap(teams) < gap(best) ? teams : best), allowed[0])
}
