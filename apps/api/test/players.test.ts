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

const upload = (token: string, n: number, players: unknown) =>
  app.inject({ method: 'POST', url: '/api/lifetime', headers: bearer(token), payload: { batchId: uuid(n), players } as object })
const rename = (token: string | null, payload: unknown) =>
  app.inject({
    method: 'POST',
    url: '/api/players/rename',
    headers: token ? bearer(token) : {},
    payload: payload as object,
  })
const board = async (slug: string) =>
  (await app.inject({ method: 'GET', url: `/api/clubs/${slug}/players` })).json().players as {
    name: string
    games: number
    wins: number
    losses: number
  }[]
const emoji = (token: string, key: string, value: string) =>
  app.inject({
    method: 'PUT',
    url: `/api/avatars/${encodeURIComponent(key)}`,
    headers: bearer(token),
    payload: { kind: 'emoji', emoji: value } as object,
  })
const avatars = async (slug: string) =>
  (await app.inject({ method: 'GET', url: `/api/clubs/${slug}/avatars` })).json().avatars as Record<string, { emoji?: string }>

describe('renaming a player', () => {
  it('needs a staff login', async () => {
    for (const token of [null, 'nope', '0'.repeat(64)]) {
      expect((await rename(token, { from: 'Ann', to: 'Anne' })).statusCode).toBe(401)
    }
  })

  it('moves the leaderboard totals to the new name', async () => {
    const { token, slug } = await createClub(app)
    await upload(token, 1, [player('Ann', 4, 3), player('Bob', 2, 1)])
    expect((await rename(token, { from: 'Ann', to: 'Anne' })).statusCode).toBe(204)
    expect(await board(slug)).toEqual([
      { name: 'Anne', games: 4, wins: 3, losses: 1 },
      { name: 'Bob', games: 2, wins: 1, losses: 1 },
    ])
  })

  it("matches the old name ignoring case and spaces, and keeps the new name as typed", async () => {
    const { token, slug } = await createClub(app)
    await upload(token, 1, [player('Ann Lee', 4, 3)])
    await rename(token, { from: '  ann LEE ', to: '  Anne Lee  ' })
    expect((await board(slug)).map((p) => p.name)).toEqual(['Anne Lee'])
  })

  it('moves the shared avatar too', async () => {
    const { token, slug } = await createClub(app)
    await emoji(token, 'ann', '🎾')
    await rename(token, { from: 'Ann', to: 'Anne' })
    const shown = await avatars(slug)
    expect(shown.anne?.emoji).toBe('🎾')
    expect(shown.ann).toBeUndefined()
  })

  it('adds the totals together when the new name already has some', async () => {
    const { token, slug } = await createClub(app)
    await upload(token, 1, [player('Ann', 4, 3), player('Anne', 6, 2)])
    await rename(token, { from: 'Ann', to: 'Anne' })
    expect(await board(slug)).toEqual([{ name: 'Anne', games: 10, wins: 5, losses: 5 }])
  })

  it('keeps the new name\'s avatar when both names had one', async () => {
    const { token, slug } = await createClub(app)
    await emoji(token, 'ann', '🎾')
    await emoji(token, 'anne', '🔥')
    await rename(token, { from: 'Ann', to: 'Anne' })
    const shown = await avatars(slug)
    expect(shown.anne?.emoji).toBe('🔥')
    expect(shown.ann).toBeUndefined()
  })

  it('only changes how the name is shown when just the capitalisation changes', async () => {
    const { token, slug } = await createClub(app)
    await upload(token, 1, [player('ann', 4, 3)])
    await emoji(token, 'ann', '🎾')
    await rename(token, { from: 'ann', to: 'Ann' })
    expect(await board(slug)).toEqual([{ name: 'Ann', games: 4, wins: 3, losses: 1 }])
    expect((await avatars(slug)).ann?.emoji).toBe('🎾')
  })

  it('is a successful no-op for a name the club has nothing under, so a late or repeated request is harmless', async () => {
    const { token, slug } = await createClub(app)
    await upload(token, 1, [player('Ann', 4, 3)])
    expect((await rename(token, { from: 'Nobody', to: 'Someone' })).statusCode).toBe(204)
    await rename(token, { from: 'Ann', to: 'Anne' })
    expect((await rename(token, { from: 'Ann', to: 'Anne' })).statusCode).toBe(204) // sent twice
    expect(await board(slug)).toEqual([{ name: 'Anne', games: 4, wins: 3, losses: 1 }])
  })

  it('can be undone by renaming back', async () => {
    const { token, slug } = await createClub(app)
    await upload(token, 1, [player('Ann', 4, 3)])
    await rename(token, { from: 'Ann', to: 'Anne' })
    await rename(token, { from: 'Anne', to: 'Ann' })
    expect(await board(slug)).toEqual([{ name: 'Ann', games: 4, wins: 3, losses: 1 }])
  })

  it("never touches another club's rows", async () => {
    const one = await createClub(app, { slug: 'first-club' })
    const two = await createClub(app, { slug: 'second-club' })
    await upload(one.token, 1, [player('Ann', 4, 3)])
    await upload(two.token, 2, [player('Ann', 8, 5)])
    await emoji(two.token, 'ann', '🎾')
    await rename(one.token, { from: 'Ann', to: 'Anne' })
    expect(await board('second-club')).toEqual([{ name: 'Ann', games: 8, wins: 5, losses: 3 }])
    expect((await avatars('second-club')).ann?.emoji).toBe('🎾')
    expect(await board('first-club')).toEqual([{ name: 'Anne', games: 4, wins: 3, losses: 1 }])
  })

  it('refuses empty, oversized and malformed requests', async () => {
    const { token } = await createClub(app)
    for (const body of [
      { from: '', to: 'Anne' },
      { from: 'Ann', to: '   ' },
      { from: 'Ann', to: 'x'.repeat(81) },
      { from: 'x'.repeat(81), to: 'Anne' },
      { from: 'Ann' },
      { from: 'Ann', to: 'Anne', extra: true },
      { from: 1, to: 'Anne' },
    ]) {
      expect((await rename(token, body)).statusCode, JSON.stringify(body).slice(0, 60)).toBe(400)
    }
  })
})
