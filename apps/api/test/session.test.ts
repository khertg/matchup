import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../src/db'
import {
  bearer,
  clearData,
  createClub,
  publish,
  sampleBackup,
  sampleSnapshot,
  startTestApp,
  startTestDb,
} from './helpers'

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

const live = (slug: string, headers: Record<string, string> = {}) =>
  app.inject({ method: 'GET', url: `/api/clubs/${slug}/live`, headers })
const put = (token: string | null, payload: unknown) =>
  app.inject({
    method: 'PUT',
    url: '/api/session',
    headers: token ? bearer(token) : {},
    payload: payload as object,
  })

describe('publishing a session', () => {
  it('needs a valid staff token', async () => {
    const body = { public: sampleSnapshot(), full: sampleBackup() }
    expect((await put(null, body)).statusCode).toBe(401)
    expect((await put('0'.repeat(64), body)).statusCode).toBe(401)
    expect((await put('not-a-token', body)).statusCode).toBe(401)
  })

  it('stores the session and shows it to anyone, no login needed', async () => {
    const { token, slug } = await createClub(app)
    const published = await publish(app, token)
    expect(published.statusCode).toBe(200)
    expect(Number.isNaN(Date.parse(published.json().updatedAt))).toBe(false)

    const response = await live(slug)
    expect(response.statusCode).toBe(200)
    expect(response.json().state).toEqual(sampleSnapshot())
    expect(response.json().updatedAt).toBe(published.json().updatedAt)
  })

  it('never exposes private data on any public endpoint', async () => {
    const { token, slug } = await createClub(app)
    await publish(app, token)
    const everything = [
      (await live(slug)).body,
      (await app.inject({ method: 'GET', url: `/api/clubs/${slug}/players` })).body,
    ].join('\n')
    expect(everything).not.toMatch(/gender|lastResult|private/i)
    expect(everything).toContain('Sunset Courts')
  })

  it('drops unknown fields, so a client bug cannot publish genders or extra data', async () => {
    const { token, slug } = await createClub(app)
    const snapshot = sampleSnapshot()
    const dirty = {
      ...snapshot,
      email: 'owner@example.com',
      players: Object.fromEntries(
        Object.entries(snapshot.players).map(([id, p]) => [id, { ...p, gender: 'F', phone: '555' }]),
      ),
    }
    expect((await put(token, { public: dirty, full: sampleBackup() })).statusCode).toBe(200)
    const body = (await live(slug)).body
    expect(body).not.toMatch(/gender|email|phone|owner@/)
  })

  it('rejects snapshots that are malformed or too big', async () => {
    const { token } = await createClub(app)
    const bad = [
      { ...sampleSnapshot(), mode: 'triples' },
      { ...sampleSnapshot(), courts: 'none' },
      { ...sampleSnapshot(), players: { 1: { id: 1, name: 'A', skill: 99 } } },
      { ...sampleSnapshot(), schemaVersion: 2 },
      { ...sampleSnapshot(), location: 'x'.repeat(200) },
    ]
    for (const snapshot of bad) {
      const response = await put(token, { public: snapshot, full: sampleBackup() })
      expect(response.statusCode, JSON.stringify(snapshot).slice(0, 60)).toBe(400)
      expect(response.json().error).toBe('invalid_snapshot')
    }
    const badBackup = await put(token, { public: sampleSnapshot(), full: { hello: 'world' } })
    expect(badBackup.json().error).toBe('invalid_snapshot')

    const huge = { ...sampleBackup(), session: { blob: 'x'.repeat(300 * 1024) } }
    const tooBig = await put(token, { public: sampleSnapshot(), full: huge })
    expect(tooBig.statusCode).toBe(413)
    expect(tooBig.json().error).toBe('payload_too_large')
  })

  it('rejects requests that are missing parts', async () => {
    const { token } = await createClub(app)
    for (const body of [{}, { public: sampleSnapshot() }, { full: sampleBackup() }, { public: 'x', full: 'y' }]) {
      const response = await put(token, body)
      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('invalid_request')
    }
  })

  it('keeps the names staff gave their courts, in board order', async () => {
    const { token, slug } = await createClub(app)
    const snapshot = {
      ...sampleSnapshot(),
      courts: [
        { id: 3, name: 'Center Court', teams: null },
        { id: 1, name: 'Court 1', teams: null },
      ],
    }
    expect((await put(token, { public: snapshot, full: sampleBackup() })).statusCode).toBe(200)
    const courts = (await live(slug)).json().state.courts
    expect(courts.map((c: { id: number; name: string }) => [c.id, c.name])).toEqual([
      [3, 'Center Court'],
      [1, 'Court 1'],
    ])
  })

  it('accepts a session from an older app whose courts have no names, and names them', async () => {
    const { token, slug } = await createClub(app)
    const legacy = { ...sampleSnapshot(), courts: [{ id: 1, teams: null }, { id: 2, teams: null }] }
    expect((await put(token, { public: legacy, full: sampleBackup() })).statusCode).toBe(200)
    const names = (await live(slug)).json().state.courts.map((c: { name: string }) => c.name)
    expect(names).toEqual(['Court 1', 'Court 2'])
  })

  it('publishes the next group to the live board', async () => {
    const { token, slug } = await createClub(app)
    const snapshot = { ...sampleSnapshot(), nextUp: [5, 6, 7, 8] }
    expect((await put(token, { public: snapshot, full: sampleBackup() })).statusCode).toBe(200)
    expect((await live(slug)).json().state.nextUp).toEqual([5, 6, 7, 8])
  })

  it('accepts a session from an older app that has no next group, and shows none', async () => {
    const { token, slug } = await createClub(app)
    const { nextUp: _omitted, ...legacy } = sampleSnapshot()
    expect((await put(token, { public: legacy, full: sampleBackup() })).statusCode).toBe(200)
    expect((await live(slug)).json().state.nextUp).toEqual([])
  })

  it('rejects a next group that is not a short list of ids', async () => {
    const { token } = await createClub(app)
    for (const nextUp of ['5', [1, 2, 3, 4, 5], [1.5, 2], [-1, 2], null]) {
      const response = await put(token, { public: { ...sampleSnapshot(), nextUp }, full: sampleBackup() })
      expect(response.statusCode, JSON.stringify(nextUp)).toBe(400)
      expect(response.json().error).toBe('invalid_snapshot')
    }
  })

  it('rejects court names that are not text or are too long', async () => {
    const { token } = await createClub(app)
    for (const name of [42, null, 'n'.repeat(41)]) {
      const snapshot = { ...sampleSnapshot(), courts: [{ id: 1, name, teams: null }] }
      const response = await put(token, { public: snapshot, full: sampleBackup() })
      expect(response.statusCode, JSON.stringify(name)).toBe(400)
      expect(response.json().error).toBe('invalid_snapshot')
    }
  })

  it('replaces the previous session instead of adding another', async () => {
    const { token, slug } = await createClub(app)
    await publish(app, token, 'First')
    await publish(app, token, 'Second')
    expect((await live(slug)).json().state.location).toBe('Second')
    expect((await db.query('select 1 from live_sessions')).rowCount).toBe(1)
    expect((await db.query('select 1 from session_backups')).rowCount).toBe(1)
  })

  it('keeps clubs completely separate', async () => {
    const a = await createClub(app, { slug: 'club-a' })
    const b = await createClub(app, { slug: 'club-b' })
    await publish(app, a.token, 'Alpha')
    await publish(app, b.token, 'Beta')
    expect((await live('club-a')).json().state.location).toBe('Alpha')
    expect((await live('club-b')).json().state.location).toBe('Beta')

    await app.inject({ method: 'DELETE', url: '/api/session', headers: bearer(a.token) })
    expect((await live('club-a')).statusCode).toBe(404)
    expect((await live('club-b')).statusCode).toBe(200)
  })
})

