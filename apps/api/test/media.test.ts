import { MEDIA_LIMITS } from '@q2dink/shared'
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

/** Real image bytes: only the headers matter, the server looks at the first bytes. */
const png = (extra = 32) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(extra, 1)])
const jpeg = (extra = 32) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(extra, 2)])
const webp = (extra = 32) =>
  Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.alloc(4, 0), Buffer.from('WEBP', 'latin1'), Buffer.alloc(extra, 3)])
const b64 = (bytes: Buffer) => bytes.toString('base64')

const putLogo = (token: string | null, payload: unknown) =>
  app.inject({ method: 'PUT', url: '/api/logo', headers: token ? bearer(token) : {}, payload: payload as object })
const putAvatar = (token: string | null, key: string, payload: unknown) =>
  app.inject({
    method: 'PUT',
    url: `/api/avatars/${encodeURIComponent(key)}`,
    headers: token ? bearer(token) : {},
    payload: payload as object,
  })
const photo = (bytes: Buffer) => ({ kind: 'photo', photo: { data: b64(bytes) } })

describe('club logo', () => {
  it('needs a login to change', async () => {
    const { slug } = await createClub(app)
    for (const token of [null, 'nope', '0'.repeat(64)]) {
      expect((await putLogo(token, { logo: { data: b64(png()) } })).statusCode).toBe(401)
      const del = await app.inject({ method: 'DELETE', url: '/api/logo', headers: token ? bearer(token) : {} })
      expect(del.statusCode).toBe(401)
    }
    expect((await app.inject({ method: 'GET', url: `/api/clubs/${slug}/logo` })).statusCode).toBe(404)
  })

  it('is saved, shown to anyone with its own image type, replaced and removed', async () => {
    const { token, slug } = await createClub(app)
    expect((await putLogo(token, { logo: { data: b64(png()) } })).statusCode).toBe(204)
    let response = await app.inject({ method: 'GET', url: `/api/clubs/${slug}/logo` })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('image/png')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(Buffer.from(response.rawPayload).equals(png())).toBe(true)

    // A new logo replaces it, and its type follows the bytes.
    expect((await putLogo(token, { logo: { data: b64(jpeg()) } })).statusCode).toBe(204)
    response = await app.inject({ method: 'GET', url: `/api/clubs/${slug}/logo` })
    expect(response.headers['content-type']).toBe('image/jpeg')

    expect((await app.inject({ method: 'DELETE', url: '/api/logo', headers: bearer(token) })).statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url: `/api/clubs/${slug}/logo` })).statusCode).toBe(404)
  })

  it('answers 304 to a matching ETag, and caches hard when the URL carries a version', async () => {
    const { token, slug } = await createClub(app)
    await putLogo(token, { logo: { data: b64(webp()) } })
    const first = await app.inject({ method: 'GET', url: `/api/clubs/${slug}/logo` })
    expect(first.headers['cache-control']).toBe('no-cache')
    const again = await app.inject({ method: 'GET', url: `/api/clubs/${slug}/logo`, headers: { 'if-none-match': String(first.headers.etag) } })
    expect(again.statusCode).toBe(304)
    const versioned = await app.inject({ method: 'GET', url: `/api/clubs/${slug}/logo?v=123` })
    expect(versioned.headers['cache-control']).toContain('immutable')
  })

  it('accepts PNG, JPEG and WebP by their bytes, and nothing else', async () => {
    const { token } = await createClub(app)
    for (const good of [png(), jpeg(), webp()]) expect((await putLogo(token, { logo: { data: b64(good) } })).statusCode).toBe(204)
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>')
    const bad = [svg, Buffer.from('<html><script>1</script></html>'), Buffer.from('GIF89a......'), Buffer.alloc(40, 0)]
    for (const file of bad) {
      const response = await putLogo(token, { logo: { data: b64(file) } })
      expect(response.statusCode, file.toString('latin1').slice(0, 20)).toBe(400)
      expect(response.json().error).toBe('invalid_request')
    }
  })

  it('refuses text that is not base64, an empty image, and one that is too large', async () => {
    const { token } = await createClub(app)
    for (const data of ['not base64!!', '', 'abc', '====', 42]) {
      expect((await putLogo(token, { logo: { data } })).statusCode, String(data)).toBe(400)
    }
    const huge = png(MEDIA_LIMITS.logoBytes + 10)
    const response = await putLogo(token, { logo: { data: b64(huge) } })
    expect(response.statusCode).toBe(413)
    expect(response.json().error).toBe('payload_too_large')
    expect((await putLogo(token, { logo: { data: b64(png(MEDIA_LIMITS.logoBytes - 16)) } })).statusCode).toBe(204)
    expect((await putLogo(token, {})).statusCode).toBe(400)
    expect((await putLogo(token, { logo: { data: b64(png()) }, extra: 1 })).statusCode).toBe(400)
  })

  it('belongs to its club only, and goes when the club goes', async () => {
    const a = await createClub(app)
    const b = await createClub(app)
    await putLogo(a.token, { logo: { data: b64(png()) } })
    expect((await app.inject({ method: 'GET', url: `/api/clubs/${b.slug}/logo` })).statusCode).toBe(404)
    // Someone else's login cannot remove it.
    await app.inject({ method: 'DELETE', url: '/api/logo', headers: bearer(b.token) })
    expect((await app.inject({ method: 'GET', url: `/api/clubs/${a.slug}/logo` })).statusCode).toBe(200)
    await db.query('delete from clubs where slug = $1', [a.slug])
    const { rows } = await db.query('select 1 from club_logos')
    expect(rows).toHaveLength(0)
  })

  it('looks the same for an unknown club, a badly formed name, and a club with no logo', async () => {
    const { slug } = await createClub(app)
    const answers = await Promise.all(
      [slug, 'no-such-club', 'NOT VALID!'].map((s) => app.inject({ method: 'GET', url: `/api/clubs/${encodeURIComponent(s)}/logo` })),
    )
    for (const r of answers) {
      expect(r.statusCode).toBe(404)
      expect(r.json()).toEqual(answers[0].json())
    }
  })
})

