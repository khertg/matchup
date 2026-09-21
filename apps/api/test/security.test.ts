import { Writable } from 'node:stream'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import type { Db } from '../src/db'
import { LoginGuard } from '../src/services/loginGuard'
import {
  bearer,
  clearData,
  createClub,
  publish,
  startTestApp,
  startTestDb,
  testConfig,
  type ConfigOverrides,
} from './helpers'

let db: Db
const apps: FastifyInstance[] = []

beforeAll(async () => {
  db = await startTestDb()
})
afterAll(() => db.close())
beforeEach(() => clearData(db))
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

async function app(overrides: ConfigOverrides = {}, extra: Parameters<typeof startTestApp>[2] = {}) {
  const instance = await startTestApp(db, overrides, extra)
  apps.push(instance)
  return instance
}

const login = (a: FastifyInstance, slug: string, password: string, ip?: string) =>
  a.inject({ method: 'POST', url: `/api/clubs/${slug}/login`, payload: { password }, remoteAddress: ip })

describe('rate limits', () => {
  it('limits every route per address, with a Retry-After header', async () => {
    const a = await app({ rateLimit: { global: { max: 5, windowMs: 60_000 } } })
    const statuses: number[] = []
    for (let i = 0; i < 7; i++) {
      statuses.push((await a.inject({ method: 'GET', url: '/api/clubs/some-club/live', remoteAddress: '10.0.0.1' })).statusCode)
    }
    expect(statuses).toEqual([404, 404, 404, 404, 404, 429, 429])

    const limited = await a.inject({ method: 'GET', url: '/api/clubs/some-club/live', remoteAddress: '10.0.0.1' })
    expect(limited.json().error).toBe('rate_limited')
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0)
  })

  it('counts each address separately', async () => {
    const a = await app({ rateLimit: { global: { max: 2, windowMs: 60_000 } } })
    for (let i = 0; i < 3; i++) await a.inject({ method: 'GET', url: '/api/clubs/x-club/live', remoteAddress: '10.0.0.1' })
    const other = await a.inject({ method: 'GET', url: '/api/clubs/x-club/live', remoteAddress: '10.0.0.2' })
    expect(other.statusCode).toBe(404)
  })

  it('is much stricter for logging in', async () => {
    const a = await app({ rateLimit: { auth: { max: 3, windowMs: 60_000 } } })
    const codes: number[] = []
    for (let i = 0; i < 5; i++) codes.push((await login(a, 'some-club', 'x', '10.0.0.1')).statusCode)
    expect(codes).toEqual([401, 401, 401, 429, 429])
  })

  it('is much stricter for creating clubs, so one address cannot mass-register', async () => {
    const a = await app({ rateLimit: { auth: { max: 3, windowMs: 60_000 } } })
    const codes: number[] = []
    for (let i = 0; i < 5; i++) {
      const response = await a.inject({
        method: 'POST',
        url: '/api/clubs',
        payload: { name: 'A', slug: `spam-club-${i}`, password: 'secret' },
        remoteAddress: '10.0.0.1',
      })
      codes.push(response.statusCode)
    }
    expect(codes).toEqual([201, 201, 201, 429, 429])
  })

  it('is much stricter for password resets', async () => {
    const a = await app({ rateLimit: { auth: { max: 3, windowMs: 60_000 } } })
    const codes: number[] = []
    for (let i = 0; i < 5; i++) {
      const response = await a.inject({
        method: 'POST',
        url: '/api/clubs/some-club/reset-password',
        payload: { recoveryCode: 'AAAA-AAAA-AAAA-AAAA-AAAA', newPassword: 'new-secret' },
        remoteAddress: '10.0.0.1',
      })
      codes.push(response.statusCode)
    }
    expect(codes).toEqual([401, 401, 401, 429, 429])
  })

  it('never limits the health check', async () => {
    const a = await app({ rateLimit: { global: { max: 1, windowMs: 60_000 } } })
    for (let i = 0; i < 5; i++) {
      expect((await a.inject({ method: 'GET', url: '/api/health', remoteAddress: '10.0.0.1' })).statusCode).toBe(200)
    }
  })

  it('limits publishing separately from everything else', async () => {
    const a = await app({ rateLimit: { write: { max: 2, windowMs: 60_000 } } })
    const { token } = await createClub(a)
    const codes: number[] = []
    for (let i = 0; i < 4; i++) codes.push((await publish(a, token, 'x', '10.0.0.1')).statusCode)
    expect(codes).toEqual([200, 200, 429, 429])
  })
})

