import { MedalBadge } from '@/components/MedalBadge'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { RepeatStats } from '@/components/RepeatStats'
import { StatsCardDialog } from '@/components/StatsCardDialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDuration } from '@/lib/time'
import { rankPlayers, type Standing } from '@/rotation/standings'
import type { SessionState } from '@/rotation/types'

/** "+5", "-3" or "0"; "-" when no game had a score, so there is no differential to show. */
function formatDiff({ diff, scoredGames }: Standing): string {
  if (scoredGames === 0) return '-'
  return diff > 0 ? `+${diff}` : String(diff)
}

interface Props {
  session: SessionState
  location: string
  /** Read-only views (the public viewer page) hide the share-card buttons. */
  readOnly?: boolean
  /** Also show how often partners and opponents repeated. Needs the finished games, which the public live page does not have. */
  repeatStats?: boolean
}

export function StandingsScreen({ session, location, readOnly = false, repeatStats = false }: Props) {
  const standings = rankPlayers(session)
  const date = new Date().toLocaleDateString()

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader>
        <CardTitle>Standings</CardTitle>
      </CardHeader>
      <CardContent>
        {standings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No games played yet. Standings appear after the first result.
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead className="text-right">GP</TableHead>
                  <TableHead className="text-right">W</TableHead>
                  <TableHead className="text-right">L</TableHead>
                  <TableHead className="text-right">Win %</TableHead>
                  <TableHead className="text-right" title="Points for minus points against, in games with a score">
                    +/-
                  </TableHead>
                  <TableHead className="text-right" title="Average skill level of opponents faced">
                    Opp.
                  </TableHead>
                  <TableHead className="text-right" title="Total time on court">
                    Time
                  </TableHead>
                  {!readOnly && (
                    <TableHead className="w-12">
                      <span className="sr-only">Share</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {standings.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <span className="inline-flex items-center gap-1">
                        {row.rank}
                        <MedalBadge medal={row.medal} />
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        <PlayerAvatar id={row.id} name={row.name} size="sm" editable={!readOnly} viewable />
                        {row.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{row.games}</TableCell>
                    <TableCell className="text-right">{row.wins}</TableCell>
                    <TableCell className="text-right">{row.losses}</TableCell>
                    <TableCell className="text-right">{Math.round(row.winRate * 100)}%</TableCell>
                    <TableCell className="text-right">{formatDiff(row)}</TableCell>
                    <TableCell className="text-right">{row.avgOpponentSkill.toFixed(1)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {row.secondsPlayed > 0 ? formatDuration(row.secondsPlayed) : '-'}
                    </TableCell>
                    {!readOnly && (
                      <TableCell>
                        <StatsCardDialog standing={row} location={location} date={date} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              Ranked by wins, then point differential, then opponent strength, then win rate.
            </p>
          </>
        )}
      </CardContent>
    </Card>
    {repeatStats && <RepeatStats session={session} />}
    </div>
  )
}
