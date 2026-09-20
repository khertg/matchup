import type { SupabaseClient } from '@supabase/supabase-js'
import type { FullBackup, PublicSnapshot } from './snapshot'

export type CloudClient = Pick<SupabaseClient, 'rpc' | 'from' | 'channel' | 'removeChannel'>

export type CloudErrorCode =
  | 'weak_password'
  | 'club_slug_taken'
  | 'invalid_club'
  | 'invalid_credentials'
  | 'invalid_token'
  | 'snapshot_too_large'
  | 'invalid_players'
  | 'network'
  | 'unknown'

const MESSAGES: Record<Exclude<CloudErrorCode, 'unknown'>, string> = {
  weak_password: 'Passwords need at least 4 characters.',
  club_slug_taken: 'That club URL is already taken. Try a slightly different club name.',
  invalid_club: 'That club name does not make a valid URL. Use 3 to 40 letters, numbers or dashes.',
  invalid_credentials: 'Wrong club URL or password.',
  invalid_token: 'Your club login expired. Please log in again.',
  snapshot_too_large: 'This session is too large to sync.',
  invalid_players: 'The leaderboard update was rejected.',
  network: 'No connection. Try again when you are online.',
}

export class CloudError extends Error {
  readonly code: CloudErrorCode
  constructor(code: CloudErrorCode, detail?: string) {
    super(code === 'unknown' ? (detail ?? 'Something went wrong.') : MESSAGES[code])
    this.name = 'CloudError'
    this.code = code
  }
}

const SERVER_CODES: Exclude<CloudErrorCode, 'network' | 'unknown'>[] = [
  'weak_password',
  'club_slug_taken',
  'invalid_club',
  'invalid_credentials',
  'invalid_token',
  'snapshot_too_large',
  'invalid_players',
]

/** Map a Supabase/PostgREST error (or a thrown network failure) to a CloudError. */
export function toCloudError(error: unknown): CloudError {
  if (error instanceof CloudError) return error
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
  const code = SERVER_CODES.find((c) => message.includes(c))
  if (code) return new CloudError(code)
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message)) {
    return new CloudError('network')
  }
  return new CloudError('unknown', message)
}

export interface LifetimePlayer {
  name: string
  games: number
  wins: number
  losses: number
}

export interface LiveRow {
  state: unknown
  updatedAt: string
}

export function createCloudApi(client: CloudClient) {
  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    try {
      const { data, error } = await client.rpc(fn, args)
      if (error) throw toCloudError(error)
      return data as T
    } catch (error) {
      throw toCloudError(error)
    }
  }

  return {
    createClub: (name: string, slug: string, password: string) =>
      rpc<string>('create_club', { p_name: name, p_slug: slug, p_password: password }),

    login: (slug: string, password: string) =>
      rpc<string>('club_login', { p_slug: slug, p_password: password }),

    logout: (token: string) => rpc<null>('club_logout', { p_token: token }),

    async clubName(slug: string): Promise<string | null> {
      return (await rpc<string | null>('club_name', { p_slug: slug })) ?? null
    },

    async publish(token: string, snapshot: PublicSnapshot, backup: FullBackup): Promise<void> {
      await rpc('publish_session', { p_token: token, p_public: snapshot, p_full: backup })
    },

    fetchFullSession: (token: string) => rpc<unknown>('fetch_full_session', { p_token: token }),

    async clear(token: string): Promise<void> {
      await rpc('clear_session', { p_token: token })
    },

    async recordLifetime(token: string, batchId: string, players: LifetimePlayer[]): Promise<void> {
      await rpc('record_lifetime', { p_token: token, p_batch: batchId, p_players: players })
    },

    /** The public live session for a club, or null if none is running. */
    async fetchLive(slug: string): Promise<LiveRow | null> {
      try {
        const { data, error } = await client
          .from('live_sessions')
          .select('state, updated_at')
          .eq('club_slug', slug)
          .maybeSingle()
        if (error) throw toCloudError(error)
        return data ? { state: data.state, updatedAt: data.updated_at } : null
      } catch (error) {
        throw toCloudError(error)
      }
    },

    async fetchClubPlayers(slug: string): Promise<LifetimePlayer[]> {
      try {
        const { data, error } = await client
          .from('club_players')
          .select('name, games, wins, losses')
          .eq('club_slug', slug)
        if (error) throw toCloudError(error)
        return (data ?? []) as LifetimePlayer[]
      } catch (error) {
        throw toCloudError(error)
      }
    },

    /** Calls onChange whenever the club's live session changes. Returns an unsubscribe function. */
    subscribeLive(slug: string, onChange: () => void): () => void {
      const channel = client
        .channel(`live:${slug}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'live_sessions', filter: `club_slug=eq.${slug}` },
          onChange,
        )
        .subscribe()
      return () => {
        void client.removeChannel(channel)
      }
    },
  }
}

export type CloudApi = ReturnType<typeof createCloudApi>
