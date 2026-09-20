import { toast } from 'sonner'
import { CourtCard } from '@/components/CourtCard'
import { QueueList } from '@/components/QueueList'
import type { SessionState } from '@/rotation/types'
import { useSessionStore } from '@/store/session'

const TEAM_NAMES = ['Team A', 'Team B']

export function BoardScreen({ session }: { session: SessionState }) {
  const recordResult = useSessionStore((s) => s.recordResult)
  const undo = useSessionStore((s) => s.undo)
  const cancelMatch = useSessionStore((s) => s.cancelMatch)

  function handleResult(courtId: number, winner: 0 | 1) {
    recordResult(courtId, winner)
    toast(`Court ${courtId}: ${TEAM_NAMES[winner]} won`, {
      duration: 10_000,
      action: {
        label: 'Undo',
        onClick: () => {
          if (!undo()) toast.error("Can't undo: the session changed after that result")
        },
      },
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {session.courts.map((court) => (
          <CourtCard
            key={court.id}
            court={court}
            players={session.players}
            onResult={(winner) => handleResult(court.id, winner)}
            onCancel={() => cancelMatch(court.id)}
          />
        ))}
      </div>
      <QueueList session={session} />
    </div>
  )
}
