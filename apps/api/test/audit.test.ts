import type { AuditEntry, AuditPage, ClubDevice } from '@q2dink/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../src/db'
import { likePattern } from '../src/services/audit'
import { bearer, clearData, createClub, startTestApp, startTestDb } from './helpers'

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
const SESSION = uuid(900)
const IPHONE = 'iPhone · iOS 18 · Safari'

const entry = (n: number, over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: uuid(n),
  at: new Date(Date.UTC(2026, 8, 27, 10, 0, n)).toISOString(),
  device: { id: 'phone-a', label: IPHONE, name: 'Desk' },
  kind: 'checkIn',
  summary: `Checked in P${n}`,
  sessionId: SESSION,
  ...over,
})

const post = (token: string | null, entries: unknown) =>
  app.inject({ method: 'POST', url: '/api/audit', headers: token ? bearer(token) : {}, payload: { entries } })
const list = async (token: string, query = '') => {
  const response = await app.inject({ method: 'GET', url: `/api/audit${query}`, headers: bearer(token) })
  expect(response.statusCode).toBe(200)
  return response.json<AuditPage>()
}
const name = (token: string | null, id: string, deviceName: string, label = IPHONE) =>
  app.inject({ method: 'PUT', url: '/api/devices/me', headers: token ? bearer(token) : {}, payload: { id, name: deviceName, label } })
const devices = async (token: string) =>
  (await app.inject({ method: 'GET', url: '/api/devices', headers: bearer(token) })).json<{ devices: ClubDevice[] }>().devices

describe('audit log', () => {
  it('needs a valid staff token for every route', async () => {
    for (const token of [null, 'not-a-token', '0'.repeat(64)]) {
      expect((await post(token, [entry(1)])).statusCode).toBe(401)
      expect((await app.inject({ method: 'GET', url: '/api/audit', headers: token ? bearer(token) : {} })).statusCode).toBe(401)
      expect((await name(token, 'phone-a', 'Desk')).statusCode).toBe(401)
      expect((await app.inject({ method: 'GET', url: '/api/devices', headers: token ? bearer(token) : {} })).statusCode).toBe(401)
    }
  })

  it('stores what a device sent, newest first, and stores a resend only once', async () => {
    const { token } = await createClub(app)
    expect((await post(token, [entry(1), entry(2)])).statusCode).toBe(204)
    expect((await post(token, [entry(2), entry(3)])).statusCode).toBe(204)
    const page = await list(token)
    expect(page.entries.map((e) => e.summary)).toEqual(['Checked in P3', 'Checked in P2', 'Checked in P1'])
    expect(page.entries[0]).toEqual(entry(3))
    expect(page.next).toBeNull()
  })

  it('refuses entries that are not entries', async () => {
    const { token } = await createClub(app)
    expect((await post(token, [{ ...entry(1), id: 'nope' }])).statusCode).toBe(400)
    expect((await post(token, Array.from({ length: 101 }, (_, i) => entry(i + 1)))).statusCode).toBe(400)
  })

  it('reads one session or one device, a page at a time', async () => {
    const { token } = await createClub(app)
    await post(token, [
      entry(1),
      entry(2, { device: { id: 'phone-b', label: IPHONE, name: 'Maria' } }),
      entry(3, { sessionId: undefined, kind: 'rosterAdd', summary: 'Saved Zed' }),
      entry(4),
    ])
    expect((await list(token, `?sessionId=${SESSION}`)).entries.map((e) => e.id)).toEqual([uuid(4), uuid(2), uuid(1)])
    expect((await list(token, '?deviceId=phone-b')).entries.map((e) => e.summary)).toEqual(['Checked in P2'])

    const first = await list(token, '?limit=2')
    expect(first.entries.map((e) => e.id)).toEqual([uuid(4), uuid(3)])
    const second = await list(token, `?limit=2&before=${encodeURIComponent(first.next!)}`)
    expect(second.entries.map((e) => e.id)).toEqual([uuid(2), uuid(1)])
    expect(second.next).toBeNull()
  })

  it('keeps each club’s log to itself', async () => {
    const a = await createClub(app)
    const b = await createClub(app)
    await post(a.token, [entry(1)])
    await post(b.token, [entry(1)]) // the same id from another club is not stored for it
    expect((await list(a.token)).entries).toHaveLength(1)
    expect((await list(b.token)).entries).toHaveLength(0)
  })

  it('lets old entries go', async () => {
    const { token } = await createClub(app)
    await post(token, [entry(1, { at: '2020-01-01T00:00:00.000Z' }), entry(2)])
    expect((await list(token)).entries.map((e) => e.id)).toEqual([uuid(2)])
  })
})

