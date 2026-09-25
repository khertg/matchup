import { ReplacePlayerDialog } from '@/components/ReplacePlayerDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { SkillBadge } from '@/components/SkillBadge'
import { WaitingTime } from '@/components/WaitingTime'
import type { SkillLevel } from '@/db/db'
import { useNow } from '@/lib/time'
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
  /** Staff only: change a player's skill level from their badge. */
  onSkillChange?: (playerId: number, skill: SkillLevel) => void
  /** Staff only: tap a player's avatar to change it. */
  editable?: boolean
  /** Staff only: ms since the epoch each player joined the queue, for a live "waited so far" line. */
  queuedAt?: Record<number, number>
  /**
   * While courts are kept for skill levels: one group per level, shown in place of `nextUp` (and its
   * `emptyMessage` and `waiting`), each under its label such as "3.5+" or "Any level".
   */
  lanes?: NextUpLane[]
}

export interface NextUpLane {
  label: string
  nextUp: number[]
  emptyMessage: string
  /** Staff only: waiting players in this level's range who could take a place in its group. */
  waiting?: RosterPlayer[]
}

type TeamsProps = Pick<
  Props,
  'nextUp' | 'players' | 'waiting' | 'onReplace' | 'onSkillChange' | 'editable' | 'queuedAt'
>

const TEAM_NAMES = ['Team A', 'Team B'] as const

/**
 * The group that will play next, already split into teams. Staff read it to call
 * people up before starting a game; the live board shows the same card to players.
 */
export function NextUpCard({ nextUp, emptyMessage, waiting, picked = false, onReset, lanes, ...shared }: Props) {
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
        {lanes ? (
          <div className="space-y-4">
            {lanes.map((lane) => (
              <section key={lane.label} aria-label={lane.label} className="space-y-2">
                <p className="text-sm font-semibold">{lane.label}</p>
                {lane.nextUp.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{lane.emptyMessage}</p>
                ) : (
                  <GroupTeams {...shared} nextUp={lane.nextUp} waiting={lane.waiting} />
                )}
              </section>
            ))}
          </div>
        ) : nextUp.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <GroupTeams {...shared} nextUp={nextUp} waiting={waiting} />
        )}
      </CardContent>
    </Card>
  )
}

/** One group, split into its two teams. */
function GroupTeams({
  nextUp,
  players,
  waiting = [],
  onReplace,
  onSkillChange,
  editable = false,
  queuedAt,
}: TeamsProps) {
  const now = useNow()
  const half = nextUp.length / 2
  const teams = [nextUp.slice(0, half), nextUp.slice(half)]
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {teams.map((team, i) => (
        <div key={TEAM_NAMES[i]} className="rounded-lg border p-2">
          <p className="text-xs font-medium text-muted-foreground">{TEAM_NAMES[i]}</p>
          <ul>
            {team.map((id) => (
              <li key={id} className="flex items-center justify-between gap-2 py-1">
                <span className="flex min-w-0 items-center gap-2">
                  <PlayerAvatar name={players[id]?.name ?? 'Player'} size="sm" editable={editable} viewable />
                  <span className="min-w-0 truncate">{players[id]?.name ?? 'Player'}</span>
                  {queuedAt?.[id] !== undefined && (
                    <WaitingTime seconds={(now - queuedAt[id]) / 1000} className="text-xs" />
                  )}
                </span>
                {players[id] && (
                  <SkillBadge
                    player={players[id]}
                    onChange={onSkillChange ? (skill) => onSkillChange(id, skill) : undefined}
                  />
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
  )
}