describe('player avatars', () => {
  it('needs a login to change', async () => {
    for (const token of [null, 'nope']) {
      expect((await putAvatar(token, 'ann', { kind: 'initials', color: '#336699' })).statusCode).toBe(401)
      const del = await app.inject({ method: 'DELETE', url: '/api/avatars/ann', headers: token ? bearer(token) : {} })
      expect(del.statusCode).toBe(401)
    }
  })

  it('keeps emoji, initials and photo avatars, listed by lower-case name', async () => {
    const { token, slug } = await createClub(app)
    expect((await putAvatar(token, 'ann', { kind: 'emoji', emoji: '🎾', color: '#336699' })).statusCode).toBe(204)
    expect((await putAvatar(token, 'bob', { kind: 'initials', color: '#aa5500' })).statusCode).toBe(204)
    expect((await putAvatar(token, 'cy lee', photo(webp()))).statusCode).toBe(204)

    const response = await app.inject({ method: 'GET', url: `/api/clubs/${slug}/avatars` })
    expect(response.statusCode).toBe(200)
    const { avatars } = response.json()
    expect(Object.keys(avatars).sort()).toEqual(['ann', 'bob', 'cy lee'])
    expect(avatars.ann).toMatchObject({ kind: 'emoji', emoji: '🎾', color: '#336699' })
    expect(avatars.bob).toMatchObject({ kind: 'initials', color: '#aa5500' })
    expect(avatars['cy lee']).toMatchObject({ kind: 'photo' })
    // The photo itself is not in the list.
    expect(JSON.stringify(response.json())).not.toContain(b64(webp()))
    for (const a of Object.values(avatars) as { v: number }[]) expect(Number.isFinite(a.v)).toBe(true)
  })

  it('serves a photo by name, and answers 404 for anything else', async () => {
    const { token, slug } = await createClub(app)
    await putAvatar(token, 'cy lee', photo(jpeg()))
    await putAvatar(token, 'ann', { kind: 'emoji', emoji: '🎾' })
    const ok = await app.inject({ method: 'GET', url: `/api/clubs/${slug}/avatars/${encodeURIComponent('cy lee')}/photo` })
    expect(ok.statusCode).toBe(200)
    expect(ok.headers['content-type']).toBe('image/jpeg')
    expect(Buffer.from(ok.rawPayload).equals(jpeg())).toBe(true)
    for (const key of ['ann', 'nobody', 'Cy%20Lee', '']) {
      const r = await app.inject({ method: 'GET', url: `/api/clubs/${slug}/avatars/${key}/photo` })
      expect(r.statusCode, key).toBe(404)
    }
  })

  it('tells viewers the logo version, and the list validator changes with it', async () => {
    const { token, slug } = await createClub(app)
    const before = await app.inject({ method: 'GET', url: `/api/clubs/${slug}/avatars` })
    expect(before.json().logo).toBeNull()
    await putLogo(token, { logo: { data: b64(png()) } })
    const after = await app.inject({ method: 'GET', url: `/api/clubs/${slug}/avatars`, headers: { 'if-none-match': String(before.headers.etag) } })
    expect(after.statusCode).toBe(200)
    expect(Number.isFinite(after.json().logo.v)).toBe(true)
  })

  it('replaces a player’s avatar, and changes the list validator when anything changes', async () => {
    const { token, slug } = await createClub(app)
    await putAvatar(token, 'ann', { kind: 'emoji', emoji: '🎾' })
    const first = await app.inject({ method: 'GET', url: `/api/clubs/${slug}/avatars` })
    const same = await app.inject({ method: 'GET', url: `/api/clubs/${slug}/avatars`, headers: { 'if-none-match': String(first.headers.etag) } })
    expect(same.statusCode).toBe(304)

    await putAvatar(token, 'ann', { kind: 'emoji', emoji: '🏓' })
    const changed = await app.inject({ method: 'GET', url: `/api/clubs/${slug}/avatars`, headers: { 'if-none-match': String(first.headers.etag) } })
    expect(changed.statusCode).toBe(200)
    expect(changed.json().avatars.ann.emoji).toBe('🏓')
    expect(Object.keys(changed.json().avatars)).toHaveLength(1)

    // Photo to emoji drops the photo.
    await putAvatar(token, 'ann', photo(png()))
    await putAvatar(token, 'ann', { kind: 'initials', color: '#123456' })
    expect((await app.inject({ method: 'GET', url: `/api/clubs/${slug}/avatars/ann/photo` })).statusCode).toBe(404)
  })

  it('deletes one avatar, or every photo while keeping emoji and initials', async () => {
    const { token, slug } = await createClub(app)
    await putAvatar(token, 'ann', photo(png()))
    await putAvatar(token, 'bob', photo(jpeg()))
    await putAvatar(token, 'cy', { kind: 'emoji', emoji: '🎾' })
    const index = async () => Object.keys((await app.inject({ method: 'GET', url: `/api/clubs/${slug}/avatars` })).json().avatars).sort()

    expect((await app.inject({ method: 'DELETE', url: '/api/avatars/ann', headers: bearer(token) })).statusCode).toBe(204)
    expect(await index()).toEqual(['bob', 'cy'])
    expect((await app.inject({ method: 'DELETE', url: '/api/avatars/ann', headers: bearer(token) })).statusCode).toBe(204) // already gone

    expect((await app.inject({ method: 'DELETE', url: '/api/avatars', headers: bearer(token) })).statusCode).toBe(204)
    expect(await index()).toEqual(['cy'])
  })

  it('refuses bad emoji, colours and shapes', async () => {
    const { token } = await createClub(app)
    const bad: unknown[] = [
      { kind: 'emoji' },
      { kind: 'emoji', emoji: 'A' },
      { kind: 'emoji', emoji: '<b>' },
      { kind: 'emoji', emoji: '🎾🎾🎾🎾🎾🎾🎾🎾🎾' },
      { kind: 'emoji', emoji: '🎾', color: 'red' },
      { kind: 'emoji', emoji: '🎾', color: '#GGGGGG' },
      { kind: 'emoji', emoji: '🎾', photo: { data: b64(png()) } },
      { kind: 'initials' },
      { kind: 'initials', color: '#12345' },
      { kind: 'initials', color: '#123456', emoji: '🎾' },
      { kind: 'photo' },
      { kind: 'photo', photo: { data: b64(png()) }, color: '#123456' },
      { kind: 'sticker' },
      { kind: 'initials', color: '#123456', extra: true },
    ]
    for (const body of bad) {
      const response = await putAvatar(token, 'ann', body)
      expect(response.statusCode, JSON.stringify(body).slice(0, 60)).toBe(400)
    }
    // Real emoji, with modifiers and joiners, are fine.
    for (const emoji of ['🎾', '👍🏽', '👩‍👩‍👧', '🇵🇭', '❤️']) {
      expect((await putAvatar(token, 'ann', { kind: 'emoji', emoji })).statusCode, emoji).toBe(204)
    }
  })

  it('refuses names that are not the normalised form', async () => {
    const { token } = await createClub(app)
    for (const key of ['Ann', ' ann', 'ann ', 'x'.repeat(81)]) {
      const response = await putAvatar(token, key, { kind: 'initials', color: '#123456' })
      expect(response.statusCode, key).toBe(400)
    }
    expect((await putAvatar(token, 'x'.repeat(80), { kind: 'initials', color: '#123456' })).statusCode).toBe(204)
  })

  it('refuses a photo that is not an image, or is too large', async () => {
    const { token } = await createClub(app)
    expect((await putAvatar(token, 'ann', photo(Buffer.from('<svg onload=alert(1)>')))).statusCode).toBe(400)
    const tooBig = await putAvatar(token, 'ann', photo(png(MEDIA_LIMITS.avatarPhotoBytes + 10)))
    expect(tooBig.statusCode).toBe(413)
    expect((await putAvatar(token, 'ann', photo(png(MEDIA_LIMITS.avatarPhotoBytes - 16)))).statusCode).toBe(204)
  })

  it('keeps at most 500 per club, but still lets an existing player’s avatar change', async () => {
    const { token } = await createClub(app)
    const club = (await db.query<{ slug: string }>('select slug from clubs')).rows[0].slug
    await db.query(
      `insert into club_avatars (club_slug, name_key, kind, color)
       select $1, 'p' || n, 'initials', '#123456' from generate_series(1, $2::int) as n`,
      [club, MEDIA_LIMITS.avatars],
    )
    const full = await putAvatar(token, 'one-more', { kind: 'initials', color: '#123456' })
    expect(full.statusCode).toBe(413)
    expect((await putAvatar(token, 'p7', { kind: 'emoji', emoji: '🎾' })).statusCode).toBe(204)
  })

  it('never shows one club another club’s avatars, and goes when the club goes', async () => {
    const a = await createClub(app)
    const b = await createClub(app)
    await putAvatar(a.token, 'ann', { kind: 'emoji', emoji: '🎾' })
    expect((await app.inject({ method: 'GET', url: `/api/clubs/${b.slug}/avatars` })).json().avatars).toEqual({})
    // Another club deleting the same name does nothing here.
    await app.inject({ method: 'DELETE', url: '/api/avatars/ann', headers: bearer(b.token) })
    expect(Object.keys((await app.inject({ method: 'GET', url: `/api/clubs/${a.slug}/avatars` })).json().avatars)).toEqual(['ann'])
    await putAvatar(b.token, 'ann', { kind: 'initials', color: '#123456' }) // the same name can exist in both
    await db.query('delete from clubs where slug = $1', [a.slug])
    const { rows } = await db.query('select club_slug from club_avatars')
    expect(rows).toEqual([{ club_slug: b.slug }])
  })

  it('shows an unknown club as having no avatars, without revealing anything', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/clubs/no-such-club/avatars' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ avatars: {}, logo: null })
    expect((await app.inject({ method: 'GET', url: '/api/clubs/NOT%20VALID/avatars' })).statusCode).toBe(404)
  })
})
