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

const post = (url: string, payload: unknown, ip?: string) =>
  app.inject({ method: 'POST', url, payload: payload as object, remoteAddress: ip })

describe('creating a club', () => {
  it('returns a staff token and a one-time recovery code', async () => {
    const response = await post('/api/clubs', { name: 'Downtown Club', slug: 'downtown-club', password: 'secret' })
    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.token).toMatch(/^[0-9a-f]{64}$/)
    expect(body.recoveryCode).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/)
  })

  it('never stores the password, the token or the recovery code in the clear', async () => {
    const { token, recoveryCode } = await createClub(app, { slug: 'downtown-club', password: 'hunter2!' })
    const club = (await db.query<{ password_hash: string; recovery_hash: string }>('select * from clubs')).rows[0]
    expect(club.password_hash).toMatch(/^\$argon2id\$/)
    expect(club.password_hash).not.toContain('hunter2')
    expect(club.recovery_hash).not.toContain(recoveryCode.replaceAll('-', ''))
    expect(club.recovery_hash).toMatch(/^[0-9a-f]{64}$/)
    const tokens = (await db.query<{ token_hash: string }>('select token_hash from club_tokens')).rows
    expect(tokens.map((t) => t.token_hash)).not.toContain(token)
    expect(tokens).toHaveLength(1)
  })

  it('normalizes the club URL and name', async () => {
    await post('/api/clubs', { name: '  Downtown Club  ', slug: ' Downtown-Club ', password: 'secret' })
    const club = (await db.query<{ slug: string; name: string }>('select slug, name from clubs')).rows[0]
    expect(club).toEqual({ slug: 'downtown-club', name: 'Downtown Club' })
  })

  it('refuses a URL that is already taken, ignoring case', async () => {
    await createClub(app, { slug: 'downtown-club' })
    const response = await post('/api/clubs', { name: 'Other', slug: 'DOWNTOWN-CLUB', password: 'secret' })
    expect(response.statusCode).toBe(409)
    expect(response.json().error).toBe('club_slug_taken')
    expect((await db.query('select 1 from clubs')).rowCount).toBe(1)
  })

  it('refuses weak or oversized passwords', async () => {
    for (const password of ['abc', '', 'x'.repeat(129)]) {
      const response = await post('/api/clubs', { name: 'A', slug: 'some-club', password })
      expect(response.statusCode, password.length.toString()).toBe(400)
      expect(response.json().error).toBe('weak_password')
    }
    expect((await post('/api/clubs', { name: 'A', slug: 'a-club', password: 'abcd' })).statusCode).toBe(201)
  })

  it('refuses invalid club names and URLs', async () => {
    for (const body of [
      { name: 'A', slug: 'ab', password: 'secret' },
      { name: 'A', slug: 'Has Space', password: 'secret' },
      { name: 'A', slug: '-lead', password: 'secret' },
      { name: '   ', slug: 'valid-slug', password: 'secret' },
      { name: 'n'.repeat(81), slug: 'valid-slug', password: 'secret' },
    ]) {
      const response = await post('/api/clubs', body)
      expect(response.statusCode, JSON.stringify(body)).toBe(400)
      expect(response.json().error).toBe('invalid_club')
    }
  })

  it('refuses malformed requests', async () => {
    for (const body of [{}, { name: 'A', slug: 'some-club' }, { name: 1, slug: 'x', password: 'secret' }]) {
      const response = await post('/api/clubs', body)
      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('invalid_request')
    }
    const extra = await post('/api/clubs', { name: 'A', slug: 'some-club', password: 'secret', admin: true })
    expect(extra.json().error).toBe('invalid_request')
    const junk = await app.inject({
      method: 'POST',
      url: '/api/clubs',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    })
    expect(junk.statusCode).toBe(400)
    expect(junk.json().error).toBe('invalid_request')
  })
})

