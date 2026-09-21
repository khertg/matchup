import { MAX_HISTORY_PER_CLUB, SNAPSHOT_LIMITS } from '@matchup/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../src/db'
import { bearer, clearData, createClub, sampleBackup, startTestApp, startTestDb } from './helpers'

let db: Db
let app: FastifyInstance

beforeAll(async () => {
  db = await startTestDb()
  app = await startTestApp(db)
})
afterAll(async () => {
  await app.close()
  await db.close()
})
beforeEach(() => clearData(db))

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const body = (over: Record<string, unknown> = {}) => ({
  endedAt: '2026-03-01T20:00:00.000Z',
  mode: 'doubles',
  players: 6,
  games: 4,
  full: sampleBackup('Sunset Courts'),
  ...over,
})

const put = (token: string | null, id: string, payload: unknown) =>
  app.inject({
    method: 'PUT',
    url: `/api/history/${id}`,
    headers: token ? bearer(token) : {},
    payload: payload as object,
  })
const list = (token: string | null) =>
  app.inject({ method: 'GET', url: '/api/history', headers: token ? bearer(token) : {} })
const get = (token: string | null, id: string) =>
  app.inject({ method: 'GET', url: `/api/history/${id}`, headers: token ? bearer(token) : {} })
const remove = (token: string | null, id: string) =>
  app.inject({ method: 'DELETE', url: `/api/history/${id}`, headers: token ? bearer(token) : {} })

