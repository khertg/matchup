import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDuration } from '@/lib/time'
import type { MatchRecord, RosterPlayer } from '@/rotation/types'

interface Props {
  matches: MatchRecord[]
  players: Record<number, RosterPlayer>
}

/** Team names as people read them: "Ann & Bo". A player who has since left the session shows as "Unknown". */
const teamNames = (ids: number[], players: Record<number, RosterPlayer>) =>
  ids.map((id) => players[id]?.name ?? 'Unknown').join(' & ')

/** Every game finished this session, newest first, with who won and how it went. */
export function MatchLog({ matches, players }: Props) {
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
              .map((match, index) => ({ match, number: index + 1 }))
              .reverse()
              .map(({ match, number }) => {
                const loser = match.winner === 0 ? 1 : 0
                const [winnerScore, loserScore] = match.score
                  ? [match.score[match.winner], match.score[loser]]
                  : []
                return (
                  <li key={number} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <span className="w-6 text-sm text-muted-foreground">{number}</span>
                    <Badge variant="secondary">{match.courtName}</Badge>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-medium">{teamNames(match.teams[match.winner], players)}</span>
                      {' beat '}
                      {teamNames(match.teams[loser], players)}
                    </span>
                    <span className="text-sm tabular-nums">
                      {match.score ? `${winnerScore}–${loserScore}` : 'No score'}
                    </span>
                    <span className="w-24 text-right text-sm text-muted-foreground">
                      {match.seconds > 0 ? formatDuration(match.seconds) : ''}
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