describe('login lockout', () => {
  const clock = { now: 1_000_000 }
  const guard = () =>
    new LoginGuard({ maxFailuresPerClubAndIp: 3, maxFailuresPerClub: 6, windowMs: 15 * 60_000 }, () => clock.now)

  beforeEach(() => {
    clock.now = 1_000_000
  })

  it('locks a club for one address after repeated failures, even for the right password', async () => {
    const a = await app({}, { guard: guard() })
    await createClub(a, { slug: 'downtown-club', password: 'secret' })
    for (let i = 0; i < 3; i++) expect((await login(a, 'downtown-club', 'wrong', '10.0.0.1')).statusCode).toBe(401)

    const locked = await login(a, 'downtown-club', 'secret', '10.0.0.1')
    expect(locked.statusCode).toBe(429)
    expect(locked.json().error).toBe('rate_limited')
    expect(Number(locked.headers['retry-after'])).toBe(15 * 60)

    // Someone else is not affected by this address's mistakes.
    expect((await login(a, 'downtown-club', 'secret', '10.0.0.2')).statusCode).toBe(200)
  })

  it('unlocks when the window has passed', async () => {
    const a = await app({}, { guard: guard() })
    await createClub(a, { slug: 'downtown-club', password: 'secret' })
    for (let i = 0; i < 3; i++) await login(a, 'downtown-club', 'wrong', '10.0.0.1')
    expect((await login(a, 'downtown-club', 'secret', '10.0.0.1')).statusCode).toBe(429)

    clock.now += 15 * 60_000 + 1
    expect((await login(a, 'downtown-club', 'secret', '10.0.0.1')).statusCode).toBe(200)
  })

  it('locks the club for everyone when guesses come from many addresses', async () => {
    const a = await app({}, { guard: guard() })
    await createClub(a, { slug: 'downtown-club', password: 'secret' })
    for (let i = 0; i < 6; i++) await login(a, 'downtown-club', 'wrong', `10.0.1.${i}`)
    expect((await login(a, 'downtown-club', 'secret', '10.9.9.9')).statusCode).toBe(429)
  })

  it('forgives earlier mistakes from an address after a correct login', async () => {
    const a = await app({}, { guard: guard() })
    await createClub(a, { slug: 'downtown-club', password: 'secret' })
    // Two slips then a success, twice. Without forgiveness the second round would pass
    // the per-address limit of three and lock this address out.
    for (let round = 0; round < 2; round++) {
      await login(a, 'downtown-club', 'wrong', '10.0.0.1')
      await login(a, 'downtown-club', 'wrong', '10.0.0.1')
      expect((await login(a, 'downtown-club', 'secret', '10.0.0.1')).statusCode).toBe(200)
    }
  })

  it('locks clubs that do not exist in exactly the same way, so lockouts reveal nothing', async () => {
    const a = await app({}, { guard: guard() })
    await createClub(a, { slug: 'real-club', password: 'secret' })
    const outcomes = async (slug: string) => {
      const codes: number[] = []
      for (let i = 0; i < 5; i++) codes.push((await login(a, slug, 'wrong', '10.0.0.1')).statusCode)
      return codes
    }
    expect(await outcomes('real-club')).toEqual([401, 401, 401, 429, 429])
    expect(await outcomes('imaginary-club')).toEqual([401, 401, 401, 429, 429])
  })

  it('protects password recovery the same way', async () => {
    const a = await app({}, { guard: guard() })
    await createClub(a, { slug: 'downtown-club' })
    const reset = (code: string) =>
      a.inject({
        method: 'POST',
        url: '/api/clubs/downtown-club/reset-password',
        payload: { recoveryCode: code, newPassword: 'new-secret' },
        remoteAddress: '10.0.0.1',
      })
    const codes: number[] = []
    for (let i = 0; i < 5; i++) codes.push((await reset('AAAA-AAAA-AAAA-AAAA-AAAA')).statusCode)
    expect(codes).toEqual([401, 401, 401, 429, 429])
  })
})

