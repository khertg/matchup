import { RefreshCwIcon } from 'lucide-react'
import { useClubAuth } from '@/cloud/auth'
import type { SyncStatus } from '@/cloud/publisher'
import { useSyncStore } from '@/cloud/sync'

const LABELS: Record<SyncStatus, string> = {
  off: 'Not syncing',
  idle: 'Cloud ready',
  syncing: 'Syncing…',
  synced: 'Synced',
  offline: 'Offline, will sync',
  error: 'Sync problem, retrying',
}

const COLORS: Record<SyncStatus, string> = {
  off: 'text-muted-foreground',
  idle: 'text-muted-foreground',
  syncing: 'text-muted-foreground',
  synced: 'text-primary',
  offline: 'text-amber-600 dark:text-amber-500',
  error: 'text-destructive',
}

/** Shows the underlying sync/connection status (separate from LiveBadge). Hidden when signed out. */
export function SyncBadge() {
  const club = useClubAuth((s) => s.club)
  const status = useSyncStore((s) => s.status)
  if (!club) return null
  return (
    <span
      role="status"
      data-testid="sync-status"
      title={LABELS[status]}
      className={`inline-flex size-8 items-center justify-center ${COLORS[status]}`}
    >
      <RefreshCwIcon aria-hidden="true" className={status === 'syncing' ? 'size-4 animate-spin' : 'size-4'} />
      <span className="sr-only">{LABELS[status]}</span>
    </span>
  )
}
