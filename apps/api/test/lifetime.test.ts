import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../src/db'
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
const player = (name: string, games: number, wins: number) => ({ name, games, wins, losses: games - wins })

const upload = (token: string | null, batchId: string, players: unknown) =>
  app.inject({
    method: 'POST',
    url: '/api/lifetime',
    headers: token ? bearer(token) : {},
    payload: { batchId, players } as object,
  })
const board = async (slug: string) =>
  (await app.inject({ method: 'GET', url: `/api/clubs/${slug}/players` })).json().players as {
    name: string
    games: number
    wins: number
    losses: number
  }[]

describe('club leaderboard', () => {
  it('records totals and shows them publicly, best first', async () => {
    const { token, slug } = await createClub(app)
    const response = await upload(token, uuid(1), [player('Bob', 4, 1), player('Ann', 4, 3), player('Cy', 6, 3)])
    expect(response.statusCode).toBe(204)
    expect((await board(slug)).map((p) => `${p.name}:${p.wins}`)).toEqual(['Ann:3', 'Cy:3', 'Bob:1'])
    // Ann and Cy both have 3 wins; Ann's win rate is better.
  })

  it('applies each batch once, so retries after a dropped connection are safe', async () => {
    const { token, slug } = await createClub(app)
    for (let attempt = 0; attempt < 3; attempt++) await upload(token, uuid(1), [player('Ann', 4, 3)])
    expect((await board(slug))[0]).toMatchObject({ name: 'Ann', games: 4, wins: 3, losses: 1 })
  })

  it('applies a batch once even when the retry arrives at the same time', async () => {
    const { token, slug } = await createClub(app)
    await Promise.all([1, 2, 3].map(() => upload(token, uuid(9), [player('Ann', 4, 3)])))
    expect((await board(slug))[0].games).toBe(4)
  })

  it('adds new batches on top and merges names ignoring case and spaces', async () => {
    const { token, slug } = await createClub(app)
    await upload(token, uuid(1), [player('Ann', 4, 3)])
    await upload(token, uuid(2), [player('  ANN ', 2, 2)])
    const rows = await board(slug)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({ name: 'ANN', games: 6, wins: 5, losses: 1 })
  })

  it('accepts a batch with no players', async () => {
    const { token } = await createClub(app)
    expect((await upload(token, uuid(1), [])).statusCode).toBe(204)
  })

  it('rejects invalid players', async () => {
    const { token } = await createClub(app)
    const bad = [
      [{ name: 'Ann', games: -1, wins: 0, losses: 0 }],
      [{ name: 'Ann', games: 1, wins: 2.5, losses: 0 }],
      [{ name: 'Ann', games: 1_000_000, wins: 0, losses: 0 }],
      [{ name: '   ', games: 1, wins: 1, losses: 0 }],
      [{ name: 'n'.repeat(81), games: 1, wins: 1, losses: 0 }],
      Array.from({ length: 501 }, (_, i) => player(`P${i}`, 1, 1)),
    ]
    for (const players of bad) {
      const response = await upload(token, uuid(1), players)
      expect(response.statusCode).toBe(400)
      expect(['invalid_players', 'invalid_request']).toContain(response.json().error)
    }
    expect((await upload(token, 'not-a-uuid', [])).json().error).toBe('invalid_players')
    // Nothing from the rejected batches was recorded, and their ids were not used up.
    expect((await db.query('select 1 from lifetime_batches')).rowCount).toBe(0)
    expect((await upload(token, uuid(1), [player('Ann', 1, 1)])).statusCode).toBe(204)
  })

  it('rejects wrongly typed or unexpected fields', async () => {
    const { token } = await createClub(app)
    for (const players of [[{ name: 'Ann', games: '4', wins: 3, losses: 1 }], [{ name: 'Ann', games: 4 }], 'nope']) {
      expect((await upload(token, uuid(1), players)).json().error).toBe('invalid_request')
    }
    const extra = await app.inject({
      method: 'POST',
      url: '/api/lifetime',
      headers: bearer(token),
      payload: { batchId: uuid(1), players: [], admin: true },
    })
    expect(extra.json().error).toBe('invalid_request')
  })

  it('needs a valid staff token', async () => {
    expect((await upload(null, uuid(1), [])).statusCode).toBe(401)
    expect((await upload('f'.repeat(64), uuid(1), [])).statusCode).toBe(401)
  })

  it('keeps each club’s leaderboard separate', async () => {
    const a = await createClub(app, { slug: 'club-a' })
    const b = await createClub(app, { slug: 'club-b' })
    await upload(a.token, uuid(1), [player('Ann', 4, 3)])
    await upload(b.token, uuid(1), [player('Bob', 2, 1)]) // the same batch id in another club is a different batch
    expect((await board('club-a')).map((p) => p.name)).toEqual(['Ann'])
    expect((await board('club-b')).map((p) => p.name)).toEqual(['Bob'])
  })

  it('is empty for a club with no results or no such club, and 404 for an invalid URL', async () => {
    await createClub(app, { slug: 'quiet-club' })
    expect(await board('quiet-club')).toEqual([])
    expect(await board('no-such-club')).toEqual([])
    expect((await app.inject({ method: 'GET', url: '/api/clubs/NOT%20VALID/players' })).statusCode).toBe(404)
  })
})
