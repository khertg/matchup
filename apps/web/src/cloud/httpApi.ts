import {
  isErrorCode,
  type AuthGrant,
  type AvatarIndex,
  type HistorySummary,
  type LifetimePlayer,
  type LiveRow,
  type LoginResponse,
  type ResetPasswordResponse,
} from '@matchup/shared'
import { CloudError, type CloudApi } from './api'

interface Options {
  /** Overridable for tests. */
  fetch?: typeof fetch
  EventSource?: typeof EventSource
}

interface RequestOptions {
  token?: string
  body?: unknown
  /** Treat "404 not found" as an empty result instead of an error. */
  nullOn404?: boolean
}

/** Turn an HTTP error reply into the matching CloudError. */
function errorFrom(status: number, body: unknown): CloudError {
  const code = (body as { error?: unknown } | null)?.error
  if (isErrorCode(code)) return new CloudError(code)
  // A proxy in front of the API answers 502/503/504 while it restarts: treat as unreachable.
  if (status === 502 || status === 503 || status === 504) return new CloudError('network')
  const message = (body as { message?: unknown } | null)?.message
  return new CloudError('unknown', typeof message === 'string' ? message : `Request failed (${status})`)
}

/**
 * The Matchup API over HTTP. `baseUrl` is where /api lives, for example `/api`
 * (same origin, the normal setup) or `https://example.com/api`.
 */
export function createHttpApi(baseUrl: string, options: Options = {}): CloudApi {
  const doFetch = options.fetch ?? ((...args) => fetch(...args))
  const EventSourceImpl = options.EventSource ?? (typeof EventSource === 'undefined' ? undefined : EventSource)
  const base = baseUrl.replace(/\/+$/, '')
  const slugPath = (slug: string) => encodeURIComponent(slug)

  async function request<T>(method: string, path: string, opts: RequestOptions & { nullOn404: true }): Promise<T | null>
  async function request<T>(method: string, path: string, opts?: RequestOptions): Promise<T>
  async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T | null> {
    let response: Response
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        headers: {
          ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      })
    } catch {
      throw new CloudError('network')
    }

    if (response.status === 204) return null
    if (response.status === 404 && opts.nullOn404) return null

    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) throw errorFrom(response.status, body)
    return body as T
  }

  return {
    createClub: (name, slug, password) =>
      request<AuthGrant>('POST', '/clubs', { body: { name, slug, password } }),

    login: (slug, password) =>
      request<LoginResponse>('POST', `/clubs/${slugPath(slug)}/login`, { body: { password } }),

    resetPassword: (slug, recoveryCode, newPassword) =>
      request<ResetPasswordResponse>('POST', `/clubs/${slugPath(slug)}/reset-password`, {
        body: { recoveryCode, newPassword },
      }),

    async logout(token) {
      await request('POST', '/logout', { token })
    },

    async publish(token, snapshot, backup) {
      await request('PUT', '/session', { token, body: { public: snapshot, full: backup } })
    },

    fetchFullSession: (token) => request<unknown>('GET', '/session', { token, nullOn404: true }),

    async clear(token) {
      await request('DELETE', '/session', { token })
    },

    async recordLifetime(token, batchId, players) {
      await request('POST', '/lifetime', { token, body: { batchId, players } })
    },

    async renamePlayer(token, from, to) {
      await request('POST', '/players/rename', { token, body: { from, to } })
    },

    async putHistory(token, id, entry, backup) {
      await request('PUT', `/history/${encodeURIComponent(id)}`, { token, body: { ...entry, full: backup } })
    },

    async listHistory(token) {
      const result = await request<{ sessions: HistorySummary[] }>('GET', '/history', { token })
      return result.sessions
    },

    fetchHistory: (token, id) =>
      request<unknown>('GET', `/history/${encodeURIComponent(id)}`, { token, nullOn404: true }),

    async deleteHistory(token, id) {
      await request('DELETE', `/history/${encodeURIComponent(id)}`, { token })
    },

    async putLogo(token, data) {
      await request('PUT', '/logo', { token, body: { logo: { data } } })
    },

    async deleteLogo(token) {
      await request('DELETE', '/logo', { token })
    },

    async putAvatar(token, key, avatar) {
      await request('PUT', `/avatars/${encodeURIComponent(key)}`, { token, body: avatar })
    },

    async deleteAvatar(token, key) {
      await request('DELETE', `/avatars/${encodeURIComponent(key)}`, { token })
    },

    async deleteAvatarPhotos(token) {
      await request('DELETE', '/avatars', { token })
    },

    fetchAvatarIndex: (slug) => request<AvatarIndex>('GET', `/clubs/${slugPath(slug)}/avatars`),

    logoUrl: (slug, version) => `${base}/clubs/${slugPath(slug)}/logo?v=${version}`,

    avatarPhotoUrl: (slug, key, version) =>
      `${base}/clubs/${slugPath(slug)}/avatars/${encodeURIComponent(key)}/photo?v=${version}`,

    fetchLive: (slug) => request<LiveRow>('GET', `/clubs/${slugPath(slug)}/live`, { nullOn404: true }),

    async fetchClubPlayers(slug) {
      const result = await request<{ players: LifetimePlayer[] }>('GET', `/clubs/${slugPath(slug)}/players`)
      return result.players
    },

    subscribeLive(slug, onChange) {
      // Without EventSource (very old browsers) callers simply rely on polling.
      if (!EventSourceImpl) return () => undefined
      const source = new EventSourceImpl(`${base}/clubs/${slugPath(slug)}/live/stream`)

      const listen = (type: 'update' | 'cleared') =>
        source.addEventListener(type, (event) => {
          if (type === 'cleared') return onChange(null)
          try {
            onChange(JSON.parse((event as MessageEvent<string>).data) as LiveRow)
          } catch {
            // Ignore a garbled event; the next one or the poll will correct it.
          }
        })
      listen('update')
      listen('cleared')
      // EventSource reconnects by itself after an error, and the server sends the current board on connect.
      return () => source.close()
    },
  }
}
