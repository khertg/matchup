import { useLiveQuery } from 'dexie-react-hooks'
import { History } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { AuditEntry, ClubDevice } from '@q2dink/shared'
import { toCloudError } from '@/cloud/api'
import { mergeEntries, unsentAudit } from '@/cloud/audit'
import { useClubAuth } from '@/cloud/auth'
import { cloud } from '@/cloud/client'
import { DeviceNameForm } from '@/components/DeviceNameForm'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { deviceDisplay, shortDeviceId, useDevice } from '@/lib/device'
import { useSessionStore } from '@/store/session'

/** How often the open log looks for what the club's other devices did. */
const REFRESH_MS = 10_000
const PAGE = 50
const ALL = 'all'

interface Props {
  /** One session's activity, or (without it) everything the club's devices did. */
  sessionId?: string
  /** The button that opens it. */
  label?: string
  variant?: 'ghost' | 'outline'
  /** Opened from elsewhere (a menu): no button of its own. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * The audit log: which staff device did what, newest first, with who did it and when. Staff only, and only
 * with a club signed in. This device's changes not sent yet are listed too, marked as such.
 */
export function ActivityDialog({ sessionId, label = 'Activity', variant = 'ghost', ...controlled }: Props) {
  const club = useClubAuth((s) => s.club)
  const me = useDevice()
  const pending = useSessionStore((s) => s.pending)
  const runningId = useSessionStore((s) => s.sessionId)
  const [ownOpen, setOwnOpen] = useState(false)
  const open = controlled.open ?? ownOpen
  const setOpen = controlled.onOpenChange ?? setOwnOpen
  const [renaming, setRenaming] = useState(false)
  const [device, setDevice] = useState(ALL)
  const [devices, setDevices] = useState<ClubDevice[]>([])
  const [sent, setSent] = useState<AuditEntry[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  /** Start from the newest page again: on opening, and when another device is picked. */
  function restart() {
    setSent([])
    setNext(null)
    setLoading(true)
  }

  const queued = useLiveQuery(() => (club ? unsentAudit(club.slug) : Promise.resolve([])), [club?.slug])
  // Changes the club has not taken yet are on the session's pending list; the rest wait in the queue.
  const waiting = sessionId === undefined || sessionId === runningId ? pending.flatMap((p) => (p.audit ? [p.audit] : [])) : []
  const unsent = [...(queued ?? []), ...waiting].filter(
    (e) => (sessionId === undefined || e.sessionId === sessionId) && (device === ALL || e.device.id === device),
  )

  const query = useMemo(
    () => ({ ...(sessionId ? { sessionId } : {}), ...(device !== ALL ? { deviceId: device } : {}) }),
    [sessionId, device],
  )

  useEffect(() => {
    if (!open || !cloud || !club) return
    const api = cloud
    const token = club.token
    let cancelled = false

    /** The newest page again (what other devices did since), keeping any older pages already loaded. */
    async function refresh() {
      try {
        const [page, list] = await Promise.all([api.listAudit(token, { ...query, limit: PAGE }), api.listDevices(token)])
        if (cancelled) return
        setDevices(list)
        setSent((old) => {
          const fresh = new Set(page.entries.map((e) => e.id))
          const oldest = page.entries[page.entries.length - 1]?.at
          return [...page.entries, ...old.filter((e) => !fresh.has(e.id) && oldest !== undefined && e.at < oldest)]
        })
        setNext((old) => (old === null ? page.next : old))
        setError(null)
      } catch (err) {
        if (!cancelled) setError(toCloudError(err).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void refresh()
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [open, club, query])

  async function loadMore() {
    if (!cloud || !club || !next) return
    setLoading(true)
    try {
      const page = await cloud.listAudit(club.token, { ...query, limit: PAGE, before: next })
      setSent((old) => [...old, ...page.entries.filter((e) => !old.some((o) => o.id === e.id))])
      setNext(page.next)
    } catch (err) {
      setError(toCloudError(err).message)
    } finally {
      setLoading(false)
    }
  }

  if (!cloud || !club) return null
  const rows = mergeEntries(unsent, sent)
  const when = (at: string) =>
    new Date(at).toLocaleString([], sessionId ? { hour: 'numeric', minute: '2-digit', second: '2-digit' } : { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (value) restart()
        setOpen(value)
        setRenaming(false)
      }}
    >
      {controlled.open === undefined && (
        <DialogTrigger asChild>
          <Button type="button" variant={variant} className={variant === 'ghost' ? 'w-full' : undefined}>
            <History aria-hidden="true" /> {label}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{sessionId ? 'Session activity' : 'Club activity'}</DialogTitle>
          <DialogDescription>
            What each staff device did, newest first. Devices are named by staff, as everyone shares the club
            password.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-lg border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0">
              This device: <span className="font-medium">{me.name ?? 'not named yet'}</span>{' '}
              <span className="text-muted-foreground">
                {me.label} {shortDeviceId(me.id)}
              </span>
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => setRenaming((r) => !r)}>
              {renaming ? 'Cancel' : me.name ? 'Rename' : 'Name it'}
            </Button>
          </div>
          {renaming && <DeviceNameForm onDone={() => setRenaming(false)} />}
        </div>

        <div className="space-y-2">
          <Select
            value={device}
            onValueChange={(value) => {
              restart()
              setDevice(value)
            }}
          >
            <SelectTrigger aria-label="Show activity of" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All devices</SelectItem>
              {devices.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name} · {d.label} {shortDeviceId(d.id)}
                  {d.id === me.id ? ' (this device)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error} What this device did is kept and shown below until it can be sent.
          </p>
        )}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{loading ? 'Loading…' : 'Nothing recorded yet.'}</p>
        ) : (
          <ol aria-label="Activity" className="divide-y">
            {rows.map(({ entry, unsent: notSent }) => {
              const { title, detail } = deviceDisplay(entry.device)
              return (
                <li key={entry.id} className="space-y-0.5 py-2">
                  <p className="text-sm">{entry.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    <time dateTime={entry.at}>{when(entry.at)}</time> · <span className="font-medium text-foreground">{title}</span>{' '}
                    {detail}
                    {entry.device.id === me.id ? ' · this device' : ''}
                    {notSent ? ' · not sent yet' : ''}
                  </p>
                </li>
              )
            })}
          </ol>
        )}

        {next && (
          <Button type="button" variant="outline" disabled={loading} onClick={loadMore}>
            Load more
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
