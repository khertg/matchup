import { ERROR_CODES } from '@matchup/shared'
import { describe, expect, it, vi } from 'vitest'
import { CloudError, toCloudError } from './api'
import { createHttpApi } from './httpApi'

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
  })

function setup(...replies: (Response | Error)[]) {
  const fetchMock = vi.fn<typeof fetch>()
  for (const reply of replies) {
    if (reply instanceof Error) fetchMock.mockRejectedValueOnce(reply)
    else fetchMock.mockResolvedValueOnce(reply)
  }
  const api = createHttpApi('/api', { fetch: fetchMock })
  const call = (index = 0) => {
    const [url, init] = fetchMock.mock.calls[index]
    return {
      url: String(url),
      method: init?.method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    }
  }
  return { api, call, fetchMock }
}

describe('requests', () => {
  it('logs in with a JSON body and no credentials header', async () => {
    const { api, call } = setup(json(200, { token: 't', name: 'Downtown' }))
    expect(await api.login('downtown', 'secret')).toEqual({ token: 't', name: 'Downtown' })
    expect(call()).toEqual({
      url: '/api/clubs/downtown/login',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { password: 'secret' },
    })
  })

  it('creates a club and returns the one-time recovery code', async () => {
    const { api, call } = setup(json(201, { token: 't', recoveryCode: 'AAAA-BBBB-CCCC-DDDD-EEEE' }))
    const grant = await api.createClub('Downtown', 'downtown', 'secret')
    expect(grant.recoveryCode).toBe('AAAA-BBBB-CCCC-DDDD-EEEE')
    expect(call().body).toEqual({ name: 'Downtown', slug: 'downtown', password: 'secret' })
    expect(call().url).toBe('/api/clubs')
  })

  it('resets a password with the recovery code', async () => {
    const { api, call } = setup(json(200, { token: 't', recoveryCode: 'NEW', name: 'Downtown' }))
    expect((await api.resetPassword('downtown', 'OLD', 'new-secret')).name).toBe('Downtown')
    expect(call()).toMatchObject({
      url: '/api/clubs/downtown/reset-password',
      method: 'POST',
      body: { recoveryCode: 'OLD', newPassword: 'new-secret' },
    })
  })

  it('sends the staff token as a bearer header on staff routes', async () => {
    const { api, call } = setup(json(200, { updatedAt: 'x' }), new Response(null, { status: 204 }), new Response(null, { status: 204 }))
    const snapshot = { schemaVersion: 1 } as never
    const backup = { schemaVersion: 1 } as never
    await api.publish('tok', snapshot, backup)
    await api.clear('tok')
    await api.logout('tok')

    expect(call(0)).toMatchObject({ url: '/api/session', method: 'PUT', body: { public: snapshot, full: backup } })
    expect(call(0).headers.authorization).toBe('Bearer tok')
    expect(call(1)).toMatchObject({ url: '/api/session', method: 'DELETE' })
    expect(call(1).headers).toEqual({ authorization: 'Bearer tok' }) // no body, so no content-type
    expect(call(2)).toMatchObject({ url: '/api/logout', method: 'POST' })
  })

  it('uploads leaderboard totals with the batch id', async () => {
    const { api, call } = setup(new Response(null, { status: 204 }))
    const players = [{ name: 'Ann', games: 2, wins: 1, losses: 1 }]
    await api.recordLifetime('tok', 'batch-1', players)
    expect(call()).toMatchObject({ url: '/api/lifetime', method: 'POST', body: { batchId: 'batch-1', players } })
  })

  it('reads public data without credentials', async () => {
    const { api, call } = setup(json(200, { state: { x: 1 }, updatedAt: 't' }), json(200, { players: [{ name: 'Ann', games: 1, wins: 1, losses: 0 }] }))
    expect(await api.fetchLive('downtown')).toEqual({ state: { x: 1 }, updatedAt: 't' })
    expect(await api.fetchClubPlayers('downtown')).toEqual([{ name: 'Ann', games: 1, wins: 1, losses: 0 }])
    expect(call(0)).toMatchObject({ url: '/api/clubs/downtown/live', method: 'GET' })
    expect(call(0).headers.authorization).toBeUndefined()
    expect(call(1).url).toBe('/api/clubs/downtown/players')
  })

  it('treats "not found" as an empty result for the live board and the private backup', async () => {
    const { api } = setup(json(404, { error: 'not_found', message: 'Not found.' }), json(404, { error: 'not_found', message: 'Not found.' }))
    expect(await api.fetchLive('nobody')).toBeNull()
    expect(await api.fetchFullSession('tok')).toBeNull()
  })

  it('returns the private backup when there is one', async () => {
    const { api } = setup(json(200, { location: 'Club' }))
    expect(await api.fetchFullSession('tok')).toEqual({ location: 'Club' })
  })

  it('URL-encodes club names and tolerates a trailing slash on the base URL', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json(404, { error: 'not_found', message: '' }))
    const api = createHttpApi('https://example.com/api/', { fetch: fetchMock })
    await api.fetchLive('a b/c')
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://example.com/api/clubs/a%20b%2Fc/live')
  })
})

