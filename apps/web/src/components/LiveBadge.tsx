import { useClubAuth } from '@/cloud/auth'
import type { SyncStatus } from '@/cloud/publisher'
import { useSyncStore } from '@/cloud/sync'

type LiveStatus = Exclude<SyncStatus, 'off' | 'idle'>

const LABELS: Record<LiveStatus, string> = {
  syncing: 'Live (updating)',
  synced: 'Live',
  offline: 'Live (last update may be stale)',
  error: 'Live (last update may be stale)',
}

const DOT_COLORS: Record<LiveStatus, string> = {
  syncing: 'bg-muted-foreground',
  synced: 'bg-primary',
  offline: 'bg-amber-600 dark:bg-amber-500',
  error: 'bg-amber-600 dark:bg-amber-500',
}

/** Whether the running session is reaching the club's public live page — separate from raw sync/connection status (see SyncBadge). Hidden when signed out or no session has published yet. */
export function LiveBadge() {
  const club = useClubAuth((s) => s.club)
  const status = useSyncStore((s) => s.status)
  if (!club || status === 'off' || status === 'idle') return null
  const dot = DOT_COLORS[status]
  return (
    <span
      role="status"
      data-testid="live-status"
      title={LABELS[status]}
      className="inline-flex size-8 items-center justify-center"
    >
      <span className="relative inline-flex size-2.5" aria-hidden="true">
        <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-75 ${dot}`} />
        <span className={`relative inline-flex size-2.5 rounded-full ${dot}`} />
      </span>
      <span className="sr-only">{LABELS[status]}</span>
    </span>
  )
}