describe('session history', () => {
  it('needs a valid staff token for every route', async () => {
    const id = uuid(1)
    for (const token of [null, 'not-a-token', '0'.repeat(64)]) {
      expect((await put(token, id, body())).statusCode).toBe(401)
      expect((await list(token)).statusCode).toBe(401)
      expect((await get(token, id)).statusCode).toBe(401)
      expect((await remove(token, id)).statusCode).toBe(401)
    }
  })

  it('saves a session, lists it newest first, and returns it whole', async () => {
    const { token } = await createClub(app)
    expect((await put(token, uuid(1), body({ endedAt: '2026-03-01T20:00:00Z' }))).statusCode).toBe(204)
    expect(
      (await put(token, uuid(2), body({ endedAt: '2026-03-02T20:00:00Z', mode: 'singles', players: 3, games: 2 })))
        .statusCode,
    ).toBe(204)

    const sessions = (await list(token)).json().sessions
    expect(sessions.map((s: { id: string }) => s.id)).toEqual([uuid(2), uuid(1)])
    expect(sessions[0]).toEqual({
      id: uuid(2),
      location: 'Sunset Courts',
      endedAt: '2026-03-02T20:00:00.000Z',
      mode: 'singles',
      players: 3,
      games: 2,
    })

    const full = await get(token, uuid(1))
    expect(full.statusCode).toBe(200)
    expect(full.json()).toEqual(sampleBackup('Sunset Courts'))
  })

  it('replaces a session sent again instead of adding a second one', async () => {
    const { token } = await createClub(app)
    await put(token, uuid(1), body({ games: 2 }))
    await put(token, uuid(1), body({ games: 5, endedAt: '2026-03-03T20:00:00Z', full: sampleBackup('Later') }))
    const sessions = (await list(token)).json().sessions
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ games: 5, location: 'Later', endedAt: '2026-03-03T20:00:00.000Z' })
  })

  it('treats the id case-insensitively', async () => {
    const { token } = await createClub(app)
    await put(token, 'ABCDEF00-0000-4000-8000-000000000001', body())
    await put(token, 'abcdef00-0000-4000-8000-000000000001', body())
    expect((await list(token)).json().sessions).toHaveLength(1)
    expect((await get(token, 'ABCDEF00-0000-4000-8000-000000000001')).statusCode).toBe(200)
  })

  it("never shows one club another club's history", async () => {
    const a = await createClub(app)
    const b = await createClub(app)
    await put(a.token, uuid(1), body())
    expect((await list(b.token)).json().sessions).toEqual([])
    expect((await get(b.token, uuid(1))).statusCode).toBe(404)
    // Deleting someone else's session does nothing.
    expect((await remove(b.token, uuid(1))).statusCode).toBe(204)
    expect((await list(a.token)).json().sessions).toHaveLength(1)
    // The same id can exist in two clubs without clashing.
    expect((await put(b.token, uuid(1), body({ full: sampleBackup('B') }))).statusCode).toBe(204)
    expect((await get(a.token, uuid(1))).json().location).toBe('Sunset Courts')
    expect((await get(b.token, uuid(1))).json().location).toBe('B')
  })

  it('deletes a session, and deleting one that is gone is fine', async () => {
    const { token } = await createClub(app)
    await put(token, uuid(1), body())
    expect((await remove(token, uuid(1))).statusCode).toBe(204)
    expect((await remove(token, uuid(1))).statusCode).toBe(204)
    expect((await get(token, uuid(1))).statusCode).toBe(404)
    expect((await list(token)).json().sessions).toEqual([])
  })

  it('answers 404 for an id that is not a UUID or is unknown', async () => {
    const { token } = await createClub(app)
    expect((await get(token, 'nope')).statusCode).toBe(404)
    expect((await get(token, uuid(9))).statusCode).toBe(404)
  })

  it('keeps only the newest sessions once a club passes the limit', async () => {
    const { token } = await createClub(app)
    const total = MAX_HISTORY_PER_CLUB + 3
    for (let n = 1; n <= total; n++) {
      const day = new Date(Date.UTC(2026, 0, 1) + n * 86_400_000).toISOString()
      expect((await put(token, uuid(n), body({ endedAt: day }))).statusCode).toBe(204)
    }
    const sessions = (await list(token)).json().sessions as { id: string }[]
    expect(sessions).toHaveLength(MAX_HISTORY_PER_CLUB)
    expect(sessions[0].id).toBe(uuid(total))
    expect((await get(token, uuid(1))).statusCode).toBe(404)
    expect((await get(token, uuid(4))).statusCode).toBe(200)
  })

  it('rejects malformed requests', async () => {
    const { token } = await createClub(app)
    const bad: [string, unknown][] = [
      [uuid(1), {}],
      [uuid(1), body({ mode: 'triples' })],
      [uuid(1), body({ players: -1 })],
      [uuid(1), body({ players: SNAPSHOT_LIMITS.players + 1 })],
      [uuid(1), body({ games: 1.5 })],
      [uuid(1), body({ full: 'x' })],
      [uuid(1), { ...body(), extra: 1 }],
      [uuid(1), body({ endedAt: 'yesterday' })],
      [uuid(1), body({ full: { ...sampleBackup(), schemaVersion: 2 } })],
      [uuid(1), body({ full: { ...sampleBackup(), location: 'x'.repeat(121) } })],
      ['not-a-uuid', body()],
    ]
    for (const [id, payload] of bad) {
      const response = await put(token, id, payload)
      expect(response.statusCode, JSON.stringify(payload).slice(0, 80)).toBe(400)
    }
    expect((await list(token)).json().sessions).toEqual([])
  })

  it('refuses a session that is too large', async () => {
    const { token } = await createClub(app)
    const huge = { ...sampleBackup(), session: { filler: 'x'.repeat(SNAPSHOT_LIMITS.fullBytes) } }
    const response = await put(token, uuid(1), body({ full: huge }))
    expect(response.statusCode).toBe(413)
    expect(response.json().error).toBe('payload_too_large')
  })

  it('is removed with its club', async () => {
    const { token, slug } = await createClub(app)
    await put(token, uuid(1), body())
    await db.query('delete from clubs where slug = $1', [slug])
    const { rows } = await db.query('select 1 from session_history')
    expect(rows).toHaveLength(0)
  })

  it('does not disturb the running session', async () => {
    const { token } = await createClub(app)
    await put(token, uuid(1), body())
    const running = await app.inject({ method: 'GET', url: '/api/session', headers: bearer(token) })
    expect(running.statusCode).toBe(404)
  })
})
