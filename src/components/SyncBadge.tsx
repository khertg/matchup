import { Badge } from '@/components/ui/badge'
import { useClubAuth } from '@/cloud/auth'
import type { SyncStatus } from '@/cloud/publisher'
import { useSyncStore } from '@/cloud/sync'

const LABELS: Record<SyncStatus, string> = {
  off: 'Not syncing',
  idle: 'Cloud ready',
  syncing: 'Syncing…',
  synced: 'Live and synced',
  offline: 'Offline, will sync',
  error: 'Sync problem, retrying',
}

/** Shows whether the running session is reaching the club's live page. Hidden when signed out. */
export function SyncBadge() {
  const club = useClubAuth((s) => s.club)
  const status = useSyncStore((s) => s.status)
  if (!club) return null
  return (
    <Badge variant={status === 'error' ? 'destructive' : 'secondary'} role="status">
      {LABELS[status]}
    </Badge>
  )
}
