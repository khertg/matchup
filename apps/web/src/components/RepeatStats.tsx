import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { repeatStats, type PairCount, type PlayerRepeats } from '@/rotation/repeats'
import type { SessionState } from '@/rotation/types'

const percent = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100))
const times = (count: number) => (count === 1 ? '1 time' : `${count} times`)

/** "Bob ×3" for the most repeated, or "-" when nobody was met more than once. */
function mostRepeated(list: PairCount[], names: Record<number, string>): string {
  const first = list[0]
  return first && first.count > 1 ? `${names[first.id]} ×${first.count}` : '-'
}

function Breakdown({ title, list, names }: { title: string; list: PairCount[]; names: Record<number, string> }) {
  return (
    <section aria-label={title}>
      <h3 className="mb-1 text-sm font-medium">{title}</h3>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {list.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <span className="min-w-0 truncate">{names[entry.id]}</span>
              <span className={entry.count > 1 ? 'font-medium' : 'text-muted-foreground'}>{times(entry.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PlayerBreakdown({ player, names, singles }: { player: PlayerRepeats; names: Record<number, string>; singles: boolean }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 font-medium"
          aria-label={`Partners and opponents of ${player.name}`}
        >
          {player.name}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{player.name}: partners and opponents</DialogTitle>
          <DialogDescription>
            {player.games === 1 ? '1 game' : `${player.games} games`} this session. The most repeated come first.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {!singles && <Breakdown title="Partners" list={player.partners} names={names} />}
          <Breakdown title="Opponents" list={player.opponents} names={names} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * How often players teamed up or faced each other again over the whole session: a summary, a table
 * with each player's most repeated partner and opponent, and a breakdown per player.
 */
export function RepeatStats({ session }: { session: SessionState }) {
  const { summary, players } = repeatStats(session)
  if (summary.games === 0) return null
  const singles = summary.partnerships === 0
  const names: Record<number, string> = {}
  for (const player of players) names[player.id] = player.name
  const nameOf = (id: number) => names[id] ?? session.players[id]?.name ?? 'Unknown'
  const { topPartnership, topMatchup } = summary

  return (
    <Card role="group" aria-label="Partners and opponents">
      <CardHeader>
        <CardTitle>Partners and opponents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1 text-sm">
          {!singles && (
            <p>
              Repeated partnerships: {summary.repeatedPartnerships} of {summary.partnerships} (
              {percent(summary.repeatedPartnerships, summary.partnerships)}%)
            </p>
          )}
          <p>
            Repeated opponent pairings: {summary.repeatedOpponentPairings} of {summary.opponentPairings} (
            {percent(summary.repeatedOpponentPairings, summary.opponentPairings)}%)
          </p>
          {topPartnership && (
            <p className="text-muted-foreground">
              {nameOf(topPartnership.a)} and {nameOf(topPartnership.b)} teamed up {times(topPartnership.count)}.
            </p>
          )}
          {topMatchup && (
            <p className="text-muted-foreground">
              {nameOf(topMatchup.a)} and {nameOf(topMatchup.b)} faced each other {times(topMatchup.count)}.
            </p>
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              {!singles && (
                <>
                  <TableHead className="text-right" title="Different partners this session">
                    Partners
                  </TableHead>
                  <TableHead className="text-right" title="The partner they had the most times (only shown when it was more than once)">
                    Top partner
                  </TableHead>
                </>
              )}
              <TableHead className="text-right" title="Different opponents this session">
                Opponents
              </TableHead>
              <TableHead className="text-right" title="The opponent they faced the most times (only shown when it was more than once)">
                Top opponent
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {players.map((player) => (
              <TableRow key={player.id}>
                <TableCell>
                  <PlayerBreakdown player={player} names={names} singles={singles} />
                </TableCell>
                {!singles && (
                  <>
                    <TableCell className="text-right">{player.partners.length}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{mostRepeated(player.partners, names)}</TableCell>
                  </>
                )}
                <TableCell className="text-right">{player.opponents.length}</TableCell>
                <TableCell className="whitespace-nowrap text-right">{mostRepeated(player.opponents, names)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">
          Counted over the whole session. With few players some repeats cannot be avoided. Tap a name for the full list.
        </p>
      </CardContent>
    </Card>
  )
}