describe('reading the live session', () => {
  it('supports conditional requests, so polling viewers cost almost nothing', async () => {
    const { token, slug } = await createClub(app)
    await publish(app, token)
    const first = await live(slug)
    const etag = first.headers.etag as string
    expect(etag).toMatch(/^W\/"\d+"$/)
    expect(first.headers['cache-control']).toBe('no-cache')

    const again = await live(slug, { 'if-none-match': etag })
    expect(again.statusCode).toBe(304)
    expect(again.body).toBe('')

    await new Promise((resolve) => setTimeout(resolve, 5))
    await publish(app, token, 'Changed')
    const changed = await live(slug, { 'if-none-match': etag })
    expect(changed.statusCode).toBe(200)
    expect(changed.headers.etag).not.toBe(etag)
  })

  it('answers unknown clubs, invalid URLs and idle clubs with exactly the same 404', async () => {
    await createClub(app, { slug: 'idle-club' })
    const responses = await Promise.all(
      ['idle-club', 'no-such-club', 'NOT%20VALID', 'x'].map((slug) => live(slug)),
    )
    for (const response of responses) {
      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ error: 'not_found', message: 'Not found.' })
    }
  })

  it('accepts the club URL in any case', async () => {
    const { token } = await createClub(app, { slug: 'sunset-club' })
    await publish(app, token)
    expect((await live('Sunset-Club')).statusCode).toBe(200)
  })

  it('treats a session nobody has updated for the configured time as ended', async () => {
    const { token, slug } = await createClub(app)
    await publish(app, token)
    await db.query("update live_sessions set updated_at = now() - interval '25 hours'")
    expect((await live(slug)).statusCode).toBe(404)
    // Any staff activity brings it back.
    await publish(app, token)
    expect((await live(slug)).statusCode).toBe(200)
  })
})

describe('resuming on another device', () => {
  it('returns the private backup to the club that published it', async () => {
    const { token } = await createClub(app)
    await publish(app, token)
    const response = await app.inject({ method: 'GET', url: '/api/session', headers: bearer(token) })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(sampleBackup())
    expect(response.body).toContain('gender') // the backup keeps everything
  })

  it('is 404 when nothing is running, and needs a token', async () => {
    const { token } = await createClub(app)
    expect((await app.inject({ method: 'GET', url: '/api/session', headers: bearer(token) })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/api/session' })).statusCode).toBe(401)
  })

  it('never hands one club another club’s backup', async () => {
    const a = await createClub(app, { slug: 'club-a' })
    const b = await createClub(app, { slug: 'club-b' })
    await publish(app, a.token, 'Alpha only')
    expect((await app.inject({ method: 'GET', url: '/api/session', headers: bearer(b.token) })).statusCode).toBe(404)
  })
})

describe('clearing a session', () => {
  it('ends the live board and removes the backup', async () => {
    const { token, slug } = await createClub(app)
    await publish(app, token)
    const cleared = await app.inject({ method: 'DELETE', url: '/api/session', headers: bearer(token) })
    expect(cleared.statusCode).toBe(204)
    expect((await live(slug)).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/api/session', headers: bearer(token) })).statusCode).toBe(404)
  })

  it('is safe to repeat and needs a token', async () => {
    const { token } = await createClub(app)
    expect((await app.inject({ method: 'DELETE', url: '/api/session', headers: bearer(token) })).statusCode).toBe(204)
    expect((await app.inject({ method: 'DELETE', url: '/api/session', headers: bearer(token) })).statusCode).toBe(204)
    expect((await app.inject({ method: 'DELETE', url: '/api/session' })).statusCode).toBe(401)
  })
})
