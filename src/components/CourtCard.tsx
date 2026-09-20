import { Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ReplacePlayerDialog } from '@/components/ReplacePlayerDialog'
import { skillLabel } from '@/lib/skill'
import type { Court, RosterPlayer } from '@/rotation/types'

interface Props {
  court: Court
  players: Record<number, RosterPlayer>
  /** Waiting player ids in queue order, offered as substitutes. */
  queue: number[]
  /** Locked partner pairs, to mark teams that are locked together. */
  partners: [number, number][]
  onReplace: (outId: number, inId: number) => void
  /** True when waiting players could start a game here despite the matchmaking mode. */
  canStart: boolean
  onStart: () => void
  onResult: (winner: 0 | 1) => void
  onCancel: () => void
}

const TEAM_NAMES = ['Team A', 'Team B'] as const

export function CourtCard({
  court,
  players,
  queue,
  partners,
  onReplace,
  canStart,
  onStart,
  onResult,
  onCancel,
}: Props) {
  return (
    <Card role="region" aria-label={`Court ${court.id}`}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Court {court.id}
          {court.teams ? <Badge>In play</Badge> : <Badge variant="outline">Open</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {court.teams ? (
          <>
            {court.teams.map((team, i) => (
              <div
                key={TEAM_NAMES[i]}
                role="group"
                aria-label={TEAM_NAMES[i]}
                className="rounded-lg border p-2"
              >
                <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  {TEAM_NAMES[i]}
                  {partners.some(([x, y]) => team.includes(x) && team.includes(y)) && (
                    <Lock className="size-3" aria-label="Locked partners" />
                  )}
                </p>
                <ul>
                  {team.map((id) => (
                    <li key={id} className="flex items-center gap-2 py-0.5">
                      <span className="flex-1">{players[id]?.name}</span>
                      <Badge variant="secondary" title={skillLabel(players[id]?.skill)}>
                        Lv {players[id]?.skill}
                      </Badge>
                      <ReplacePlayerDialog
                        player={players[id]}
                        waiting={queue.map((qid) => players[qid])}
                        onReplace={(inId) => onReplace(id, inId)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <Button className="h-11" onClick={() => onResult(0)}>
                Team A won
              </Button>
              <Button className="h-11" onClick={() => onResult(1)}>
                Team B won
              </Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={onCancel}>
              Cancel game
            </Button>
          </>
        ) : (
          <div className="space-y-3 py-4 text-center">
            <p className="text-sm text-muted-foreground">
              {canStart
                ? 'No group fits this matchmaking mode yet. Check in more players, or start with whoever is waiting.'
                : 'Waiting for players to check in'}
            </p>
            {canStart && (
              <Button variant="outline" className="h-11 w-full" onClick={onStart}>
                Start with waiting players
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
