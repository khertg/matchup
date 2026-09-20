import { useState } from 'react'
import { toast } from 'sonner'
import { MedalBadge } from '@/components/MedalBadge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useClubAuth } from '@/cloud/auth'
import { cloud } from '@/cloud/client'
import { newBatchId } from '@/cloud/id'
import { toLifetimePlayers } from '@/cloud/lifetime'
import { flushPendingLifetime } from '@/cloud/sync'
import { saveLifetimeStats } from '@/db/lifetime'
import { rankPlayers } from '@/rotation/standings'
import type { SessionState } from '@/rotation/types'
import { useSessionStore } from '@/store/session'

export function EndSessionDialog({ session }: { session: SessionState }) {
  const endSession = useSessionStore((s) => s.endSession)
  const [saving, setSaving] = useState(false)
  const podium = rankPlayers(session).filter((row) => row.medal)

  async function handleSaveAndEnd() {
    setSaving(true)
    try {
      await saveLifetimeStats(session)

      // Also add to the club leaderboard when signed in. It is queued first, so a
      // dropped connection never loses it; it is sent again when back online.
      const club = useClubAuth.getState().club
      let clubUpdated = true
      if (cloud && club) {
        useClubAuth.getState().enqueueLifetime({
          batchId: newBatchId(),
          slug: club.slug,
          players: toLifetimePlayers(session),
        })
        clubUpdated = await flushPendingLifetime()
      }

      endSession()
      toast(
        clubUpdated
          ? 'Session saved to the all-time leaderboard'
          : 'Saved on this device. The club leaderboard will update when you are back online.',
      )
    } catch {
      toast.error('Could not save the results. The session is still open.')
      setSaving(false)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">End session</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>End this session?</DialogTitle>
          <DialogDescription>
            {podium.length > 0
              ? 'Final top players. Save the results to add them to everyone’s all-time totals.'
              : 'The queue and court assignments will be cleared. Your saved player list is kept.'}
          </DialogDescription>
        </DialogHeader>

        {podium.length > 0 && (
          <ol className="divide-y rounded-lg border">
            {podium.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-6 text-sm text-muted-foreground">{row.rank}</span>
                <span className="flex flex-1 items-center gap-1 font-medium">
                  {row.name}
                  <MedalBadge medal={row.medal} />
                </span>
                <span className="text-sm text-muted-foreground">
                  {row.wins}W {row.losses}L
                </span>
              </li>
            ))}
          </ol>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Keep playing</Button>
          </DialogClose>
          {podium.length > 0 ? (
            <>
              <Button variant="destructive" onClick={endSession} disabled={saving}>
                End without saving
              </Button>
              <Button onClick={handleSaveAndEnd} disabled={saving}>
                {saving ? 'Saving…' : 'Save and end session'}
              </Button>
            </>
          ) : (
            <Button variant="destructive" onClick={endSession}>
              End session
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
