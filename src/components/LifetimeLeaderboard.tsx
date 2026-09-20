import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MedalBadge } from '@/components/MedalBadge'
import { db } from '@/db/db'
import { MAX_LIFETIME_GAMES, MIN_LIFETIME_GAMES, rankLifetime } from '@/rotation/standings'

const MEDALS = [null, 'gold', 'silver', 'bronze'] as const

export function LifetimeLeaderboard() {
  const players = useLiveQuery(() => db.players.toArray(), [])
  const [text, setText] = useState(String(MIN_LIFETIME_GAMES))

  const value = Number(text)
  const valid = Number.isInteger(value) && value >= MIN_LIFETIME_GAMES && value <= MAX_LIFETIME_GAMES
  const rows = players && valid ? rankLifetime(players, value) : []

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" className="w-full">
          Lifetime leaderboard
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lifetime leaderboard</DialogTitle>
          <DialogDescription>All-time results from saved sessions on this device.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="min-games">
            Minimum games ({MIN_LIFETIME_GAMES} to {MAX_LIFETIME_GAMES})
          </Label>
          <Input
            id="min-games"
            type="number"
            inputMode="numeric"
            min={MIN_LIFETIME_GAMES}
            max={MAX_LIFETIME_GAMES}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={!valid}
          />
          {!valid && (
            <p className="text-sm text-destructive">
              Enter a whole number from {MIN_LIFETIME_GAMES} to {MAX_LIFETIME_GAMES}.
            </p>
          )}
        </div>

        {valid && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No players with {value} or more saved games yet. Finish a session and choose Save and
            end session.
          </p>
        ) : (
          rows.length > 0 && (
            <div className="max-h-72 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead className="text-right">GP</TableHead>
                    <TableHead className="text-right">W</TableHead>
                    <TableHead className="text-right">L</TableHead>
                    <TableHead className="text-right">Win %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <span className="inline-flex items-center gap-1">
                          {row.rank}
                          <MedalBadge medal={MEDALS[row.rank] ?? null} />
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right">{row.games}</TableCell>
                      <TableCell className="text-right">{row.wins}</TableCell>
                      <TableCell className="text-right">{row.losses}</TableCell>
                      <TableCell className="text-right">{Math.round(row.winRate * 100)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  )
}
