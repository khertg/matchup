import { Lock } from 'lucide-react'
import { partnerOf } from '@/matchmaking/grouping'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { skillLabel } from '@/lib/skill'
import { estimateWaitMinutes } from '@/rotation/engine'
import type { SessionState } from '@/rotation/types'

interface Props {
  session: SessionState
  /** Ids of the group that will play next; they get a "Next up" badge instead of a wait estimate. */
  nextUp?: number[]
}

export function QueueList({ session, nextUp = [] }: Props) {
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
                  <span className="flex flex-1 items-center gap-1">
                    {player.name}
                    {partner !== undefined && (
                      <Lock
                        className="size-3 text-muted-foreground"
                        aria-label={`Locked with ${session.players[partner]?.name}`}
                      />
                    )}
                  </span>
                  <Badge variant="secondary" title={skillLabel(player.skill)}>
                    Lv {player.skill}
                  </Badge>
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