describe('errors', () => {
  it('maps every error code the server can send to a friendly message', async () => {
    for (const code of ERROR_CODES) {
      const { api } = setup(json(400, { error: code, message: 'server wording' }))
      const error = await api.login('a', 'b').catch((e) => e)
      expect(error, code).toBeInstanceOf(CloudError)
      expect(error.code).toBe(code)
      expect(error.message).not.toBe('server wording')
      expect(error.message.length).toBeGreaterThan(5)
    }
  })

  it('keeps specific, useful wording for the errors people actually hit', async () => {
    const cases: [string, RegExp][] = [
      ['invalid_credentials', /Wrong club URL or password/],
      ['club_slug_taken', /already taken/],
      ['rate_limited', /wait/i],
      ['invalid_token', /expired/],
    ]
    for (const [code, pattern] of cases) {
      const { api } = setup(json(400, { error: code }))
      await expect(api.login('a', 'b')).rejects.toThrow(pattern)
    }
  })

  it('treats a dropped connection as a network problem', async () => {
    const { api } = setup(new TypeError('Failed to fetch'))
    await expect(api.login('a', 'b')).rejects.toMatchObject({ code: 'network' })
  })

  it('treats a proxy error while the API restarts as a network problem', async () => {
    for (const status of [502, 503, 504]) {
      const { api } = setup(new Response('<html>Bad Gateway</html>', { status }))
      await expect(api.fetchLive('a')).rejects.toMatchObject({ code: 'network' })
    }
  })

  it('keeps unknown server messages, and copes with a non-JSON error page', async () => {
    const { api } = setup(json(418, { error: 'something_new', message: 'I am a teapot' }))
    await expect(api.login('a', 'b')).rejects.toMatchObject({ code: 'unknown', message: 'I am a teapot' })

    const { api: api2 } = setup(new Response('oops', { status: 500 }))
    await expect(api2.login('a', 'b')).rejects.toMatchObject({ code: 'unknown', message: 'Request failed (500)' })
  })

  it('normalises anything thrown into a CloudError', () => {
    const original = new CloudError('invalid_club')
    expect(toCloudError(original)).toBe(original)
    expect(toCloudError(new Error('boom'))).toMatchObject({ code: 'unknown', message: 'boom' })
    expect(toCloudError('text')).toMatchObject({ code: 'unknown', message: 'text' })
  })
})

describe('the live stream', () => {
  class FakeEventSource {
    static last: FakeEventSource
    readonly url: string
    closed = false
    private readonly handlers = new Map<string, ((event: MessageEvent) => void)[]>()
    constructor(url: string) {
      this.url = url
      FakeEventSource.last = this
    }
    addEventListener(type: string, handler: (event: MessageEvent) => void) {
      this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler])
    }
    close() {
      this.closed = true
    }
    emit(type: string, data = '{}') {
      for (const handler of this.handlers.get(type) ?? []) handler({ data } as MessageEvent)
    }
  }
  const stream = () =>
    createHttpApi('/api', { EventSource: FakeEventSource as unknown as typeof EventSource })

  it('connects to the club’s stream', () => {
    stream().subscribeLive('downtown', () => undefined)
    expect(FakeEventSource.last.url).toBe('/api/clubs/downtown/live/stream')
  })

  it('passes each pushed board and each end of session to the listener', () => {
    const onChange = vi.fn()
    stream().subscribeLive('downtown', onChange)
    FakeEventSource.last.emit('update', JSON.stringify({ state: { a: 1 }, updatedAt: 't1' }))
    FakeEventSource.last.emit('cleared')
    expect(onChange).toHaveBeenNthCalledWith(1, { state: { a: 1 }, updatedAt: 't1' })
    expect(onChange).toHaveBeenNthCalledWith(2, null)
  })

  it('ignores a garbled event instead of crashing', () => {
    const onChange = vi.fn()
    stream().subscribeLive('downtown', onChange)
    expect(() => FakeEventSource.last.emit('update', '{not json')).not.toThrow()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('closes the connection when unsubscribed', () => {
    const stop = stream().subscribeLive('downtown', () => undefined)
    stop()
    expect(FakeEventSource.last.closed).toBe(true)
  })

  it('does nothing where EventSource does not exist, leaving polling to cover it', () => {
    const api = createHttpApi('/api', { EventSource: undefined })
    // jsdom-free node has no EventSource global, so this is exactly the "unsupported" case.
    if (typeof EventSource === 'undefined') {
      expect(() => api.subscribeLive('downtown', () => undefined)()).not.toThrow()
    }
  })
})
