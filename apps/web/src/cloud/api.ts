import type {
  AuthGrant,
  ErrorCode,
  HistorySummary,
  LifetimePlayer,
  LiveRow,
  LoginResponse,
  PublicSnapshot,
  PutHistoryRequest,
  ResetPasswordResponse,
} from '@matchup/shared'
import type { FullBackup } from './snapshot'

export type { HistorySummary, LifetimePlayer, LiveRow, PutHistoryRequest }

/**
 * Everything the app needs from a cloud backend. The web app talks only to
 * this interface; `httpApi.ts` implements it against the Matchup API, and a
 * different backend could be dropped in by writing another implementation.
 */
export interface CloudApi {
  createClub(name: string, slug: string, password: string): Promise<AuthGrant>
  login(slug: string, password: string): Promise<LoginResponse>
  resetPassword(slug: string, recoveryCode: string, newPassword: string): Promise<ResetPasswordResponse>
  logout(token: string): Promise<void>

  /** Publish the running session: the public board plus a private full backup. */
  publish(token: string, snapshot: PublicSnapshot, backup: FullBackup): Promise<void>
  /** The private backup for resuming on another device, or null if none is running. */
  fetchFullSession(token: string): Promise<unknown | null>
  /** The session ended. */
  clear(token: string): Promise<void>
  /** Add a session's totals to the club leaderboard. Applied once per batch id. */
  recordLifetime(token: string, batchId: string, players: LifetimePlayer[]): Promise<void>

  /** Keep an ended session in the club's history. Sending the same id again replaces it. */
  putHistory(token: string, id: string, entry: Omit<PutHistoryRequest, 'full'>, backup: FullBackup): Promise<void>
  /** The club's ended sessions, newest first, without their contents. */
  listHistory(token: string): Promise<HistorySummary[]>
  /** One ended session in full (a FullBackup), or null if it is gone. */
  fetchHistory(token: string, id: string): Promise<unknown | null>
  deleteHistory(token: string, id: string): Promise<void>

  /** The public live board for a club, or null when no session is running. */
  fetchLive(slug: string): Promise<LiveRow | null>
  fetchClubPlayers(slug: string): Promise<LifetimePlayer[]>
  /**
   * Call `onChange` whenever the board changes (a row) or ends (null). Returns
   * an unsubscribe function. Callers should still poll as a fallback.
   */
  subscribeLive(slug: string, onChange: (row: LiveRow | null) => void): () => void
}

export type CloudErrorCode = ErrorCode | 'network' | 'unknown'

const MESSAGES: Record<Exclude<CloudErrorCode, 'unknown'>, string> = {
  weak_password: 'Passwords need between 4 and 128 characters.',
  invalid_club: 'That club name does not make a valid URL. Use 3 to 40 letters, numbers or dashes.',
  club_slug_taken: 'That club URL is already taken. Try a slightly different club name.',
  invalid_credentials: 'Wrong club URL or password.',
  invalid_recovery_code: 'That recovery code is not valid.',
  invalid_token: 'Your club login expired. Please log in again.',
  invalid_snapshot: 'This session could not be shared with the live board.',
  invalid_players: 'The leaderboard update was rejected.',
  invalid_request: 'The request was not valid.',
  not_found: 'Not found.',
  rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
  payload_too_large: 'This session is too large to sync.',
  internal_error: 'Something went wrong on the server. Please try again.',
  network: 'Cannot reach the server. Check your connection and try again.',
}

export class CloudError extends Error {
  readonly code: CloudErrorCode
  constructor(code: CloudErrorCode, detail?: string) {
    super(code === 'unknown' ? (detail ?? 'Something went wrong.') : MESSAGES[code])
    this.name = 'CloudError'
    this.code = code
  }
}

/** Normalise anything thrown while talking to the backend into a CloudError. */
export function toCloudError(error: unknown): CloudError {
  if (error instanceof CloudError) return error
  const message = error instanceof Error ? error.message : String(error)
  return new CloudError('unknown', message)
}
