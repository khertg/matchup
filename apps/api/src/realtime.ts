import type { LiveEvent } from '@matchup/shared'

export interface Subscriber {
  send: (event: LiveEvent) => void
  /** End the underlying connection (used on shutdown). */
  close: () => void
}

export interface HubLimits {
  perIp: number
  total: number
}

interface Entry extends Subscriber {
  ip: string
}

/**
 * In-memory fan-out of live-session changes to connected viewers (Server-Sent
 * Events). One instance per server process; running several servers would
 * need a shared channel such as Postgres LISTEN/NOTIFY.
 */
export class LiveHub {
  private readonly clubs = new Map<string, Set<Entry>>()
  private readonly perIp = new Map<string, number>()
  private total = 0
  private readonly limits: HubLimits

  constructor(limits: HubLimits) {
    this.limits = limits
  }

  /** Register a viewer. Returns how to unsubscribe, or null if a connection limit is reached. */
  subscribe(slug: string, ip: string, subscriber: Subscriber): (() => void) | null {
    if (this.total >= this.limits.total) return null
    if ((this.perIp.get(ip) ?? 0) >= this.limits.perIp) return null

    const entry: Entry = { ...subscriber, ip }
    let set = this.clubs.get(slug)
    if (!set) this.clubs.set(slug, (set = new Set()))
    set.add(entry)
    this.total += 1
    this.perIp.set(ip, (this.perIp.get(ip) ?? 0) + 1)

    let active = true
    return () => {
      if (!active) return
      active = false
      set.delete(entry)
      if (set.size === 0) this.clubs.delete(slug)
      this.total -= 1
      const remaining = (this.perIp.get(ip) ?? 1) - 1
      if (remaining <= 0) this.perIp.delete(ip)
      else this.perIp.set(ip, remaining)
    }
  }

  /** Send an event to everyone watching a club. One failing viewer never affects the others. */
  publish(slug: string, event: LiveEvent): void {
    for (const entry of [...(this.clubs.get(slug) ?? [])]) {
      try {
        entry.send(event)
      } catch {
        // A dead connection is cleaned up by its own close handler.
      }
    }
  }

  count(): number {
    return this.total
  }

  /** End every connection, so the server can shut down promptly. */
  closeAll(): void {
    for (const set of [...this.clubs.values()]) {
      for (const entry of [...set]) {
        try {
          entry.close()
        } catch {
          // Already closed.
        }
      }
    }
  }
}
