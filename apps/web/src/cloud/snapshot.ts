import {
  SNAPSHOT_VERSION,
  parseFullBackupEnvelope,
  parsePublicSnapshot,
  type PublicSnapshot,
} from '@matchup/shared'
import { nextGroup } from '@/rotation/engine'
import type { SessionState } from '@/rotation/types'
import { migrateSession, SESSION_STORE_VERSION } from '@/store/migrate'

/**
 * Two shapes go to the cloud (their wire format is defined in @matchup/shared):
 *  - PublicSnapshot: what the public viewer page shows. It leaves out genders
 *    and per-player results history.
 *  - FullBackup: the whole session, only retrievable with a staff token, so a
 *    second staff device can resume it.
 */

export { parsePublicSnapshot }
export type { PublicSnapshot }

export interface FullBackup {
  schemaVersion: typeof SNAPSHOT_VERSION
  /** Version of the persisted session shape, so it can be migrated on load. */
  storeVersion: number
  location: string
  session: SessionState
}

export function toPublicSnapshot(location: string, session: SessionState): PublicSnapshot {
  return {
    schemaVersion: SNAPSHOT_VERSION,
    location,
    mode: session.mode,
    matchmaking: session.matchmaking,
    avgGameMinutes: session.avgGameMinutes,
    courts: session.courts,
    queue: session.queue,
    // Computed here, on the staff device, so the live board shows exactly what staff see
    // (including mixed doubles and locked partners, which viewers cannot work out themselves).
    nextUp: nextGroup(session)?.players ?? [],
    onBreak: session.onBreak,
    partners: session.partners,
    stats: session.stats,
    players: Object.fromEntries(
      Object.values(session.players).map((p) => [p.id, { id: p.id, name: p.name, skill: p.skill }]),
    ),
  }
}

export function toFullBackup(location: string, session: SessionState): FullBackup {
  return { schemaVersion: SNAPSHOT_VERSION, storeVersion: SESSION_STORE_VERSION, location, session }
}

/** A read-only SessionState built from a public snapshot, for reusing the display components. */
export function toViewerState(snapshot: PublicSnapshot): SessionState {
  return {
    mode: snapshot.mode,
    avgGameMinutes: snapshot.avgGameMinutes,
    matchmaking: snapshot.matchmaking,
    partners: snapshot.partners,
    lastResult: {},
    stats: snapshot.stats,
    courts: snapshot.courts,
    players: snapshot.players,
    queue: snapshot.queue,
    onBreak: snapshot.onBreak,
  }
}

/** Returns the location and a session upgraded to the current shape, or null if unusable. */
export function parseFullBackup(raw: unknown): { location: string; session: SessionState } | null {
  const envelope = parseFullBackupEnvelope(raw)
  if (!envelope) return null
  try {
    const session = migrateSession(envelope.session as unknown as SessionState, envelope.storeVersion)
    // A session that cannot be published as a valid board is not sound enough to resume.
    if (!session || !parsePublicSnapshot(toPublicSnapshot(envelope.location, session))) return null
    return { location: envelope.location, session }
  } catch {
    return null
  }
}
