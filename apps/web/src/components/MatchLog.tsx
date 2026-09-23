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
 * Team names as people read them: "Ann (4 min) & Bo (7 min)", each with how long they had waited
 * before this match started, when known. A player who has since left the session shows as "Unknown".
 */
const teamNames = (ids: number[], players: Record<number, RosterPlayer>, waited?: Record<number, number>) =>
  ids
    .map((id) => {
      const name = players[id]?.name ?? 'Unknown'
      const seconds = waited?.[id]
      return seconds !== undefined ? `${name} (${formatDuration(seconds)})` : name
    })
    .join(' & ')

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
          <ol
            className={`grid gap-x-3 divide-y ${
              editable
                ? 'grid-cols-[1.5rem_minmax(0,max-content)_2rem_1fr_auto]'
                : 'grid-cols-[1.5rem_minmax(0,max-content)_2rem_1fr]'
            }`}
          >
            {matches
              .map((match, index) => ({ match, index, number: index + 1 }))
              .reverse()
              .map(({ match, index, number }) => {
                const loser = match.winner === 0 ? 1 : 0
                const [winnerScore, loserScore] = match.score
                  ? [match.score[match.winner], match.score[loser]]
                  : []
                return (
                  <li
                    key={number}
                    className="col-span-full grid grid-cols-subgrid items-center gap-x-3 gap-y-0.5 py-2 text-sm"
                  >
                    <span className="row-span-2 self-center text-muted-foreground">{number}</span>
                    <span className="min-w-0 font-medium">{teamNames(match.teams[match.winner], players, match.waited)}</span>
                    <span className="tabular-nums font-medium">{match.score ? winnerScore : '–'}</span>
                    <Badge variant="secondary" className="justify-self-end">
                      {match.courtName}
                    </Badge>
                    {editable && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="row-span-2 self-center justify-self-end"
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

                    <span className="min-w-0 text-muted-foreground">{teamNames(match.teams[loser], players, match.waited)}</span>
                    <span className="tabular-nums text-muted-foreground">{match.score ? loserScore : '–'}</span>
                    <span className="justify-self-end text-xs text-muted-foreground">
                      {match.seconds > 0 ? formatDuration(match.seconds) : ''}
                    </span>
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
