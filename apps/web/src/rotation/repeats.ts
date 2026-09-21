import type { SessionState } from './types'

/**
 * How often players teamed up, or faced each other, over a whole session. Read from the finished
 * games (`state.matches`), so it works for the running session and for every saved one.
 */

export interface PairCount {
  /** The other player. */
  id: number
  count: number
}

export interface PlayerRepeats {
  id: number
  name: string
  /** Games this player finished. */
  games: number
  /** Every partner and how many times, most repeated first. Empty in singles. */
  partners: PairCount[]
  /** Every opponent and how many times, most repeated first. */
  opponents: PairCount[]
}

export interface PairTotal {
  a: number
  b: number
  count: number
}

export interface RepeatSummary {
  /** Finished games. */
  games: number
  /** Team slots: two per doubles game (none in singles, where nobody has a partner). */
  partnerships: number
  differentPartnerships: number
  /** A pair teaming up again: `partnerships` minus `differentPartnerships`. */
  repeatedPartnerships: number
  /** Opposing pairs: four per doubles game, one per singles game. */
  opponentPairings: number
  differentOpponentPairings: number
  repeatedOpponentPairings: number
  /** The pair who teamed up most, if any pair did it more than once. */
  topPartnership?: PairTotal
  /** The pair who faced each other most, if any pair did it more than once. */
  topMatchup?: PairTotal
}

export interface RepeatStats {
  summary: RepeatSummary
  /** Everyone who finished a game, the most repeated first, then by name. */
  players: PlayerRepeats[]
}

const pairKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`)

function top(counts: Map<string, number>): PairTotal | undefined {
  let best: PairTotal | undefined
  for (const [key, count] of counts) {
    if (count > 1 && (!best || count > best.count)) {
      const [a, b] = key.split(',').map(Number)
      best = { a, b, count }
    }
  }
  return best
}

export function repeatStats(state: SessionState): RepeatStats {
  const matches = state.matches ?? []
  const partnerPairs = new Map<string, number>()
  const opponentPairs = new Map<string, number>()
  const games = new Map<number, number>()
  const partnersOf = new Map<number, Map<number, number>>()
  const opponentsOf = new Map<number, Map<number, number>>()
  let partnerships = 0
  let opponentPairings = 0

  const bumpPlayer = (of: Map<number, Map<number, number>>, id: number, other: number) => {
    const counts = of.get(id) ?? new Map<number, number>()
    counts.set(other, (counts.get(other) ?? 0) + 1)
    of.set(id, counts)
  }

  for (const { teams } of matches) {
    for (const id of teams.flat()) games.set(id, (games.get(id) ?? 0) + 1)
    for (const team of teams) {
      // Only a team of two has a partnership; a singles player stands alone.
      if (team.length !== 2) continue
      const [a, b] = team
      partnerships++
      partnerPairs.set(pairKey(a, b), (partnerPairs.get(pairKey(a, b)) ?? 0) + 1)
      bumpPlayer(partnersOf, a, b)
      bumpPlayer(partnersOf, b, a)
    }
    for (const a of teams[0]) {
      for (const b of teams[1]) {
        opponentPairings++
        opponentPairs.set(pairKey(a, b), (opponentPairs.get(pairKey(a, b)) ?? 0) + 1)
        bumpPlayer(opponentsOf, a, b)
        bumpPlayer(opponentsOf, b, a)
      }
    }
  }

  const nameOf = (id: number) => state.players[id]?.name ?? 'Unknown'
  const list = (counts: Map<number, number> | undefined): PairCount[] =>
    [...(counts ?? [])]
      .map(([id, count]) => ({ id, count }))
      .sort((x, y) => y.count - x.count || nameOf(x.id).localeCompare(nameOf(y.id)))

  const players: PlayerRepeats[] = [...games].map(([id, played]) => ({
    id,
    name: nameOf(id),
    games: played,
    partners: list(partnersOf.get(id)),
    opponents: list(opponentsOf.get(id)),
  }))
  const most = (p: PlayerRepeats) => Math.max(p.partners[0]?.count ?? 0, p.opponents[0]?.count ?? 0)
  players.sort((x, y) => most(y) - most(x) || x.name.localeCompare(y.name))

  return {
    summary: {
      games: matches.length,
      partnerships,
      differentPartnerships: partnerPairs.size,
      repeatedPartnerships: partnerships - partnerPairs.size,
      opponentPairings,
      differentOpponentPairings: opponentPairs.size,
      repeatedOpponentPairings: opponentPairings - opponentPairs.size,
      topPartnership: top(partnerPairs),
      topMatchup: top(opponentPairs),
    },
    players,
  }
}
