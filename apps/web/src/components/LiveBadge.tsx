import { useClubAuth } from '@/cloud/auth'
import type { SyncStatus } from '@/cloud/publisher'
import { useSyncStore } from '@/cloud/sync'
import { isLive } from '@/rotation/engine'
import { useSessionStore } from '@/store/session'

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
  const notLive = useSessionStore((s) => s.session !== null && !isLive(s.session))
  if (!club) return null
  if (notLive) {
    // Staff have not chosen Go live: players see no game. A hollow grey dot, not pulsing.
    const label = 'Not live: players cannot see this session'
    return (
      <span role="status" data-testid="live-status" title={label} className="inline-flex size-8 items-center justify-center">
        <span className="inline-flex size-2.5 rounded-full border-2 border-muted-foreground" aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </span>
    )
  }
  if (status === 'off' || status === 'idle') return null
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
