import type { Player } from '../db/db'

export interface Match {
  teamA: [Player, Player]
  teamB: [Player, Player]
}

const skillSum = (team: Player[]) => team.reduce((sum, p) => sum + p.skill, 0)

/** Split four players into two teams with the smallest skill gap. */
export function balanceDoubles(players: [Player, Player, Player, Player]): Match {
  const [a, b, c, d] = players
  const splits: Match[] = [
    { teamA: [a, b], teamB: [c, d] },
    { teamA: [a, c], teamB: [b, d] },
    { teamA: [a, d], teamB: [b, c] },
  ]
  return splits.reduce((best, m) =>
    Math.abs(skillSum(m.teamA) - skillSum(m.teamB)) <
    Math.abs(skillSum(best.teamA) - skillSum(best.teamB))
      ? m
      : best,
  )
}
