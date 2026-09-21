import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../src/db'
import { bearer, clearData, createClub, publish, startTestApp, startTestDb } from './helpers'

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

const get = (headers: Record<string, string>) => app.inject({ method: 'GET', url: '/api/session', headers })

describe('bearer tokens', () => {
  it('rejects a missing, malformed or unknown Authorization header', async () => {
    const { token } = await createClub(app)
    const headers: Record<string, string>[] = [
      {},
      { authorization: '' },
      { authorization: 'Bearer' },
      { authorization: 'Bearer ' },
      { authorization: token }, // no scheme
      { authorization: `Basic ${token}` },
      { authorization: `bearer ${token}` }, // wrong case of the scheme
      { authorization: `Bearer ${token.toUpperCase()}` },
      { authorization: `Bearer ${token.slice(0, 63)}` },
      { authorization: `Bearer ${token}0` },
      { authorization: `Bearer ${'0'.repeat(64)}` },
      { authorization: `Bearer ${token} extra` },
    ]
    for (const header of headers) {
      const response = await get(header)
      expect(response.statusCode, JSON.stringify(header)).toBe(401)
      expect(response.json().error).toBe('invalid_token')
    }
    expect((await get(bearer(token))).statusCode).toBe(404) // valid token, no session yet
  })

  it('stops working when it expires', async () => {
    const { token } = await createClub(app)
    expect((await publish(app, token)).statusCode).toBe(200)
    await db.query("update club_tokens set expires_at = now() - interval '1 second'")
    expect((await publish(app, token)).statusCode).toBe(401)
  })

  it('lasts as long as the configured lifetime', async () => {
    const short = await startTestApp(db, { tokenTtlDays: 2 })
    await createClub(short, { slug: 'short-club' })
    const { rows } = await db.query<{ days: number }>(
      "select extract(epoch from (expires_at - now())) / 86400 as days from club_tokens"
    )
    expect(Number(rows[0].days)).toBeGreaterThan(1.99)
    expect(Number(rows[0].days)).toBeLessThan(2.01)
    await short.close()
  })

  it('clears out expired tokens whenever a new one is issued', async () => {
    const { token } = await createClub(app, { slug: 'downtown-club' })
    await db.query("update club_tokens set expires_at = now() - interval '1 day'")
    await app.inject({ method: 'POST', url: '/api/clubs/downtown-club/login', payload: { password: 'secret-pass' } })
    const remaining = (await db.query<{ token_hash: string }>('select token_hash from club_tokens')).rows
    expect(remaining).toHaveLength(1)
    expect((await publish(app, token)).statusCode).toBe(401)
  })

  it('belongs to one club: it can only touch that club’s data', async () => {
    const a = await createClub(app, { slug: 'club-a' })
    await createClub(app, { slug: 'club-b' })
    await publish(app, a.token, 'Alpha')
    const rows = (await db.query<{ club_slug: string }>('select club_slug from live_sessions')).rows
    expect(rows.map((r) => r.club_slug)).toEqual(['club-a'])
  })

  it('is deleted along with its club', async () => {
    await createClub(app, { slug: 'downtown-club' })
    await db.query("delete from clubs where slug = 'downtown-club'")
    expect((await db.query('select 1 from club_tokens')).rowCount).toBe(0)
  })
})
