import { Lock } from 'lucide-react'
import { partnerOf } from '@/matchmaking/grouping'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { SkillBadge } from '@/components/SkillBadge'
import type { SkillLevel } from '@/db/db'
import { estimateWaitMinutes } from '@/rotation/engine'
import type { SessionState } from '@/rotation/types'

interface Props {
  session: SessionState
  /** Ids of the group that will play next; they get a "Next up" badge instead of a wait estimate. */
  nextUp?: number[]
  /** Staff only: change a player's skill level from their badge. */
  onSkillChange?: (playerId: number, skill: SkillLevel) => void
  /** Staff only: tap a player's avatar to change it. */
  editable?: boolean
}

export function QueueList({ session, nextUp = [], onSkillChange, editable = false }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Queue ({session.queue.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {session.queue.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one waiting</p>
        ) : (
          <ol className="divide-y">
            {session.queue.map((id, index) => {
              const player = session.players[id]
              const partner = partnerOf(session.partners, id)
              const wait = estimateWaitMinutes(session, id, session.avgGameMinutes)
              return (
                <li key={id} className="flex items-center gap-3 py-2">
                  <span className="w-6 text-sm text-muted-foreground">{index + 1}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <PlayerAvatar id={id} name={player.name} size="sm" editable={editable} viewable />
                    <span className="min-w-0 truncate">{player.name}</span>
                    {partner !== undefined && (
                      <Lock
                        className="size-3 text-muted-foreground"
                        aria-label={`Locked with ${session.players[partner]?.name}`}
                      />
                    )}
                  </span>
                  <SkillBadge
                    player={player}
                    onChange={onSkillChange ? (skill) => onSkillChange(id, skill) : undefined}
                  />
                  <span className="w-20 text-right text-sm text-muted-foreground">
                    {nextUp.includes(id) ? (
                      <Badge>Next up</Badge>
                    ) : wait ? (
                      `~${wait} min`
                    ) : (
                      'Waiting'
                    )}
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
