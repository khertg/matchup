/**
 * The HTTP contract between the web app and the API.
 * All routes live under /api and speak JSON. Errors look like
 * { "error": "<ErrorCode>", "message": "..." }.
 */

export const ERROR_CODES = [
  'weak_password',
  'invalid_club',
  'club_slug_taken',
  'invalid_credentials',
  'invalid_recovery_code',
  'invalid_token',
  'invalid_snapshot',
  'invalid_players',
  'invalid_request',
  'not_found',
  'rate_limited',
  'payload_too_large',
  'internal_error',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export interface ErrorBody {
  error: ErrorCode
  message: string
}

export const isErrorCode = (value: unknown): value is ErrorCode =>
  typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value)

export const MIN_PASSWORD_LENGTH = 4
export const MAX_PASSWORD_LENGTH = 128
export const MAX_CLUB_NAME_LENGTH = 80
export const MAX_PLAYER_NAME_LENGTH = 80
export const MAX_LOCATION_LENGTH = 120

// ---- requests and responses -------------------------------------------------

export interface CreateClubRequest {
  name: string
  slug: string
  password: string
}

/** Returned when a club is created or its password is reset. The recovery code is shown once. */
export interface AuthGrant {
  token: string
  recoveryCode: string
}

/** Returned after a password reset: a new login, a new recovery code, and the club name to display. */
export interface ResetPasswordResponse extends AuthGrant {
  name: string
}

export interface LoginRequest {
  password: string
}

export interface LoginResponse {
  token: string
  name: string
}

export interface ResetPasswordRequest {
  recoveryCode: string
  newPassword: string
}

export interface LifetimePlayer {
  name: string
  games: number
  wins: number
  losses: number
}

export interface RecordLifetimeRequest {
  /** Makes retries safe: a batch is applied at most once. */
  batchId: string
  players: LifetimePlayer[]
}

/** A live session as viewers receive it. */
export interface LiveRow {
  state: unknown
  updatedAt: string
}

/** Server-Sent Events on /clubs/:slug/live/stream. */
export type LiveEvent = { type: 'update'; row: LiveRow } | { type: 'cleared' }
