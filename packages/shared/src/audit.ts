/**
 * The audit log: which staff device did what. Staff devices all share one club password, so an entry is
 * tied to a device (its own random id, its details and the name staff gave it), not to a verified person.
 * Staff only: nothing here is ever on the public live page.
 */

export const AUDIT_LIMITS = {
  /** Entries per POST /audit. */
  batch: 100,
  summary: 300,
  kind: 40,
  deviceId: 64,
  deviceLabel: 80,
  deviceName: 40,
  /** Entries per GET /audit page, at most. */
  page: 200,
  /** Entries per numbered page in the app. */
  pageSize: 20,
  /** Characters in a search. */
  search: 100,
} as const

/** The staff device an entry came from. */
export interface AuditDevice {
  /** Random, made on the device and kept there: tells two identical phones apart. */
  id: string
  /** What the browser says about the device, e.g. "SM-S918B · Android 14 · Chrome" or "iPhone · iOS 18 · Safari". */
  label: string
  /** The name staff gave the device, unique within the club. Missing before it was named. */
  name?: string
}

export interface AuditEntry {
  /** A UUID made on the device, so sending an entry twice stores it once. */
  id: string
  /** When it happened on the device (ISO time). */
  at: string
  device: AuditDevice
  /** What kind of change, e.g. "checkIn", "recordScore", "sessionEnded". */
  kind: string
  /** What happened, as staff read it: "Checked in Ann, Bob". */
  summary: string
  /** The session it happened in, if any. */
  sessionId?: string
}

/** POST /audit (staff). */
export interface PostAuditRequest {
  entries: AuditEntry[]
}

/**
 * GET /audit (staff): newest first. With `page`, `total` is how many entries match (for "Page 2 of 7");
 * without it (older apps), `next` is the `before` for the following page, null at the end.
 */
export interface AuditPage {
  entries: AuditEntry[]
  next: string | null
  total?: number
}

/** PUT /devices/me (staff): name this device. 409 `name_taken` when another device of the club has the name. */
export interface RegisterDeviceRequest {
  id: string
  name: string
  label: string
}

/** GET /devices (staff): the club's named devices. */
export interface ClubDevice {
  id: string
  name: string
  label: string
  lastSeen: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_PATTERN.test(value)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Trimmed text of 1 to `max` characters, or null. */
function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null
}

/** A device name staff typed: trimmed, 1 to 40 characters, or null. */
export const parseDeviceName = (value: unknown): string | null => text(value, AUDIT_LIMITS.deviceName)

export function parseAuditDevice(raw: unknown): AuditDevice | null {
  if (!isRecord(raw)) return null
  const id = text(raw.id, AUDIT_LIMITS.deviceId)
  const label = text(raw.label, AUDIT_LIMITS.deviceLabel)
  if (!id || !label) return null
  const name = raw.name === undefined ? undefined : parseDeviceName(raw.name)
  if (name === null) return null
  return { id, label, ...(name ? { name } : {}) }
}

function parseAuditEntry(raw: unknown): AuditEntry | null {
  if (!isRecord(raw) || !isUuid(raw.id)) return null
  if (typeof raw.at !== 'string' || Number.isNaN(Date.parse(raw.at))) return null
  const device = parseAuditDevice(raw.device)
  const kind = text(raw.kind, AUDIT_LIMITS.kind)
  const summary = text(raw.summary, AUDIT_LIMITS.summary)
  if (!device || !kind || !summary) return null
  if (raw.sessionId !== undefined && !isUuid(raw.sessionId)) return null
  return {
    id: raw.id.toLowerCase(),
    at: new Date(raw.at).toISOString(),
    device,
    kind,
    summary,
    ...(raw.sessionId ? { sessionId: (raw.sessionId as string).toLowerCase() } : {}),
  }
}

/**
 * A batch of entries from a device: a fresh copy with only the known fields, or null when anything in it is
 * not an entry, or there are more than a batch's worth.
 */
export function parseAuditEntries(raw: unknown): AuditEntry[] | null {
  if (!isRecord(raw) || !Array.isArray(raw.entries)) return null
  if (raw.entries.length > AUDIT_LIMITS.batch) return null
  const entries = raw.entries.map(parseAuditEntry)
  return entries.every((e): e is AuditEntry => e !== null) ? entries : null
}

/** A device naming itself: a fresh copy, or null. */
export function parseRegisterDevice(raw: unknown): RegisterDeviceRequest | null {
  if (!isRecord(raw)) return null
  const device = parseAuditDevice(raw)
  const name = parseDeviceName(raw.name)
  return device && name ? { id: device.id, label: device.label, name } : null
}
