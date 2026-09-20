import { describe, expect, it, vi } from 'vitest'
import { CloudError, createCloudApi, toCloudError, type CloudClient } from './api'

function fakeClient(rpcResult: { data?: unknown; error?: unknown } | Error) {
  const rpc = vi.fn(async () => {
    if (rpcResult instanceof Error) throw rpcResult
    return { data: rpcResult.data ?? null, error: rpcResult.error ?? null }
  })
  return { rpc, client: { rpc } as unknown as CloudClient }
}

describe('toCloudError', () => {
  it('recognises the server error codes', () => {
    for (const code of ['weak_password', 'club_slug_taken', 'invalid_credentials', 'invalid_token'] as const) {
      const error = toCloudError({ message: code })
      expect(error.code).toBe(code)
      expect(error.message).not.toBe(code) // friendly text, not the raw code
    }
  })

  it('recognises a code inside a longer message', () => {
    expect(toCloudError({ message: 'P0001: invalid_token (hint)' }).code).toBe('invalid_token')
  })

  it('treats fetch failures as a network problem', () => {
    expect(toCloudError({ message: 'TypeError: Failed to fetch' }).code).toBe('network')
    expect(toCloudError(new TypeError('NetworkError when attempting to fetch resource.')).code).toBe('network')
  })

  it('keeps unknown messages', () => {
    const error = toCloudError({ message: 'something odd' })
    expect(error.code).toBe('unknown')
    expect(error.message).toBe('something odd')
  })

  it('passes a CloudError through unchanged', () => {
    const original = new CloudError('invalid_club')
    expect(toCloudError(original)).toBe(original)
  })
})

describe('createCloudApi', () => {
  it('logs in with the RPC arguments the database expects', async () => {
    const { client, rpc } = fakeClient({ data: 'token-123' })
    const token = await createCloudApi(client).login('downtown', 'secret')
    expect(token).toBe('token-123')
    expect(rpc).toHaveBeenCalledWith('club_login', { p_slug: 'downtown', p_password: 'secret' })
  })

  it('creates a club', async () => {
    const { client, rpc } = fakeClient({ data: 'tok' })
    await createCloudApi(client).createClub('Downtown', 'downtown', 'secret')
    expect(rpc).toHaveBeenCalledWith('create_club', {
      p_name: 'Downtown',
      p_slug: 'downtown',
      p_password: 'secret',
    })
  })

  it('sends a lifetime batch with its idempotency id', async () => {
    const { client, rpc } = fakeClient({})
    const players = [{ name: 'Ann', games: 2, wins: 1, losses: 1 }]
    await createCloudApi(client).recordLifetime('tok', 'batch-1', players)
    expect(rpc).toHaveBeenCalledWith('record_lifetime', {
      p_token: 'tok',
      p_batch: 'batch-1',
      p_players: players,
    })
  })

  it('turns an RPC error into a friendly CloudError', async () => {
    const { client } = fakeClient({ error: { message: 'invalid_credentials' } })
    await expect(createCloudApi(client).login('a', 'b')).rejects.toMatchObject({
      name: 'CloudError',
      code: 'invalid_credentials',
      message: 'Wrong club URL or password.',
    })
  })

  it('turns a thrown network failure into a network CloudError', async () => {
    const { client } = fakeClient(new TypeError('Failed to fetch'))
    await expect(createCloudApi(client).login('a', 'b')).rejects.toMatchObject({ code: 'network' })
  })

  it('returns null for a club name that does not exist', async () => {
    const { client } = fakeClient({ data: null })
    expect(await createCloudApi(client).clubName('nope')).toBeNull()
  })

  it('reads the live session row', async () => {
    const maybeSingle = vi.fn(async () => ({
      data: { state: { location: 'X' }, updated_at: '2026-01-01T00:00:00Z' },
      error: null,
    }))
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    const api = createCloudApi({ from } as unknown as CloudClient)

    expect(await api.fetchLive('downtown')).toEqual({
      state: { location: 'X' },
      updatedAt: '2026-01-01T00:00:00Z',
    })
    expect(from).toHaveBeenCalledWith('live_sessions')
    expect(eq).toHaveBeenCalledWith('club_slug', 'downtown')
  })

  it('subscribes to one club and unsubscribes cleanly', () => {
    const channel = { on: vi.fn(), subscribe: vi.fn() }
    channel.on.mockReturnValue(channel)
    channel.subscribe.mockReturnValue(channel)
    const removeChannel = vi.fn()
    const client = { channel: vi.fn(() => channel), removeChannel } as unknown as CloudClient

    const onChange = vi.fn()
    const stop = createCloudApi(client).subscribeLive('downtown', onChange)
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'live_sessions', filter: 'club_slug=eq.downtown' },
      onChange,
    )
    stop()
    expect(removeChannel).toHaveBeenCalledWith(channel)
  })
})
