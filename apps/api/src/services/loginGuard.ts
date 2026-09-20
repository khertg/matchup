import { AppError } from '../errors'

interface Counter {
  count: number
  resetAt: number
}

export interface LoginGuardOptions {
  maxFailuresPerClubAndIp: number
  maxFailuresPerClub: number
  windowMs: number
}

/**
 * Slows down password guessing beyond the plain per-IP rate limit. After too
 * many failures for a club, from one address or from all addresses together,
 * further attempts are refused until the window passes, even with the right
 * password. Clubs that do not exist are counted the same way, so lockouts do
 * not reveal which clubs exist. State is in memory: fine for one server.
 */
export class LoginGuard {
  private readonly counters = new Map<string, Counter>()
  private readonly options: LoginGuardOptions
  private readonly now: () => number

  constructor(options: LoginGuardOptions, now: () => number = Date.now) {
    this.options = options
    this.now = now
  }

  /** Throws a rate_limited error if this club or this club-and-address is locked. */
  check(slug: string, ip: string): void {
    const club = this.active(this.clubKey(slug))
    const clubAndIp = this.active(this.clubIpKey(slug, ip))
    const locked =
      (club && club.count >= this.options.maxFailuresPerClub ? club : undefined) ??
      (clubAndIp && clubAndIp.count >= this.options.maxFailuresPerClubAndIp ? clubAndIp : undefined)
    if (locked) {
      const retryAfterSeconds = Math.max(1, Math.ceil((locked.resetAt - this.now()) / 1000))
      throw new AppError('rate_limited', { retryAfterSeconds })
    }
  }

  fail(slug: string, ip: string): void {
    this.bump(this.clubKey(slug))
    this.bump(this.clubIpKey(slug, ip))
    if (this.counters.size > 10_000) this.prune()
  }

  /** A correct login forgives earlier mistakes from the same address, not the club-wide count. */
  success(slug: string, ip: string): void {
    this.counters.delete(this.clubIpKey(slug, ip))
  }

  // JSON keeps keys unambiguous even when a club name or address contains a separator character.
  private clubKey = (slug: string) => JSON.stringify(['club', slug.slice(0, 64)])
  private clubIpKey = (slug: string, ip: string) => JSON.stringify(['club-ip', slug.slice(0, 64), ip])

  private active(key: string): Counter | undefined {
    const counter = this.counters.get(key)
    if (counter && counter.resetAt <= this.now()) {
      this.counters.delete(key)
      return undefined
    }
    return counter
  }

  private bump(key: string): void {
    const counter = this.active(key)
    if (counter) counter.count += 1
    else this.counters.set(key, { count: 1, resetAt: this.now() + this.options.windowMs })
  }

  private prune(): void {
    const now = this.now()
    for (const [key, counter] of this.counters) if (counter.resetAt <= now) this.counters.delete(key)
  }
}