describe('what the server refuses to reveal or log', () => {
  it('logs no passwords, tokens, recovery codes or Authorization headers', async () => {
    const lines: string[] = []
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk))
        callback()
      },
    })
    const a = await buildApp({ db, config: testConfig({ logLevel: 'info' }), logStream: stream })
    apps.push(a)
    await a.ready()

    const { token, recoveryCode } = await createClub(a, { slug: 'downtown-club', password: 'my-very-secret-pw' })
    await login(a, 'downtown-club', 'another-wrong-password')
    await a.inject({
      method: 'POST',
      url: '/api/clubs/downtown-club/reset-password',
      payload: { recoveryCode: 'WRONG-CODE-1234', newPassword: 'brand-new-password' },
    })
    await publish(a, token)
    await a.inject({ method: 'GET', url: '/api/session', headers: bearer(token) })

    const log = lines.join('')
    expect(log.length).toBeGreaterThan(0) // logging is on, so the checks below mean something
    for (const secret of ['my-very-secret-pw', 'another-wrong-password', 'brand-new-password', 'WRONG-CODE-1234', token, recoveryCode]) {
      expect(log, secret).not.toContain(secret)
    }
    expect(log.toLowerCase()).not.toContain('authorization')
  })

  it('answers unexpected errors with a generic message and no internal detail', async () => {
    const broken = {
      ...db,
      query: () => {
        throw new Error('connection to postgres://admin:hunter2@db failed')
      },
    } as unknown as Db
    const a = await buildApp({ db: broken, config: testConfig() })
    apps.push(a)
    const response = await a.inject({ method: 'GET', url: '/api/health' })
    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ error: 'internal_error', message: 'Something went wrong on the server.' })
    expect(response.body).not.toMatch(/hunter2|postgres/)
  })

  it('answers unknown routes and methods with JSON, not framework pages', async () => {
    const a = await app()
    for (const request of [
      { method: 'GET' as const, url: '/api/nothing-here' },
      { method: 'GET' as const, url: '/' },
      { method: 'PATCH' as const, url: '/api/session' },
      { method: 'GET' as const, url: '/api/clubs' }, // there is deliberately no way to list clubs
    ]) {
      const response = await a.inject(request)
      expect(response.statusCode, request.url).toBe(404)
      expect(response.json().error).toBe('not_found')
    }
  })

  it('reports which build is running on the health check, without anything private', async () => {
    const a = await app()
    const response = await a.inject({ method: 'GET', url: '/api/health' })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.ok).toBe(true)
    expect(typeof body.version).toBe('string')
    expect(body.version.length).toBeGreaterThan(0)
    expect(typeof body.commit).toBe('string')
    expect(body.commit.length).toBeGreaterThan(0)
    expect(Object.keys(body).sort()).toEqual(['commit', 'ok', 'version'])
  })

  it('sets protective headers', async () => {
    const a = await app()
    const response = await a.inject({ method: 'GET', url: '/api/health' })
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['x-powered-by']).toBeUndefined()
  })

  it('refuses oversized bodies', async () => {
    const a = await app()
    const { token } = await createClub(a)
    const response = await a.inject({
      method: 'PUT',
      url: '/api/session',
      headers: bearer(token),
      payload: { public: {}, full: { junk: 'x'.repeat(600 * 1024) } },
    })
    expect(response.statusCode).toBe(413)
    expect(response.json().error).toBe('payload_too_large')
  })
})

describe('cross-origin access', () => {
  const ORIGIN = 'https://app.example.com'

  it('is off unless origins are allowed, so browsers keep to the same origin', async () => {
    const a = await app()
    const response = await a.inject({ method: 'GET', url: '/api/health', headers: { origin: ORIGIN } })
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('allows only the listed origins', async () => {
    const a = await app({ allowedOrigins: [ORIGIN] })
    const allowed = await a.inject({ method: 'GET', url: '/api/health', headers: { origin: ORIGIN } })
    expect(allowed.headers['access-control-allow-origin']).toBe(ORIGIN)

    const stranger = await a.inject({ method: 'GET', url: '/api/health', headers: { origin: 'https://evil.example' } })
    expect(stranger.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('answers preflight requests for the methods and headers the app uses', async () => {
    const a = await app({ allowedOrigins: [ORIGIN] })
    const response = await a.inject({
      method: 'OPTIONS',
      url: '/api/session',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'authorization,content-type',
      },
    })
    expect(response.statusCode).toBe(204)
    expect(response.headers['access-control-allow-methods']).toContain('PUT')
    expect(response.headers['access-control-allow-headers']).toContain('authorization')
  })
})
