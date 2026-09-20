import { MedalBadge } from '@/components/MedalBadge'
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
import { rankPlayers } from '@/rotation/standings'
import type { SessionState } from '@/rotation/types'

interface Props {
  session: SessionState
  location: string
  /** Read-only views (the public viewer page) hide the share-card buttons. */
  readOnly?: boolean
}

export function StandingsScreen({ session, location, readOnly = false }: Props) {
  const standings = rankPlayers(session)
  const date = new Date().toLocaleDateString()

  return (
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
                  <TableHead className="text-right" title="Average skill level of opponents faced">
                    Opp.
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
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right">{row.games}</TableCell>
                    <TableCell className="text-right">{row.wins}</TableCell>
                    <TableCell className="text-right">{row.losses}</TableCell>
                    <TableCell className="text-right">{Math.round(row.winRate * 100)}%</TableCell>
                    <TableCell className="text-right">{row.avgOpponentSkill.toFixed(1)}</TableCell>
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
              Ranked by wins, then opponent strength, then win rate.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
