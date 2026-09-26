import type { DeletedHistorySummary, HistorySummary as ClubSummary } from '@q2dink/shared'
import type { HistorySummary as LocalSummary } from '@/db/history'

/** A past session as the Past sessions list shows it, from this device, the club, or both. */
export interface PastEntry {
  id: string
  location: string
  endedAt: number
  mode: 'doubles' | 'singles'
  players: number
  games: number
  /** Only the club has it, not this device. */
  clubOnly: boolean
}

/** One in Recently deleted, and when it was deleted. */
export interface DeletedEntry extends PastEntry {
  deletedAt: number
}

export interface MergedHistory {
  /** The past sessions, newest first. */
  active: PastEntry[]
  /** Recently deleted, most recently deleted first. */
  deleted: DeletedEntry[]
  /** Copies on this device that another device deleted: this device follows (id and when). */
  deletedElsewhere: { id: string; deletedAt: number }[]
  /** Copies deleted here earlier (following the club) that another device has restored since. */
  restoredElsewhere: string[]
}

const fromLocal = (s: LocalSummary): PastEntry => ({
  id: s.id,
  location: s.location,
  endedAt: s.endedAt,
  mode: s.mode,
  players: s.players,
  games: s.games,
  clubOnly: false,
})

const fromClub = (s: ClubSummary): PastEntry => ({
  id: s.id,
  location: s.location,
  endedAt: Date.parse(s.endedAt),
  mode: s.mode,
  players: s.players,
  games: s.games,
  clubOnly: true,
})

/**
 * This device's past sessions merged with the club's, each listed once, in the list or in Recently deleted.
 * A change made here and not sent yet wins over the club's copy; otherwise the club's word on whether a
 * session is deleted is followed, so every staff device shows the same.
 */
export function mergeHistory(
  local: LocalSummary[],
  localDeleted: LocalSummary[],
  club: ClubSummary[],
  clubDeleted: DeletedHistorySummary[],
): MergedHistory {
  const clubActive = new Set(club.map((s) => s.id))
  const clubGone = new Map(clubDeleted.map((s) => [s.id, Date.parse(s.deletedAt)]))
  const active = new Map<string, PastEntry>()
  const deleted = new Map<string, DeletedEntry>()
  const deletedElsewhere: MergedHistory['deletedElsewhere'] = []
  const restoredElsewhere: string[] = []

  for (const s of local) {
    const goneAt = clubGone.get(s.id)
    if (goneAt !== undefined && s.deletionPending !== 'restore') {
      deleted.set(s.id, { ...fromLocal(s), deletedAt: goneAt })
      deletedElsewhere.push({ id: s.id, deletedAt: goneAt })
    } else {
      active.set(s.id, fromLocal(s))
    }
  }
  for (const s of localDeleted) {
    if (s.deletionPending === 'purge') continue
    if (s.deletionPending === undefined && clubActive.has(s.id)) {
      active.set(s.id, fromLocal(s))
      restoredElsewhere.push(s.id)
    } else {
      deleted.set(s.id, { ...fromLocal(s), deletedAt: s.deletedAt ?? Date.now() })
    }
  }
  const mine = new Set([...local, ...localDeleted].map((s) => s.id))
  for (const s of club) if (!mine.has(s.id)) active.set(s.id, fromClub(s))
  for (const s of clubDeleted) if (!mine.has(s.id)) deleted.set(s.id, { ...fromClub(s), deletedAt: Date.parse(s.deletedAt) })

  return {
    active: [...active.values()].sort((a, b) => b.endedAt - a.endedAt),
    deleted: [...deleted.values()].sort((a, b) => b.deletedAt - a.deletedAt),
    deletedElsewhere,
    restoredElsewhere,
  }
}

/** Whole days left before a deleted session is removed for good (at least 0). */
export function daysLeft(deletedAt: number, trashDays: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((deletedAt + trashDays * 24 * 60 * 60 * 1000 - now) / (24 * 60 * 60 * 1000)))
}
