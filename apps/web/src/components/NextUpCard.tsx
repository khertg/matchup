import { ReplacePlayerDialog } from '@/components/ReplacePlayerDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { skillLabel } from '@/lib/skill'
import type { RosterPlayer } from '@/rotation/types'

interface Props {
  /** Player ids, Team A first and then Team B. Empty when no group can be formed. */
  nextUp: number[]
  players: Record<number, RosterPlayer>
  /** Shown when nobody can be listed, so people know what is being waited for. */
  emptyMessage: string
  /**
   * Staff only: the other waiting players, in queue order, who could take a place in the group.
   * Without `onReplace` the card is read-only, as on the players' live page.
   */
  waiting?: RosterPlayer[]
  onReplace?: (outId: number, inId: number) => void
  /** The group was chosen by staff, so it can be reset to the automatic one. */
  picked?: boolean
  onReset?: () => void
}

const TEAM_NAMES = ['Team A', 'Team B'] as const

/**
 * The group that will play next, already split into teams. Staff read it to call
 * people up before starting a game; the live board shows the same card to players.
 */
export function NextUpCard({ nextUp, players, emptyMessage, waiting = [], onReplace, picked = false, onReset }: Props) {
  const half = nextUp.length / 2
  const teams = [nextUp.slice(0, half), nextUp.slice(half)]

  return (
    <Card role="group" aria-label="Next up">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>Next up</span>
          {picked && onReset && (
            <span className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
              Chosen by staff
              <Button variant="outline" size="sm" onClick={onReset}>
                Reset
              </Button>
            </span>
          )}
        </CardTitle>
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
                      {onReplace && players[id] && (
                        <ReplacePlayerDialog
                          mode="nextUp"
                          player={players[id]}
                          waiting={waiting}
                          onReplace={(inId) => onReplace(id, inId)}
                        />
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
