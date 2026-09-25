import type { Player, SkillLevel } from '@/db/db'
import type { SessionState } from './types'

export type Medal = 'gold' | 'silver' | 'bronze'

export interface Standing {
  id: number
  name: string
  skill: SkillLevel
  games: number
  wins: number
  losses: number
  /** 0 to 1. */
  winRate: number
  /** Average skill level of the opposing teams this player has faced. */
  avgOpponentSkill: number
  /** Points scored for and against, over the games that had a score entered. */
  pointsFor: number
  pointsAgainst: number
  /** pointsFor minus pointsAgainst. */
  diff: number
  /** Games that had a score entered; 0 means the +/- is not known and should not be shown as a real 0. */
  scoredGames: number
  /** Total time on court, in whole seconds. */
  secondsPlayed: number
  /** Total time waiting in the queue before those games, in whole seconds. */
  secondsWaited: number
  /** Tied players share a rank (1, 1, 3, ...). */
  rank: number
  medal: Medal | null
}

/** "+5", "-3" or "0"; "-" when no game had a score, so there is no differential to show. */
export function formatDiff({ diff, scoredGames }: Pick<Standing, 'diff' | 'scoredGames'>): string {
  if (scoredGames === 0) return '-'
  return diff > 0 ? `+${diff}` : String(diff)
}

/** Players per share image; also how many row slots a multi-page StandingsCard reserves, so every image in the set is the same size. */
export const STANDINGS_PAGE_SIZE = 10

/** Split a ranked list into pages of up to `pageSize`, in order, for a share image per page. */
export function pageStandings(standings: Standing[], pageSize = STANDINGS_PAGE_SIZE): Standing[][] {
  const pages: Standing[][] = []
  for (let i = 0; i < standings.length; i += pageSize) pages.push(standings.slice(i, i + pageSize))
  return pages
}

const MEDALS: (Medal | null)[] = [null, 'gold', 'silver', 'bronze']
const EPSILON = 1e-9
const sameNumber = (a: number, b: number) => Math.abs(a - b) < EPSILON

/**
 * Session standings for everyone who has finished a game. Ranked by wins, then by point
 * differential (over the games that had a score), then by the strength of opponents faced, then
 * by win rate, then by name. Players level on all four criteria share a rank (and a medal).
 */
export function rankPlayers(state: SessionState): Standing[] {
  const rows = Object.entries(state.stats)
    .filter(([, s]) => s.games > 0)
    .map(([idText, s]) => {
      const id = Number(idText)
      const player = state.players[id]
      return {
        id,
        name: player.name,
        skill: player.skill,
        games: s.games,
        wins: s.wins,
        losses: s.losses,
        winRate: s.wins / s.games,
        avgOpponentSkill: s.opponentSkill / s.games,
        pointsFor: s.pointsFor,
        pointsAgainst: s.pointsAgainst,
        diff: s.pointsFor - s.pointsAgainst,
        scoredGames: s.scoredGames,
        secondsPlayed: s.secondsPlayed,
        secondsWaited: s.secondsWaited,
      }
    })
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        b.diff - a.diff ||
        (sameNumber(a.avgOpponentSkill, b.avgOpponentSkill)
          ? 0
          : b.avgOpponentSkill - a.avgOpponentSkill) ||
        (sameNumber(a.winRate, b.winRate) ? 0 : b.winRate - a.winRate) ||
        a.name.localeCompare(b.name),
    )

  const ranked: Standing[] = []
  rows.forEach((row, index) => {
    const prev = ranked[index - 1]
    const tied =
      prev !== undefined &&
      prev.wins === row.wins &&
      prev.diff === row.diff &&
      sameNumber(prev.avgOpponentSkill, row.avgOpponentSkill) &&
      sameNumber(prev.winRate, row.winRate)
    // Ties share the rank of the first player in the tied group.
    const rank = tied ? prev.rank : index + 1
    ranked.push({ ...row, rank, medal: MEDALS[rank] ?? null })
  })
  return ranked
}

export const MIN_LIFETIME_GAMES = 1
export const MAX_LIFETIME_GAMES = 50

export interface LifetimeRow {
  id: number
  name: string
  games: number
  wins: number
  losses: number
  winRate: number
  rank: number
}

/** All-time leaderboard from saved roster totals, for players with at least `minGames` games. */
export function rankLifetime(players: Player[], minGames: number): LifetimeRow[] {
  const rows = players
    .filter((p) => p.id !== undefined && (p.games ?? 0) >= Math.max(minGames, 1))
    .map((p) => ({
      id: p.id as number,
      name: p.name,
      games: p.games ?? 0,
      wins: p.wins ?? 0,
      losses: p.losses ?? 0,
      winRate: (p.wins ?? 0) / (p.games ?? 1),
    }))
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        (sameNumber(a.winRate, b.winRate) ? 0 : b.winRate - a.winRate) ||
        b.games - a.games ||
        a.name.localeCompare(b.name),
    )

  const ranked: LifetimeRow[] = []
  rows.forEach((row, index) => {
    const prev = ranked[index - 1]
    const tied =
      prev !== undefined &&
      prev.wins === row.wins &&
      sameNumber(prev.winRate, row.winRate) &&
      prev.games === row.games
    ranked.push({ ...row, rank: tied ? prev.rank : index + 1 })
  })
  return ranked
}

export interface PodiumPlace {
  medal: Medal
  /** The rank the medal is for (1, 2 or 3). Tied players share a place. */
  rank: number
  players: Standing[]
}

const PODIUM_MEDALS: Medal[] = ['gold', 'silver', 'bronze']

/**
 * The top three places, gold first, from ranked standings. Tied players share a place (two golds are
 * one place with two players), and a medal nobody won (silver, after a tie for first) is left out.
 */
export function podium(standings: Standing[]): PodiumPlace[] {
  return PODIUM_MEDALS.flatMap((medal) => {
    const players = standings.filter((row) => row.medal === medal)
    return players.length > 0 ? [{ medal, rank: players[0].rank, players }] : []
  })
}
