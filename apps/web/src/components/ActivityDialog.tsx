import { useLiveQuery } from 'dexie-react-hooks'
import { History } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AUDIT_LIMITS, type AuditEntry, type ClubDevice } from '@q2dink/shared'
import { toCloudError } from '@/cloud/api'
import { matchesSearch, mergeEntries, pageCount, unsentAudit } from '@/cloud/audit'
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
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { deviceDisplay, shortDeviceId, useDevice } from '@/lib/device'
import { useSessionStore } from '@/store/session'

/** How often the open log looks for what the club's other devices did. */
const REFRESH_MS = 10_000
/** A pause after typing before searching, so each letter does not send a request. */
const SEARCH_DELAY_MS = 300
const PAGE_SIZE = AUDIT_LIMITS.pageSize
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
 * The audit log: which staff device did what, newest first, a page at a time, with who did it and when. It
 * can be searched and narrowed to one device. Staff only, and only with a club signed in. This device's
 * changes not sent yet are listed first, marked as such.
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
  const [search, setSearch] = useState('')
  /** The search as sent, a moment after typing stops. */
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [sent, setSent] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  /** Back to the first page, empty until it loads: on opening, and when the filters change. */
  function restart() {
    setPage(0)
    setSent([])
    setTotal(0)
    setLoading(true)
  }

  useEffect(() => {
    if (search.trim() === q) return
    const timer = setTimeout(() => {
      restart()
      setQ(search.trim())
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [search, q])

  const queued = useLiveQuery(() => (club ? unsentAudit(club.slug) : Promise.resolve([])), [club?.slug])
  // Changes the club has not taken yet are on the session's pending list; the rest wait in the queue.
  const waiting = sessionId === undefined || sessionId === runningId ? pending.flatMap((p) => (p.audit ? [p.audit] : [])) : []
  // Shown on the first page only, which is where the newest entries are.
  const unsent =
    page === 0
      ? [...(queued ?? []), ...waiting].filter(
          (e) =>
            (sessionId === undefined || e.sessionId === sessionId) &&
            (device === ALL || e.device.id === device) &&
            matchesSearch(e, q),
        )
      : []

  const query = useMemo(
    () => ({ ...(sessionId ? { sessionId } : {}), ...(device !== ALL ? { deviceId: device } : {}), ...(q ? { q } : {}) }),
    [sessionId, device, q],
  )

  useEffect(() => {
    if (!open || !cloud || !club) return
    const api = cloud
    const token = club.token
    let cancelled = false

    /** This page again, with what other devices did since. */
    async function refresh() {
      try {
        const [result, list] = await Promise.all([
          api.listAudit(token, { ...query, page, limit: PAGE_SIZE }),
          api.listDevices(token),
        ])
        if (cancelled) return
        setDevices(list)
        const count = result.total ?? result.entries.length
        const last = pageCount(count, PAGE_SIZE) - 1
        // The log got shorter (old entries let go): show the last page there is.
        if (page > last) {
          setPage(last)
          return
        }
        setSent(result.entries)
        setTotal(count)
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
  }, [open, club, query, page])

  if (!cloud || !club) return null
  const rows = mergeEntries(unsent, sent)
  const pages = pageCount(total, PAGE_SIZE)
  const goTo = (to: number) => {
    setLoading(true)
    setPage(to)
  }
  const when = (at: string) =>
    new Date(at).toLocaleString([], sessionId ? { hour: 'numeric', minute: '2-digit', second: '2-digit' } : { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (value) {
          restart()
          setSearch('')
          setQ('')
        }
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
          <Input
            type="search"
            value={search}
            maxLength={AUDIT_LIMITS.search}
            aria-label="Search activity"
            placeholder="Search: a player, a court, a device…"
            onChange={(e) => setSearch(e.target.value)}
          />
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
          <p className="text-sm text-muted-foreground">
            {loading ? 'Loading…' : q ? `Nothing matches “${q}”.` : 'Nothing recorded yet.'}
          </p>
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

        {pages > 1 && (
          <nav aria-label="Activity pages" className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" size="sm" disabled={loading || page === 0} onClick={() => goTo(page - 1)}>
              Previous
            </Button>
            <p aria-live="polite" className="text-sm text-muted-foreground">
              Page {page + 1} of {pages}
            </p>
            <Button type="button" variant="outline" size="sm" disabled={loading || page + 1 >= pages} onClick={() => goTo(page + 1)}>
              Next
            </Button>
          </nav>
        )}
      </DialogContent>
    </Dialog>
  )
}
