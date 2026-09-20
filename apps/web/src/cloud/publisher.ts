import type { SessionState } from '@/rotation/types'

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'synced' | 'offline' | 'error'

export interface PublisherDeps {
  publish: (location: string, session: SessionState) => Promise<void>
  clear: () => Promise<void>
  isOnline: () => boolean
  setStatus: (status: SyncStatus) => void
  /** Quiet period after the last change before sending. */
  debounceMs?: number
  /** Wait before retrying after a failed send. */
  retryMs?: number
  /** True when retrying is pointless (for example the login expired). */
  isFatal?: (error: unknown) => boolean
}

export interface Publisher {
  /** Record the latest state (null session means the session ended). Sent after a short pause. */
  push: (location: string, session: SessionState | null) => void
  /** Send now if anything is pending. */
  flush: () => Promise<void>
  /** Call when the browser comes back online. */
  onOnline: () => void
  dispose: () => void
}

/**
 * Keeps the cloud copy of the session up to date. Only the latest state ever
 * matters, so changes are debounced, and while offline (or after an error) just
 * the newest one is kept and sent when the connection is back.
 */
export function createPublisher(deps: PublisherDeps): Publisher {
  const debounceMs = deps.debounceMs ?? 500
  const retryMs = deps.retryMs ?? 5000

  let pending: { location: string; session: SessionState | null } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight = false
  let disposed = false

  const schedule = (ms: number) => {
    clearTimeout(timer)
    timer = setTimeout(() => void flush(), ms)
  }

  async function flush(): Promise<void> {
    clearTimeout(timer)
    if (disposed || !pending || inFlight) return
    if (!deps.isOnline()) {
      deps.setStatus('offline')
      return
    }

    const item = pending
    pending = null
    inFlight = true
    deps.setStatus('syncing')

    let failed = false
    try {
      if (item.session) await deps.publish(item.location, item.session)
      else await deps.clear()
      if (!pending) deps.setStatus('synced')
    } catch (error) {
      failed = true
      if (deps.isFatal?.(error)) {
        deps.setStatus('error')
      } else {
        // Keep the newest state: a change made while sending wins over the failed one.
        pending ??= item
        deps.setStatus(deps.isOnline() ? 'error' : 'offline')
        schedule(retryMs)
      }
    }

    inFlight = false
    // Something changed while this send was in progress.
    if (pending && !failed && !disposed) schedule(debounceMs)
  }

  return {
    push(location, session) {
      pending = { location, session }
      if (!deps.isOnline()) {
        deps.setStatus('offline')
        return
      }
      schedule(debounceMs)
    },
    flush,
    onOnline() {
      if (pending) void flush()
    },
    dispose() {
      disposed = true
      clearTimeout(timer)
    },
  }
}