describe('logging in', () => {
  it('returns a working token and the club name', async () => {
    await createClub(app, { name: 'Downtown Club', slug: 'downtown-club', password: 'secret' })
    const response = await post('/api/clubs/downtown-club/login', { password: 'secret' })
    expect(response.statusCode).toBe(200)
    const { token, name } = response.json()
    expect(name).toBe('Downtown Club')
    const check = await app.inject({ method: 'GET', url: '/api/session', headers: bearer(token) })
    expect(check.statusCode).toBe(404) // signed in, but no session yet: not 401
  })

  it('accepts the club URL in any case', async () => {
    await createClub(app, { slug: 'downtown-club' })
    const response = await post('/api/clubs/Downtown-Club/login', { password: 'secret' })
    expect(response.statusCode).toBe(200)
  })

  it('issues a fresh token every time', async () => {
    await createClub(app, { slug: 'downtown-club' })
    const a = (await post('/api/clubs/downtown-club/login', { password: 'secret' })).json().token
    const b = (await post('/api/clubs/downtown-club/login', { password: 'secret' })).json().token
    expect(a).not.toBe(b)
  })

  it('answers a wrong password and an unknown club identically', async () => {
    await createClub(app, { slug: 'downtown-club' })
    const wrong = await post('/api/clubs/downtown-club/login', { password: 'nope' })
    const unknown = await post('/api/clubs/no-such-club/login', { password: 'secret' })
    const malformed = await post('/api/clubs/NOT%20A%20SLUG/login', { password: 'secret' })
    for (const response of [wrong, unknown, malformed]) {
      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({ error: 'invalid_credentials', message: 'Wrong club URL or password.' })
    }
  })

  it('does the same hashing work for an unknown club, so timing does not reveal it', async () => {
    await createClub(app, { slug: 'downtown-club' })
    const time = async (slug: string) => {
      const start = performance.now()
      await post(`/api/clubs/${slug}/login`, { password: 'wrong-password' })
      return performance.now() - start
    }
    await time('downtown-club') // warm up
    const known = Math.min(await time('downtown-club'), await time('downtown-club'))
    const unknown = Math.min(await time('missing-club'), await time('missing-club'))
    // Skipping the hash would make the unknown club at least an order of magnitude faster.
    expect(unknown).toBeGreaterThan(known * 0.4)
  })
})

describe('logging out', () => {
  it('revokes the token', async () => {
    const { token } = await createClub(app)
    expect((await app.inject({ method: 'POST', url: '/api/logout', headers: bearer(token) })).statusCode).toBe(204)
    expect((await publish(app, token)).statusCode).toBe(401)
  })

  it('leaves the club’s other logins working', async () => {
    const { token, slug } = await createClub(app, { slug: 'downtown-club' })
    const other = (await post('/api/clubs/downtown-club/login', { password: 'secret' })).json().token
    await app.inject({ method: 'POST', url: '/api/logout', headers: bearer(token) })
    expect((await publish(app, other, 'Still here')).statusCode).toBe(200)
    expect(slug).toBe('downtown-club')
  })

  it('needs a valid token', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/logout' })).statusCode).toBe(401)
  })
})

describe('recovering a password', () => {
  it('sets a new password, revokes old logins and rotates the recovery code', async () => {
    const { token, recoveryCode } = await createClub(app, { slug: 'downtown-club', password: 'old-secret' })

    const reset = await post('/api/clubs/downtown-club/reset-password', { recoveryCode, newPassword: 'new-secret' })
    expect(reset.statusCode).toBe(200)
    const grant = reset.json()
    expect(grant.recoveryCode).not.toBe(recoveryCode)
    expect(grant.name).toBe('Test Club') // so the app can show the club after signing in

    expect((await post('/api/clubs/downtown-club/login', { password: 'old-secret' })).statusCode).toBe(401)
    expect((await post('/api/clubs/downtown-club/login', { password: 'new-secret' })).statusCode).toBe(200)
    expect((await publish(app, token)).statusCode).toBe(401) // the old login was revoked
    expect((await publish(app, grant.token)).statusCode).toBe(200) // the new one works

    const reused = await post('/api/clubs/downtown-club/reset-password', { recoveryCode, newPassword: 'third-secret' })
    expect(reused.statusCode).toBe(401)
    expect(reused.json().error).toBe('invalid_recovery_code')
  })

  it('accepts the code however it is typed', async () => {
    const { recoveryCode } = await createClub(app, { slug: 'downtown-club' })
    const typed = recoveryCode.toLowerCase().replaceAll('-', ' ')
    const reset = await post('/api/clubs/downtown-club/reset-password', { recoveryCode: typed, newPassword: 'new-secret' })
    expect(reset.statusCode).toBe(200)
  })

  it('refuses a wrong code and an unknown club with the same error', async () => {
    await createClub(app, { slug: 'downtown-club' })
    const wrong = await post('/api/clubs/downtown-club/reset-password', { recoveryCode: 'AAAA-AAAA-AAAA-AAAA-AAAA', newPassword: 'new-secret' })
    const unknown = await post('/api/clubs/no-such-club/reset-password', { recoveryCode: 'AAAA-AAAA-AAAA-AAAA-AAAA', newPassword: 'new-secret' })
    for (const response of [wrong, unknown]) {
      expect(response.statusCode).toBe(401)
      expect(response.json().error).toBe('invalid_recovery_code')
    }
  })

  it('keeps the code valid when the new password is rejected', async () => {
    const { recoveryCode } = await createClub(app, { slug: 'downtown-club' })
    const weak = await post('/api/clubs/downtown-club/reset-password', { recoveryCode, newPassword: 'abc' })
    expect(weak.json().error).toBe('weak_password')
    const retry = await post('/api/clubs/downtown-club/reset-password', { recoveryCode, newPassword: 'better-secret' })
    expect(retry.statusCode).toBe(200)
  })
})
