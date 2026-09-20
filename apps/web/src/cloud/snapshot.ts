import type { SkillLevel } from '@/db/db'
import { migrateSession, SESSION_STORE_VERSION } from '@/store/migrate'
import type { GameMode, MatchmakingMode, SessionState } from '@/rotation/types'

/**
 * Two shapes go to the cloud:
 *  - PublicSnapshot: what the public viewer page shows. It leaves out genders
 *    and per-player results history.
 *  - FullBackup: the whole session, only retrievable with a staff token, so a
 *    second staff device can resume it.
 */

export const SNAPSHOT_VERSION = 1

export interface PublicSnapshot {
  schemaVersion: typeof SNAPSHOT_VERSION
  location: string
  mode: GameMode
  matchmaking: MatchmakingMode
  avgGameMinutes: number
  courts: SessionState['courts']
  queue: number[]
  onBreak: number[]
  partners: SessionState['partners']
  stats: SessionState['stats']
  players: Record<number, { id: number; name: string; skill: SkillLevel }>
}

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

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isIdList = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((n) => Number.isInteger(n))

function validCourts(v: unknown): v is SessionState['courts'] {
  return (
    Array.isArray(v) &&
    v.every(
      (c) =>
        isObject(c) &&
        Number.isInteger(c.id) &&
        (c.teams === null ||
          (Array.isArray(c.teams) && c.teams.length === 2 && c.teams.every(isIdList))),
    )
  )
}

function validPlayers(v: unknown): v is PublicSnapshot['players'] {
  return (
    isObject(v) &&
    Object.values(v).every(
      (p) =>
        isObject(p) &&
        Number.isInteger(p.id) &&
        typeof p.name === 'string' &&
        Number.isInteger(p.skill) &&
        (p.skill as number) >= 1 &&
        (p.skill as number) <= 6,
    )
  )
}

/** Returns the snapshot if it is well formed and of a known version, otherwise null. */
export function parsePublicSnapshot(raw: unknown): PublicSnapshot | null {
  if (!isObject(raw) || raw.schemaVersion !== SNAPSHOT_VERSION) return null
  const ok =
    typeof raw.location === 'string' &&
    (raw.mode === 'doubles' || raw.mode === 'singles') &&
    typeof raw.matchmaking === 'string' &&
    typeof raw.avgGameMinutes === 'number' &&
    validCourts(raw.courts) &&
    isIdList(raw.queue) &&
    isIdList(raw.onBreak) &&
    Array.isArray(raw.partners) &&
    raw.partners.every(isIdList) &&
    isObject(raw.stats) &&
    validPlayers(raw.players)
  return ok ? (raw as unknown as PublicSnapshot) : null
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
  if (!isObject(raw) || raw.schemaVersion !== SNAPSHOT_VERSION) return null
  if (typeof raw.location !== 'string' || typeof raw.storeVersion !== 'number') return null
  if (!isObject(raw.session)) return null
  const migrated = migrateSession(raw.session as unknown as SessionState, raw.storeVersion)
  if (!migrated || !validCourts(migrated.courts) || !isIdList(migrated.queue)) return null
  return { location: raw.location, session: migrated }
}
