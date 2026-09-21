import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { toCloudError } from '@/cloud/api'
import { useClubAuth } from '@/cloud/auth'
import { cloud } from '@/cloud/client'
import { parseFullBackup } from '@/cloud/snapshot'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  archiveSession,
  deleteHistory,
  getHistory,
  listHistory,
  markHistorySynced,
  type HistorySummary,
} from '@/db/history'
import { matchmakingLabel } from '@/lib/matchmaking'
import type { LifetimeCounts } from '@/rotation/lifetime'
import type { SessionState } from '@/rotation/types'
import { StandingsScreen } from '@/screens/StandingsScreen'
import { migrateSession } from '@/store/migrate'
import { useSessionStore } from '@/store/session'

interface Entry {
  id: string
  location: string
  endedAt: number
  mode: 'doubles' | 'singles'
  players: number
  games: number
  /** Only the club has it, not this device. */
  clubOnly: boolean
}

interface Loaded {
  id: string
  location: string
  startedAt: number
  endedAt: number
  session: SessionState
  lifetimeCounted: LifetimeCounts
  /** Fetched from the club because this device does not have it. */
  fromClub: boolean
}

const when = (ms: number) => new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** This device's history merged with the club's, newest first. A session both have is listed once. */
async function loadEntries(): Promise<{ entries: Entry[]; clubError: string | null }> {
  const local = await listHistory()
  const byId = new Map<string, Entry>(local.map((s) => [s.id, toEntry(s, false)]))
  let clubError: string | null = null
  const club = useClubAuth.getState().club
  if (cloud && club) {
    try {
      for (const s of await cloud.listHistory(club.token)) {
        if (!byId.has(s.id)) {
          byId.set(s.id, {
            id: s.id,
            location: s.location,
            endedAt: Date.parse(s.endedAt),
            mode: s.mode,
            players: s.players,
            games: s.games,
            clubOnly: true,
          })
        }
      }
    } catch (error) {
      clubError = toCloudError(error).message
    }
  }
  return { entries: [...byId.values()].sort((a, b) => b.endedAt - a.endedAt), clubError }
}

const toEntry = (s: HistorySummary, clubOnly: boolean): Entry => ({
  id: s.id,
  location: s.location,
  endedAt: s.endedAt,
  mode: s.mode,
  players: s.players,
  games: s.games,
  clubOnly,
})

/** One session in full, from this device or, failing that, from the club. */
async function loadOne(entry: Entry): Promise<Loaded | null> {
  const record = await getHistory(entry.id)
  if (record) {
    const session = migrateSession(record.session, record.storeVersion)
    if (!session) return null
    return {
      id: record.id,
      location: record.location,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      session,
      lifetimeCounted: record.lifetimeCounted,
      fromClub: false,
    }
  }
  const club = useClubAuth.getState().club
  if (!cloud || !club) return null
  const parsed = parseFullBackup(await cloud.fetchHistory(club.token, entry.id))
  if (!parsed) return null
  return {
    id: entry.id,
    location: parsed.location,
    startedAt: entry.endedAt,
    endedAt: entry.endedAt,
    session: parsed.session,
    lifetimeCounted: parsed.lifetimeCounted,
    fromClub: true,
  }
}

/** Past sessions with their rankings, and a way to resume one that ended by accident. */
export function PastSessionsDialog() {
  const club = useClubAuth((s) => s.club)
  const loadSession = useSessionStore((s) => s.loadSession)
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [clubError, setClubError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<Loaded | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const reload = useCallback(async () => {
    const result = await loadEntries()
    setEntries(result.entries)
    setClubError(result.clubError)
  }, [])

  function handleOpenChange(next: boolean) {
    // Always start from the list, never from the session that was open last time.
    setViewing(null)
    setConfirmDelete(false)
    setOpen(next)
    if (next) void reload()
  }

  async function handleView(entry: Entry) {
    setBusy(true)
    try {
      const loaded = await loadOne(entry)
      if (loaded) setViewing(loaded)
      else toast.error('This session could not be opened.')
    } catch (error) {
      toast.error(toCloudError(error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleResume(loaded: Loaded) {
    setBusy(true)
    try {
      // A session that came from the club is kept on this device too, so it stays here after resuming.
      if (loaded.fromClub) {
        const clubSlug = useClubAuth.getState().club?.slug
        const saved = await archiveSession({
          id: loaded.id,
          location: loaded.location,
          startedAt: loaded.startedAt,
          session: loaded.session,
          lifetimeCounted: loaded.lifetimeCounted,
          clubSlug,
          now: loaded.endedAt,
        })
        if (saved) await markHistorySynced(saved.id, clubSlug)
      }
      loadSession(loaded.location, loaded.session, {
        sessionId: loaded.id,
        startedAt: loaded.startedAt,
        lifetimeCounted: loaded.lifetimeCounted,
      })
      toast(`“${loaded.location}” is running again`)
    } catch {
      toast.error('Could not resume the session.')
      setBusy(false)
    }
  }

  async function handleDelete(loaded: Loaded) {
    setBusy(true)
    try {
      await deleteHistory(loaded.id)
      if (cloud && club) await cloud.deleteHistory(club.token, loaded.id).catch(() => {
        toast.error('Deleted here, but the club copy could not be removed. Try again when online.')
      })
      toast('Session deleted')
      setViewing(null)
      setConfirmDelete(false)
      await reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" className="w-full">
          Past sessions
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {viewing ? (
          <>
            <DialogHeader>
              <DialogTitle>{viewing.location}</DialogTitle>
              <DialogDescription>
                Ended {when(viewing.endedAt)} · {viewing.session.mode === 'doubles' ? 'Doubles' : 'Singles'}
                {viewing.session.mode === 'doubles' ? ` · ${matchmakingLabel(viewing.session.matchmaking)}` : ''}
              </DialogDescription>
            </DialogHeader>
            <StandingsScreen session={viewing.session} location={viewing.location} readOnly />
            {confirmDelete ? (
              <div
                role="group"
                aria-label="Confirm deleting this session"
                className="space-y-2 rounded-lg border p-3"
              >
                <p className="text-sm">Delete this session and its results for good?</p>
                <div className="flex gap-2">
                  <Button variant="outline" disabled={busy} onClick={() => setConfirmDelete(false)}>
                    Keep it
                  </Button>
                  <Button variant="destructive" disabled={busy} onClick={() => handleDelete(viewing)}>
                    Delete session
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button className="h-11 flex-1" disabled={busy} onClick={() => handleResume(viewing)}>
                  Resume this session
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setViewing(null)}>
                  Back
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Past sessions</DialogTitle>
              <DialogDescription>
                Every session you end is kept here. Open one to see its ranking, or to resume it.
              </DialogDescription>
            </DialogHeader>
            {clubError && (
              <p role="status" className="text-sm text-muted-foreground">
                The club’s history could not be loaded ({clubError}). Showing what is on this device.
              </p>
            )}
            {entries === null ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No past sessions yet. A session appears here when you end it.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent"
                      disabled={busy}
                      onClick={() => handleView(entry)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{entry.location}</span>
                        <span className="block text-sm text-muted-foreground">
                          {when(entry.endedAt)} · {entry.mode === 'doubles' ? 'Doubles' : 'Singles'} ·{' '}
                          {plural(entry.players, 'player')} · {plural(entry.games, 'game')}
                        </span>
                      </span>
                      {entry.clubOnly && <Badge variant="secondary">Club</Badge>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