describe('naming devices', () => {
  it('tells two identical iPhones apart by the names they were given', async () => {
    const { token } = await createClub(app)
    expect((await name(token, 'phone-a', 'Desk')).statusCode).toBe(204)
    expect((await name(token, 'phone-b', 'Maria')).statusCode).toBe(204)
    const list = await devices(token)
    expect(list.map((d) => [d.id, d.name, d.label]).sort()).toEqual([
      ['phone-a', 'Desk', IPHONE],
      ['phone-b', 'Maria', IPHONE],
    ])
  })

  it('refuses a name another device of the club has, in any case', async () => {
    const { token } = await createClub(app)
    await name(token, 'phone-a', 'Desk')
    const taken = await name(token, 'phone-b', ' desk ')
    expect(taken.statusCode).toBe(409)
    expect(taken.json().error).toBe('name_taken')
    expect((await devices(token)).map((d) => d.id)).toEqual(['phone-a'])
  })

  it('lets a device rename itself, and another club use the same name', async () => {
    const a = await createClub(app)
    const b = await createClub(app)
    await name(a.token, 'phone-a', 'Desk')
    expect((await name(a.token, 'phone-a', 'DESK')).statusCode).toBe(204)
    expect((await name(a.token, 'phone-a', 'Court side')).statusCode).toBe(204)
    expect((await name(b.token, 'phone-z', 'Court side')).statusCode).toBe(204)
    expect((await devices(a.token)).map((d) => d.name)).toEqual(['Court side'])
  })

  it('needs a name', async () => {
    const { token } = await createClub(app)
    expect((await name(token, 'phone-a', '  ')).statusCode).toBe(400)
  })
})

describe('searching and numbered pages', () => {
  const seed = async (token: string, count: number, over: (n: number) => Partial<AuditEntry> = () => ({})) => {
    const all = Array.from({ length: count }, (_, i) => entry(i + 1, over(i + 1)))
    for (let i = 0; i < all.length; i += 100) expect((await post(token, all.slice(i, i + 100))).statusCode).toBe(204)
  }
  const get = (token: string, query: string) => app.inject({ method: 'GET', url: `/api/audit?${query}`, headers: bearer(token) })

  it('gives numbered pages of 20, newest first, with the total', async () => {
    const { token } = await createClub(app)
    await seed(token, 45)
    const pages = await Promise.all([0, 1, 2, 3].map((p) => list(token, `?page=${p}`)))
    expect(pages.map((p) => p.entries.length)).toEqual([20, 20, 5, 0])
    expect(pages.every((p) => p.total === 45)).toBe(true)
    expect(pages[0].entries[0].summary).toBe('Checked in P45')
    expect(pages[2].entries.at(-1)!.summary).toBe('Checked in P1')
  })

  it('finds text in what happened, the device name or its details, ignoring case', async () => {
    const { token } = await createClub(app)
    await seed(token, 3)
    await post(token, [entry(50, { summary: 'Court 2: Blue won 11–7', device: { id: 'phone-b', label: 'SM-S918B · Android 14 · Chrome', name: 'Maria' } })])
    expect((await list(token, '?page=0&q=blue%20WON')).entries.map((e) => e.id)).toEqual([uuid(50)])
    expect((await list(token, '?page=0&q=maria')).entries.map((e) => e.id)).toEqual([uuid(50)])
    expect((await list(token, '?page=0&q=sm-s918')).entries.map((e) => e.id)).toEqual([uuid(50)])
    const desk = await list(token, '?page=0&q=desk')
    expect(desk.total).toBe(3)
    expect((await list(token, '?page=0&q=nothing-like-this')).entries).toEqual([])
  })

  it('takes % and _ in a search literally', async () => {
    const { token } = await createClub(app)
    await post(token, [entry(1, { summary: 'Won 50% of games' }), entry(2, { summary: 'Won 500 games' }), entry(3, { summary: 'a_b' }), entry(4, { summary: 'axb' })])
    expect((await list(token, '?page=0&q=50%25')).entries.map((e) => e.id)).toEqual([uuid(1)])
    expect((await list(token, '?page=0&q=a_b')).entries.map((e) => e.id)).toEqual([uuid(3)])
  })

  it('combines a search with one session and one device', async () => {
    const { token } = await createClub(app)
    await seed(token, 12, (n) => ({
      ...(n % 2 === 0 ? { device: { id: 'phone-b', label: IPHONE, name: 'Maria' } } : {}),
      ...(n > 6 ? { sessionId: uuid(901) } : {}),
    }))
    // P1, P10, P11, P12 match "P1"; of those, P10 and P12 are Maria's, and P10, P11, P12 are in session 901.
    const found = await list(token, `?page=0&q=P1&deviceId=phone-b&sessionId=${uuid(901)}`)
    expect(found.entries.map((e) => e.summary)).toEqual(['Checked in P12', 'Checked in P10'])
    expect(found.total).toBe(2)
  })

  it('refuses a search that is too long and a page that is not a page', async () => {
    const { token } = await createClub(app)
    expect((await get(token, `q=${'x'.repeat(101)}`)).statusCode).toBe(400)
    for (const page of ['-1', '1.5', 'two', '10001']) expect((await get(token, `page=${page}`)).statusCode, page).toBe(400)
    expect((await get(token, 'q=%20%20&page=0')).statusCode).toBe(200)
  })

  it('still pages the old way for older apps', async () => {
    const { token } = await createClub(app)
    await seed(token, 3)
    const first = await list(token, '?limit=2')
    expect(first.total).toBeUndefined()
    expect(first.next).not.toBeNull()
  })
})

describe('likePattern', () => {
  it('finds the text anywhere, with its wildcards taken literally', () => {
    expect(likePattern('ann')).toBe('%ann%')
    expect(likePattern('50%')).toBe(String.raw`%50\%%`)
    expect(likePattern(String.raw`a_b\c`)).toBe(String.raw`%a\_b\\c%`)
  })
})
