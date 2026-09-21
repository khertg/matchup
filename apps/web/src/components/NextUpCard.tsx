import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { skillLabel } from '@/lib/skill'
import type { SkillLevel } from '@/db/db'

interface Props {
  /** Player ids, Team A first and then Team B. Empty when no group can be formed. */
  nextUp: number[]
  players: Record<number, { name: string; skill: SkillLevel }>
  /** Shown when nobody can be listed, so people know what is being waited for. */
  emptyMessage: string
}

const TEAM_NAMES = ['Team A', 'Team B'] as const

/**
 * The group that will play next, already split into teams. Staff read it to call
 * people up before starting a game; the live board shows the same card to players.
 */
export function NextUpCard({ nextUp, players, emptyMessage }: Props) {
  const half = nextUp.length / 2
  const teams = [nextUp.slice(0, half), nextUp.slice(half)]

  return (
    <Card role="group" aria-label="Next up">
      <CardHeader>
        <CardTitle>Next up</CardTitle>
      </CardHeader>
      <CardContent>
        {nextUp.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {teams.map((team, i) => (
              <div key={TEAM_NAMES[i]} className="rounded-lg border p-2">
                <p className="text-xs font-medium text-muted-foreground">{TEAM_NAMES[i]}</p>
                <ul>
                  {team.map((id) => (
                    <li key={id} className="flex items-center justify-between gap-2 py-0.5">
                      <span>{players[id]?.name ?? 'Player'}</span>
                      {players[id] && (
                        <Badge variant="secondary" title={skillLabel(players[id].skill)}>
                          Lv {players[id].skill}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
