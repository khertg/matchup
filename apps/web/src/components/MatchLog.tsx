import { MoreVerticalIcon } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EditMatchPlayersDialog } from '@/components/EditMatchPlayersDialog'
import { EditMatchScoreDialog } from '@/components/EditMatchScoreDialog'
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDuration } from '@/lib/time'
import type { MatchRecord, RosterPlayer, Teams } from '@/rotation/types'

interface Props {
  matches: MatchRecord[]
  players: Record<number, RosterPlayer>
  /** Staff only: correct a past match's score from its "⋮" menu. */
  onEditScore?: (matchIndex: number, score: [number, number]) => void
  /** Staff only: reassign a past match's players from its "⋮" menu. */
  onEditPlayers?: (matchIndex: number, teams: Teams) => void
}

/**
 * One team's players, one per line: "Ann (0:04)", each with how long they had waited before this
 * match started, when known and not zero. A player who has since left the session shows as "Unknown".
 */
function TeamLines({
  ids,
  players,
  waited,
  className,
}: {
  ids: number[]
  players: Record<number, RosterPlayer>
  waited?: Record<number, number>
  className: string
}) {
  return ids.map((id, i) => {
    const name = players[id]?.name ?? 'Unknown'
    const seconds = waited?.[id]
    return (
      <span key={`${id}-${i}`} className={`block break-words ${className}`}>
        {seconds ? `${name} (${formatDuration(seconds)})` : name}
      </span>
    )
  })
}

/** Every game finished this session, newest first, with who won and how it went. */
export function MatchLog({ matches, players, onEditScore, onEditPlayers }: Props) {
  const [active, setActive] = useState<{ index: number; kind: 'score' | 'players' } | null>(null)
  const editable = Boolean(onEditScore || onEditPlayers)
  const activeMatch = active ? matches[active.index] : undefined

  return (
    <Card role="group" aria-label="Matches">
      <CardHeader>
        <CardTitle>Matches ({matches.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No games finished yet</p>
        ) : (
          <ol className="divide-y">
            {matches
              .map((match, index) => ({ match, index, number: index + 1 }))
              .reverse()
              .map(({ match, index, number }) => {
                const loser = match.winner === 0 ? 1 : 0
                const [winnerScore, loserScore] = match.score
                  ? [match.score[match.winner], match.score[loser]]
                  : []
                return (
                  <li key={number} className="flex items-center gap-3 py-2 text-sm">
                    <span className="min-w-7 shrink-0 tabular-nums text-muted-foreground">#{number}</span>

                    {/* Players and scores share one grid, so each score and both dividers stay level with their team however its names wrap. */}
                    <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,20rem)_1.75rem] items-center gap-x-3">
                      <div>
                        <TeamLines
                          ids={match.teams[match.winner]}
                          players={players}
                          waited={match.waited}
                          className="font-medium"
                        />
                      </div>
                      <span className="text-center font-medium tabular-nums">{match.score ? winnerScore : '–'}</span>
                      <div className="my-1 border-t border-border" />
                      <div className="my-1 border-t border-border" />
                      <div>
                        <TeamLines
                          ids={match.teams[loser]}
                          players={players}
                          waited={match.waited}
                          className="text-muted-foreground"
                        />
                      </div>
                      <span className="text-center text-muted-foreground tabular-nums">{match.score ? loserScore : '–'}</span>
                    </div>

                    <div className="ml-auto flex shrink-0 flex-col items-center gap-1">
                      <Badge variant="secondary">{match.courtName}</Badge>
                      {match.seconds > 0 && (
                        <span className="text-xs text-muted-foreground">{formatDuration(match.seconds)}</span>
                      )}
                    </div>

                    {editable && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="shrink-0"
                            aria-label={`Match ${number} menu`}
                          >
                            <MoreVerticalIcon aria-hidden="true" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-40 p-1">
                          {onEditScore && (
                            <PopoverClose asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                className="w-full justify-start"
                                onClick={() => setActive({ index, kind: 'score' })}
                              >
                                Edit score
                              </Button>
                            </PopoverClose>
                          )}
                          {onEditPlayers && (
                            <PopoverClose asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                className="w-full justify-start"
                                onClick={() => setActive({ index, kind: 'players' })}
                              >
                                Edit players
                              </Button>
                            </PopoverClose>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}
                  </li>
                )
              })}
          </ol>
        )}
      </CardContent>

      {onEditScore && activeMatch && (
        <EditMatchScoreDialog
          courtName={activeMatch.courtName}
          teamNames={[
            activeMatch.teams[0].map((id) => players[id]?.name ?? 'Unknown'),
            activeMatch.teams[1].map((id) => players[id]?.name ?? 'Unknown'),
          ]}
          score={activeMatch.score ?? [0, 0]}
          open={active?.kind === 'score'}
          onOpenChange={(open) => setActive(open ? active : null)}
          onSubmit={(scoreA, scoreB) => active && onEditScore(active.index, [scoreA, scoreB])}
        />
      )}
      {onEditPlayers && activeMatch && (
        <EditMatchPlayersDialog
          courtName={activeMatch.courtName}
          teams={activeMatch.teams}
          players={players}
          open={active?.kind === 'players'}
          onOpenChange={(open) => setActive(open ? active : null)}
          onSubmit={(teams) => active && onEditPlayers(active.index, teams)}
        />
      )}
    </Card>
  )
}
