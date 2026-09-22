import { useEffect, useState } from 'react'
import { toCloudError, type LiveRow } from '@/cloud/api'
import { cloud } from '@/cloud/client'
import { parsePublicSnapshot, toViewerState, type PublicSnapshot } from '@/cloud/snapshot'
import { CourtCard } from '@/components/CourtCard'
import { NextUpCard } from '@/components/NextUpCard'
import { QueueList } from '@/components/QueueList'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { matchmakingLabel } from '@/lib/matchmaking'
import { StandingsScreen } from './StandingsScreen'

/** Fallback for networks that block the live stream. */
const POLL_MS = 15_000

type ViewState =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'live'; snapshot: PublicSnapshot; updatedAt: string }
  | { kind: 'error'; message: string }

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-1 py-6 text-center">
        <p className="text-lg font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{children}</p>
      </CardContent>
    </Card>
  )
}

/** Read-only live board for players, opened from the club's QR code or link. */
export function ViewerScreen({ slug }: { slug: string }) {
  const [view, setView] = useState<ViewState>({ kind: 'loading' })
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    if (!cloud) return
    const api = cloud
    let cancelled = false

    // The board can arrive by push (realtime) or by poll. Ignore a reply that is older than
    // what is already on screen, so a slow poll can never overwrite a newer pushed update.
    let latest = ''

    function show(row: LiveRow | null) {
      if (cancelled) return
      setOffline(false)
      if (!row) {
        latest = ''
        setView({ kind: 'none' })
        return
      }
      if (row.updatedAt < latest) return
      latest = row.updatedAt
      const snapshot = parsePublicSnapshot(row.state)
      setView(
        snapshot
          ? { kind: 'live', snapshot, updatedAt: row.updatedAt }
          : { kind: 'error', message: 'This board needs a newer version of Q2Dink. Refresh the page.' },
      )
    }

    async function load() {
      try {
        show(await api.fetchLive(slug))
      } catch (error) {
        if (cancelled) return
        // Keep showing the last good board when the connection drops.
        setOffline(true)
        setView((prev) =>
          prev.kind === 'live' ? prev : { kind: 'error', message: toCloudError(error).message },
        )
      }
    }

    void load()
    const unsubscribe = api.subscribeLive(slug, show)
    const timer = setInterval(() => void load(), POLL_MS)
    const handleOnline = () => void load()
    window.addEventListener('online', handleOnline)

    return () => {
      cancelled = true
      unsubscribe()
      clearInterval(timer)
      window.removeEventListener('online', handleOnline)
    }
  }, [slug])

  if (!cloud) {
    return (
      <Message title="Live view is not available">
        Cloud sync isn&apos;t configured on this deployment.
      </Message>
    )
  }
  if (view.kind === 'loading') {
    return <p className="py-10 text-center text-muted-foreground">Loading the live board…</p>
  }
  if (view.kind === 'error') {
    return <Message title="Can't load the live board">{view.message}</Message>
  }
  if (view.kind === 'none') {
    return (
      <Message title="No game in progress">
        This club isn&apos;t running a session right now. This page updates by itself when they start.
      </Message>
    )
  }

  const { snapshot, updatedAt } = view
  const session = toViewerState(snapshot)
  const updated = new Date(updatedAt).toLocaleTimeString()

  return (
    <div className="space-y-4">
      <header className="min-w-0">
        <h1 className="break-words text-2xl font-bold">{snapshot.location}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge>Live</Badge>
          <Badge variant="secondary">{snapshot.mode === 'doubles' ? 'Doubles' : 'Singles'}</Badge>
          {snapshot.mode === 'doubles' && (
            <Badge variant="secondary">{matchmakingLabel(snapshot.matchmaking)}</Badge>
          )}
          <span className="text-sm text-muted-foreground">
            {offline ? `Offline. Showing the update from ${updated}` : `Updated ${updated}`}
          </span>
        </div>
      </header>

      <Tabs defaultValue="board">
        <TabsList className="w-full">
          <TabsTrigger value="board">Live board</TabsTrigger>
          <TabsTrigger value="standings">Standings</TabsTrigger>
        </TabsList>
        <TabsContent value="board" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {session.courts.map((court) => (
              <CourtCard
                key={court.id}
                court={court}
                players={session.players}
                partners={session.partners}
                readOnly
              />
            ))}
          </div>
          <NextUpCard
            nextUp={snapshot.nextUp}
            players={session.players}
            emptyMessage="No group is ready yet. Waiting for more players."
          />
          <QueueList session={session} nextUp={snapshot.nextUp} />
        </TabsContent>
        <TabsContent value="standings" className="mt-4">
          <StandingsScreen session={session} location={snapshot.location} readOnly />
        </TabsContent>
      </Tabs>
    </div>
  )
}
