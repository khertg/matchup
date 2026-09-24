import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { toCloudError, type LifetimePlayer } from '@/cloud/api'
import { useClubAuth } from '@/cloud/auth'
import { cloud } from '@/cloud/client'
import { MedalBadge } from '@/components/MedalBadge'
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
import type { Player } from '@/db/db'
import { listRoster } from '@/db/roster'
import { MAX_LIFETIME_GAMES, MIN_LIFETIME_GAMES, rankLifetime } from '@/rotation/standings'

const MEDALS = [null, 'gold', 'silver', 'bronze'] as const

const fromClub = (rows: LifetimePlayer[]): Player[] =>
  rows.map((p, index) => ({ id: index + 1, skill: 3, ...p }))

export function LifetimeLeaderboard() {
  const club = useClubAuth((s) => s.club)
  const localPlayers = useLiveQuery(() => listRoster(club?.slug), [club?.slug])
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(String(MIN_LIFETIME_GAMES))
  // The latest club fetch, tagged with its club so a stale result is never shown for another.
  const [clubData, setClubData] = useState<{
    slug: string
    rows: LifetimePlayer[] | null
    error: string | null
  } | null>(null)

  const useCloud = cloud !== null && club !== null
  const slug = club?.slug

  // While signed in to a club, show its combined results from every device.
  useEffect(() => {
    if (!open || !cloud || !slug) return
    let cancelled = false
    cloud
      .fetchClubPlayers(slug)
      .then((rows) => {
        if (!cancelled) setClubData({ slug, rows, error: null })
      })
      .catch((error) => {
        if (!cancelled) setClubData({ slug, rows: null, error: toCloudError(error).message })
      })
    return () => {
      cancelled = true
    }
  }, [open, slug])

  const value = Number(text)
  const valid = Number.isInteger(value) && value >= MIN_LIFETIME_GAMES && value <= MAX_LIFETIME_GAMES
  // Fall back to this device's totals if the club leaderboard can't be loaded.
  const current = clubData?.slug === slug ? clubData : null
  const clubRows = current?.rows ?? null
  const clubError = current?.error ?? null
  const source = useCloud && clubRows ? fromClub(clubRows) : localPlayers
  const rows = source && valid ? rankLifetime(source, value) : []
  const showingClub = useCloud && clubRows !== null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" className="w-full">
          Lifetime leaderboard
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lifetime leaderboard</DialogTitle>
          <DialogDescription>
            {showingClub
              ? `Combined all-time results for ${club?.name}, from every device.`
              : 'All-time results from saved sessions on this device.'}
          </DialogDescription>
        </DialogHeader>

        {clubError && (
          <p role="alert" className="text-sm text-destructive">
            {clubError} Showing this device&apos;s results instead.
          </p>
        )}

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
