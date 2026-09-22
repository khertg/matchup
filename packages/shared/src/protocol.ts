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

export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 128
export const MAX_CLUB_NAME_LENGTH = 80
export const MAX_PLAYER_NAME_LENGTH = 80
export const MAX_LOCATION_LENGTH = 120
export const MAX_COURT_NAME_LENGTH = 40

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

/** A player was renamed: the club's leaderboard row and shared avatar move to the new name. */
export interface RenamePlayerRequest {
  from: string
  to: string
}

/** A live session as viewers receive it. */
export interface LiveRow {
  state: unknown
  updatedAt: string
}

/** Server-Sent Events on /clubs/:slug/live/stream. */
export type LiveEvent = { type: 'update'; row: LiveRow } | { type: 'cleared' }

// ---- session history ---------------------------------------------------------

/** How many ended sessions a club keeps in the cloud. The oldest go first. */
export const MAX_HISTORY_PER_CLUB = 100

/** An ended session in the club's history list, without its contents. */
export interface HistorySummary {
  /** The session's id (a UUID made on the device that ran it). */
  id: string
  location: string
  /** ISO time the session ended. */
  endedAt: string
  mode: 'doubles' | 'singles'
  /** Players who took part. */
  players: number
  /** Games finished. */
  games: number
}

/** Saves an ended session. Sending the same id again replaces the earlier version. */
export interface PutHistoryRequest {
  endedAt: string
  mode: 'doubles' | 'singles'
  players: number
  games: number
  /** The whole session, as a FullBackupEnvelope. */
  full: unknown
}

// ---- club logo and player avatars ---------------------------------------------

/** Caps on what a club may store, in bytes of the decoded image. */
export const MEDIA_LIMITS = {
  avatarPhotoBytes: 48 * 1024,
  logoBytes: 128 * 1024,
  /** Avatars a club can keep on the server. */
  avatars: 500,
  emojiChars: 8,
} as const

export type AvatarKind = 'photo' | 'emoji' | 'initials'

/** A player's avatar as the club's server stores it. The photo itself is fetched from its own URL. */
export interface AvatarInfo {
  kind: AvatarKind
  /** For "emoji": the emoji. */
  emoji?: string
  /** "#rrggbb": the badge colour for "emoji" and "initials". */
  color?: string
  /** Changes whenever the avatar does; used in the photo URL so browsers can cache it. */
  v: number
}

/** `GET /clubs/:slug/avatars`: every avatar the club has, by lower-case player name, and its logo's version. */
export interface AvatarIndex {
  avatars: Record<string, AvatarInfo>
  /** The logo's version for its URL, or null when the club has none. */
  logo: { v: number } | null
  /** The club's display name, or null for an unknown slug (looks the same as any other unset field here). */
  name: string | null
}

/** An image sent to the server as base64 text. The server decides its type from the bytes. */
export interface ImageUpload {
  data: string
}

/** `PUT /avatars/:key` */
export interface PutAvatarRequest {
  kind: AvatarKind
  emoji?: string
  color?: string
  /** Required for kind "photo". */
  photo?: ImageUpload
}

/** `PUT /logo` */
export interface PutLogoRequest {
  logo: ImageUpload
}

/** How a player's name is turned into an avatar key: trimmed and lower case, like the club leaderboard. */
export const avatarKey = (name: string) => name.trim().toLowerCase()
