import type { Page } from '@playwright/test'

/**
 * A stand-in for the Supabase REST API, served from the fake address baked into
 * the `cloudtest` build. Tests can read `calls` and change the fields below at
 * any time to steer what the app sees.
 */
export interface RpcCall {
  fn: string
  body: Record<string, unknown>
}

export interface CloudMock {
  calls: RpcCall[]
  /** Row returned for live_sessions, or null for "no session running". */
  live: { state: unknown; updated_at: string } | null
  /** Rows returned for club_players. */
  clubPlayers: { name: string; games: number; wins: number; losses: number }[]
  /** What fetch_full_session returns. */
  fullSession: unknown
  /** Per-RPC overrides: return a status and body to replace the default reply. */
  overrides: Record<string, (body: Record<string, unknown>) => { status: number; body?: unknown }>
  /** When true every request fails like a dropped connection. */
  down: boolean
  callsTo: (fn: string) => RpcCall[]
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
}

export const rpcError = (message: string) => ({
  status: 400,
  body: { code: 'P0001', details: null, hint: null, message },
})

export async function mockCloud(page: Page, initial: Partial<CloudMock> = {}): Promise<CloudMock> {
  const mock: CloudMock = {
    calls: [],
    live: null,
    clubPlayers: [],
    fullSession: null,
    overrides: {},
    down: false,
    callsTo: (fn) => mock.calls.filter((c) => c.fn === fn),
    ...initial,
  }

  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS })
      return
    }
    if (mock.down) {
      await route.abort('connectionrefused')
      return
    }

    const url = new URL(request.url())
    const reply = (status: number, body?: unknown) =>
      route.fulfill({
        status,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })

    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.split('/').pop() as string
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>
      mock.calls.push({ fn, body })

      const override = mock.overrides[fn]
      if (override) {
        const { status, body: replyBody } = override(body)
        await reply(status, replyBody)
        return
      }
      switch (fn) {
        case 'create_club':
          return reply(200, 'token-created')
        case 'club_login':
          return body.p_password === 'secret'
            ? reply(200, 'token-login')
            : reply(rpcError('invalid_credentials').status, rpcError('invalid_credentials').body)
        case 'club_name':
          return reply(200, 'Downtown Club')
        case 'publish_session':
          return reply(200, new Date().toISOString())
        case 'fetch_full_session':
          return reply(200, mock.fullSession)
        default:
          return reply(204) // clear_session, club_logout, record_lifetime
      }
    }

    if (url.pathname === '/rest/v1/live_sessions') {
      await reply(200, mock.live ? [mock.live] : [])
      return
    }
    if (url.pathname === '/rest/v1/club_players') {
      await reply(200, mock.clubPlayers)
      return
    }
    await reply(404, { message: `unmocked ${url.pathname}` })
  })

  // Accept realtime joins so the client sits quietly instead of retrying.
  // Live updates are covered by the polling fallback, which these tests drive.
  await page.routeWebSocket(/realtime\/v1\/websocket/, (ws) => {
    ws.onMessage((message) => {
      try {
        const m = JSON.parse(String(message)) as { topic: string; ref: string }
        ws.send(
          JSON.stringify({
            topic: m.topic,
            event: 'phx_reply',
            ref: m.ref,
            payload: { status: 'ok', response: {} },
          }),
        )
      } catch {
        // Ignore anything that is not JSON.
      }
    })
  })

  return mock
}

/** A live session as the public viewer receives it. */
export const liveSnapshot = {
  schemaVersion: 1,
  location: 'Sunset Courts',
  mode: 'doubles',
  matchmaking: 'skill',
  avgGameMinutes: 12,
  courts: [
    { id: 1, teams: [[1, 2], [3, 4]] },
    { id: 2, teams: null },
  ],
  queue: [5, 6],
  onBreak: [],
  partners: [[5, 6]],
  stats: {
    1: { games: 2, wins: 2, losses: 0, opponentSkill: 6 },
    2: { games: 2, wins: 2, losses: 0, opponentSkill: 6 },
    3: { games: 2, wins: 0, losses: 2, opponentSkill: 6 },
    4: { games: 2, wins: 0, losses: 2, opponentSkill: 6 },
  },
  players: {
    1: { id: 1, name: 'Ann', skill: 3 },
    2: { id: 2, name: 'Bob', skill: 3 },
    3: { id: 3, name: 'Cy', skill: 4 },
    4: { id: 4, name: 'Dee', skill: 4 },
    5: { id: 5, name: 'Eve', skill: 2 },
    6: { id: 6, name: 'Fay', skill: 2 },
  },
}

/** A whole session saved by another staff device, for the resume flow. */
export const fullBackup = {
  schemaVersion: 1,
  storeVersion: 4,
  location: 'Saved Club Night',
  session: {
    mode: 'doubles',
    avgGameMinutes: 12,
    matchmaking: 'balanced',
    partners: [],
    lastResult: {},
    stats: {},
    courts: [{ id: 1, teams: [[1, 2], [3, 4]] }],
    players: {
      1: { id: 1, name: 'Ann', skill: 3 },
      2: { id: 2, name: 'Bob', skill: 3 },
      3: { id: 3, name: 'Cy', skill: 3 },
      4: { id: 4, name: 'Dee', skill: 3 },
      5: { id: 5, name: 'Eve', skill: 3 },
    },
    queue: [5],
    onBreak: [],
  },
}

export const asLive = (state: unknown) => ({ state, updated_at: '2026-06-01T12:00:00.000Z' })
