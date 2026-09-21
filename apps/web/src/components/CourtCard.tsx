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
  /** Locked partner pairs, to mark teams that are locked together. */
  partners: [number, number][]
  /** Read-only cards (the public viewer page) show teams but no controls. */
  readOnly?: boolean
  /** Waiting player ids in queue order, offered as substitutes. */
  queue?: number[]
  onReplace?: (outId: number, inId: number) => void
  /**
   * What an open court can do. "ready": a next group exists, so Start game is offered.
   * "override": no group fits the matchmaking mode (mixed doubles), but staff may start
   * with whoever is waiting. "none": not enough players yet.
   */
  startState?: 'ready' | 'override' | 'none'
  /** Why no game can start yet, shown on an open court when startState is "none". */
  waitingMessage?: string
  onStart?: (options?: { ignoreMode?: boolean }) => void
  onResult?: (winner: 0 | 1) => void
  onCancel?: () => void
}

const TEAM_NAMES = ['Team A', 'Team B'] as const

export function CourtCard({
  court,
  players,
  partners,
  readOnly = false,
  queue = [],
  onReplace,
  startState = 'none',
  waitingMessage = 'Waiting for players to check in',
  onStart,
  onResult,
  onCancel,
}: Props) {
  return (
    <Card role="region" aria-label={court.name}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate">{court.name}</span>
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
                      {!readOnly && onReplace && (
                        <ReplacePlayerDialog
                          player={players[id]}
                          waiting={queue.map((qid) => players[qid])}
                          onReplace={(inId) => onReplace(id, inId)}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!readOnly && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Button className="h-11" onClick={() => onResult?.(0)}>
                    Team A won
                  </Button>
                  <Button className="h-11" onClick={() => onResult?.(1)}>
                    Team B won
                  </Button>
                </div>
                <Button variant="ghost" className="w-full" onClick={onCancel}>
                  Cancel game
                </Button>
              </>
            )}
          </>
        ) : (
          <div className="space-y-3 py-4 text-center">
            {readOnly ? (
              <p className="text-sm text-muted-foreground">Waiting for the next game</p>
            ) : startState === 'ready' ? (
              <>
                <p className="text-sm text-muted-foreground">Ready for the next game</p>
                <Button className="h-11 w-full" onClick={() => onStart?.()}>
                  Start game
                </Button>
              </>
            ) : startState === 'override' ? (
              <>
                <p className="text-sm text-muted-foreground">
                  No group fits this matchmaking mode yet. Check in more players, or start with whoever is
                  waiting.
                </p>
                <Button variant="outline" className="h-11 w-full" onClick={() => onStart?.({ ignoreMode: true })}>
                  Start with waiting players
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{waitingMessage}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
