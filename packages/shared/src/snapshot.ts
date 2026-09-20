import { MAX_LOCATION_LENGTH, MAX_PLAYER_NAME_LENGTH } from './protocol'

/**
 * Two shapes travel to the API:
 *  - PublicSnapshot: what the public viewer page shows. It leaves out genders
 *    and per-player results history.
 *  - FullBackupEnvelope: the whole session, only retrievable with a staff
 *    token, so a second staff device can resume it. The API stores it as an
 *    opaque object; only the web app understands `session`.
 */

export const SNAPSHOT_VERSION = 1

/** Generous caps that no real session reaches; they keep bad data out of storage and off viewers' screens. */
export const SNAPSHOT_LIMITS = {
  courts: 15,
  players: 500,
  queue: 500,
  /** Serialized size in bytes. */
  publicBytes: 128 * 1024,
  fullBytes: 256 * 1024,
} as const

export type WireGameMode = 'doubles' | 'singles'
export type WireMatchmaking = 'balanced' | 'skill' | 'winners' | 'mixed'
export type WireSkill = 1 | 2 | 3 | 4 | 5 | 6

export interface WireCourt {
  id: number
  teams: [number[], number[]] | null
}

export interface WireStats {
  games: number
  wins: number
  losses: number
  opponentSkill: number
}

export interface WirePlayer {
  id: number
  name: string
  skill: WireSkill
}

export interface PublicSnapshot {
  schemaVersion: typeof SNAPSHOT_VERSION
  location: string
  mode: WireGameMode
  matchmaking: WireMatchmaking
  avgGameMinutes: number
  courts: WireCourt[]
  queue: number[]
  onBreak: number[]
  partners: [number, number][]
  stats: Record<number, WireStats>
  players: Record<number, WirePlayer>
}

export interface FullBackupEnvelope {
  schemaVersion: typeof SNAPSHOT_VERSION
  /** Version of the persisted session shape, so the web app can migrate it on load. */
  storeVersion: number
  location: string
  session: Record<string, unknown>
}

const MODES: readonly string[] = ['doubles', 'singles']
const MATCHMAKING: readonly string[] = ['balanced', 'skill', 'winners', 'mixed']

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isId = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isIdList = (v: unknown, max: number): v is number[] =>
  Array.isArray(v) && v.length <= max && v.every(isId)
const isCount = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1_000_000
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max

function validCourts(v: unknown): v is WireCourt[] {
  return (
    Array.isArray(v) &&
    v.length <= SNAPSHOT_LIMITS.courts &&
    v.every(
      (c) =>
        isObject(c) &&
        isId(c.id) &&
        (c.teams === null ||
          (Array.isArray(c.teams) && c.teams.length === 2 && c.teams.every((t) => isIdList(t, 2)))),
    )
  )
}

function validPlayers(v: unknown): v is Record<number, WirePlayer> {
  if (!isObject(v)) return false
  const entries = Object.entries(v)
  return (
    entries.length <= SNAPSHOT_LIMITS.players &&
    entries.every(
      ([key, p]) =>
        isObject(p) &&
        isId(p.id) &&
        String(p.id) === key &&
        isText(p.name, MAX_PLAYER_NAME_LENGTH) &&
        Number.isInteger(p.skill) &&
        (p.skill as number) >= 1 &&
        (p.skill as number) <= 6,
    )
  )
}

function validStats(v: unknown): v is Record<number, WireStats> {
  if (!isObject(v)) return false
  const entries = Object.entries(v)
  return (
    entries.length <= SNAPSHOT_LIMITS.players &&
    entries.every(
      ([key, s]) =>
        /^\d+$/.test(key) &&
        isObject(s) &&
        isCount(s.games) &&
        isCount(s.wins) &&
        isCount(s.losses) &&
        isCount(s.opponentSkill),
    )
  )
}

/**
 * Returns a clean copy of the snapshot if it is well formed and of a known
 * version, otherwise null. The copy holds only the known public fields, so
 * anything extra in the input (a gender, say) is dropped and can never be stored or shown.
 */
export function parsePublicSnapshot(raw: unknown): PublicSnapshot | null {
  if (!isObject(raw) || raw.schemaVersion !== SNAPSHOT_VERSION) return null
  const ok =
    isText(raw.location, MAX_LOCATION_LENGTH) &&
    typeof raw.mode === 'string' &&
    MODES.includes(raw.mode) &&
    typeof raw.matchmaking === 'string' &&
    MATCHMAKING.includes(raw.matchmaking) &&
    typeof raw.avgGameMinutes === 'number' &&
    Number.isFinite(raw.avgGameMinutes) &&
    validCourts(raw.courts) &&
    isIdList(raw.queue, SNAPSHOT_LIMITS.queue) &&
    isIdList(raw.onBreak, SNAPSHOT_LIMITS.queue) &&
    Array.isArray(raw.partners) &&
    raw.partners.length <= SNAPSHOT_LIMITS.players &&
    raw.partners.every((pair) => isIdList(pair, 2) && (pair as number[]).length === 2) &&
    validStats(raw.stats) &&
    validPlayers(raw.players)
  return ok ? copyPublicSnapshot(raw as unknown as PublicSnapshot) : null
}

function copyPublicSnapshot(s: PublicSnapshot): PublicSnapshot {
  const pick = <T extends object, K extends keyof T>(source: T, keys: K[]) =>
    Object.fromEntries(keys.map((key) => [key, source[key]])) as Pick<T, K>
  return {
    schemaVersion: SNAPSHOT_VERSION,
    location: s.location,
    mode: s.mode,
    matchmaking: s.matchmaking,
    avgGameMinutes: s.avgGameMinutes,
    courts: s.courts.map((c) => ({
      id: c.id,
      teams: c.teams ? [[...c.teams[0]], [...c.teams[1]]] : null,
    })),
    queue: [...s.queue],
    onBreak: [...s.onBreak],
    partners: s.partners.map(([a, b]) => [a, b] as [number, number]),
    stats: Object.fromEntries(
      Object.entries(s.stats).map(([id, st]) => [id, pick(st, ['games', 'wins', 'losses', 'opponentSkill'])]),
    ),
    players: Object.fromEntries(
      Object.entries(s.players).map(([id, p]) => [id, pick(p, ['id', 'name', 'skill'])]),
    ),
  }
}

/** Returns the envelope if its outer shape is right. The inner session is left for the web app to check. */
export function parseFullBackupEnvelope(raw: unknown): FullBackupEnvelope | null {
  if (!isObject(raw) || raw.schemaVersion !== SNAPSHOT_VERSION) return null
  if (!isText(raw.location, MAX_LOCATION_LENGTH)) return null
  if (!Number.isInteger(raw.storeVersion) || (raw.storeVersion as number) < 1) return null
  if (!isObject(raw.session)) return null
  return raw as unknown as FullBackupEnvelope
}

/** Size of a value once serialized, in bytes. */
export const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length
