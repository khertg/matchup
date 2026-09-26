import type { AuditEntry } from '@q2dink/shared'
import { db } from '@/db/db'
import { currentDevice } from '@/lib/device'
import { useClubAuth } from './auth'
import { newBatchId } from './id'

/**
 * The audit log: which staff device did what. Entries are made here, queued on the device (so nothing is
 * lost offline) and sent to the club by the cloud sync (flushAudit in sync.ts). Only while signed in to a
 * club: a build with no cloud, or a device not signed in, keeps no log.
 */

/** A new entry for something this device just did, or null when no club is signed in. */
export function newAuditEntry(kind: string, summary: string, sessionId?: string): AuditEntry | null {
  if (!useClubAuth.getState().club) return null
  return {
    id: newBatchId(),
    at: new Date().toISOString(),
    device: currentDevice(),
    kind,
    summary: summary.slice(0, 300),
    ...(sessionId ? { sessionId } : {}),
  }
}

let flushHook: () => void = () => {}

/** Called by the cloud sync, so a queued entry is sent soon after it is made. */
export function onAuditQueued(hook: () => void): () => void {
  flushHook = hook
  return () => {
    if (flushHook === hook) flushHook = () => {}
  }
}

/** Keep entries until the club has them. They belong to the club signed in now. */
export async function queueAudit(entries: AuditEntry[]): Promise<void> {
  const slug = useClubAuth.getState().club?.slug
  if (!slug || entries.length === 0) return
  try {
    await db.auditQueue.bulkPut(entries.map((e) => ({ ...e, clubSlug: slug })))
  } catch {
    // The log is a record, not the work itself: never let it break what staff are doing.
    return
  }
  flushHook()
}

/** Record something this device did outside the session's own changes (a session ended, a player saved...). */
export function recordAudit(kind: string, summary: string, sessionId?: string): void {
  const entry = newAuditEntry(kind, summary, sessionId)
  if (entry) void queueAudit([entry])
}

/** Entries not sent yet for this club, oldest first. */
export async function unsentAudit(clubSlug: string): Promise<AuditEntry[]> {
  const rows = await db.auditQueue.where('clubSlug').equals(clubSlug).sortBy('at')
  return rows.map(({ clubSlug: _slug, ...entry }) => entry)
}

export async function removeSentAudit(ids: string[]): Promise<void> {
  await db.auditQueue.bulkDelete(ids)
}

/** Another club logged in: what was queued for an earlier one is never sent to this one. */
export async function dropAuditOfOtherClubs(clubSlug: string): Promise<void> {
  await db.auditQueue.where('clubSlug').notEqual(clubSlug).delete()
}

/** Newest first, each entry once (one not sent yet is not also in the club's copy). */
export function mergeEntries(unsent: AuditEntry[], sent: AuditEntry[]): { entry: AuditEntry; unsent: boolean }[] {
  const sentIds = new Set(sent.map((e) => e.id))
  return [
    ...unsent.filter((e) => !sentIds.has(e.id)).map((entry) => ({ entry, unsent: true })),
    ...sent.map((entry) => ({ entry, unsent: false })),
  ].sort((a, b) => b.entry.at.localeCompare(a.entry.at))
}
