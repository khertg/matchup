import { AUDIT_LIMITS, type AuditEntry, type AuditPage, type ClubDevice, type RegisterDeviceRequest } from '@q2dink/shared'
import type { Db, Queryable } from '../db'
import { AppError } from '../errors'

const toIso = (value: unknown) => new Date(value as string | number | Date).toISOString()

/** A unique index said no: another device of the club already has the name. */
const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505'

/**
 * Name a device for its club, or rename it. A name another device of the club already has (ignoring
 * case) is refused, so two identical phones never look the same in the log.
 */
export async function registerDevice(db: Db, slug: string, device: RegisterDeviceRequest): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const { rows } = await tx.query(
        'select 1 from club_devices where club_slug = $1 and lower(name) = lower($2) and device_id <> $3',
        [slug, device.name, device.id],
      )
      if (rows.length > 0) throw new AppError('name_taken')
      await tx.query(
        `insert into club_devices (club_slug, device_id, name, label, last_seen)
         values ($1, $2, $3, $4, now())
         on conflict (club_slug, device_id) do update
           set name = excluded.name, label = excluded.label, last_seen = excluded.last_seen`,
        [slug, device.id, device.name, device.label],
      )
    })
  } catch (error) {
    // Two devices taking the same name at the same moment: the index lets only one have it.
    if (isUniqueViolation(error)) throw new AppError('name_taken')
    throw error
  }
}

/** The club's named devices, most recently seen first. */
export async function listDevices(db: Queryable, slug: string): Promise<ClubDevice[]> {
  const { rows } = await db.query<{ device_id: string; name: string; label: string; last_seen: unknown }>(
    'select device_id, name, label, last_seen from club_devices where club_slug = $1 order by last_seen desc',
    [slug],
  )
  return rows.map((r) => ({ id: r.device_id, name: r.name, label: r.label, lastSeen: toIso(r.last_seen) }))
}

/**
 * Store entries a device sent. Sending one again stores it once. Entries older than `retentionDays` are
 * let go, and the sending devices are marked as seen.
 */
export async function addAuditEntries(db: Db, slug: string, entries: AuditEntry[], retentionDays: number): Promise<void> {
  if (entries.length === 0) return
  await db.transaction(async (tx) => {
    for (const e of entries) {
      await tx.query(
        `insert into audit_log (id, club_slug, at, device_id, device_label, device_name, kind, summary, session_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (id) do nothing`,
        [e.id, slug, e.at, e.device.id, e.device.label, e.device.name ?? null, e.kind, e.summary, e.sessionId ?? null],
      )
    }
    const devices = [...new Set(entries.map((e) => e.device.id))]
    await tx.query('update club_devices set last_seen = now() where club_slug = $1 and device_id = any($2)', [slug, devices])
    await tx.query(`delete from audit_log where club_slug = $1 and at < now() - ($2 * interval '1 day')`, [slug, retentionDays])
  })
}

export interface AuditQuery {
  sessionId?: string
  deviceId?: string
  /** Only entries before this time (the `next` of the previous page). */
  before?: string
  limit?: number
}

type Row = {
  id: string
  at: unknown
  device_id: string
  device_label: string
  device_name: string | null
  kind: string
  summary: string
  session_id: string | null
}

/** One page of the club's log, newest first, optionally for one session or one device. */
export async function listAudit(db: Queryable, slug: string, query: AuditQuery = {}): Promise<AuditPage> {
  const limit = Math.min(Math.max(query.limit ?? 50, 1), AUDIT_LIMITS.page)
  const where = ['club_slug = $1']
  const params: unknown[] = [slug]
  const add = (clause: string, value: unknown) => {
    params.push(value)
    where.push(clause.replace('?', `$${params.length}`))
  }
  if (query.sessionId) add('session_id = ?', query.sessionId)
  if (query.deviceId) add('device_id = ?', query.deviceId)
  if (query.before) add('at < ?', query.before)
  params.push(limit + 1)
  const { rows } = await db.query<Row>(
    `select id, at, device_id, device_label, device_name, kind, summary, session_id from audit_log
     where ${where.join(' and ')} order by at desc, id desc limit $${params.length}`,
    params,
  )
  const page = rows.slice(0, limit).map(
    (r): AuditEntry => ({
      id: r.id,
      at: toIso(r.at),
      device: { id: r.device_id, label: r.device_label, ...(r.device_name ? { name: r.device_name } : {}) },
      kind: r.kind,
      summary: r.summary,
      ...(r.session_id ? { sessionId: r.session_id } : {}),
    }),
  )
  return { entries: page, next: rows.length > limit ? page[page.length - 1].at : null }
}
