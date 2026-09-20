import {
  MAX_CLUB_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  isValidSlug,
  type AuthGrant,
  type CreateClubRequest,
  type LoginResponse,
  type ResetPasswordRequest,
  type ResetPasswordResponse,
} from '@matchup/shared'
import type { Db } from '../db'
import { AppError } from '../errors'
import { dummyHash, hashPassword, verifyPassword } from './password'
import { hashRecoveryCode, newRecoveryCode, sameHash } from './recovery'
import { issueToken, revokeAllTokens } from './tokens'

function checkPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new AppError('weak_password')
  }
}

/** Create a club. Returns a staff token and a recovery code, which is never shown again. */
export async function createClub(db: Db, input: CreateClubRequest, tokenTtlDays: number): Promise<AuthGrant> {
  const name = input.name.trim()
  const slug = input.slug.trim().toLowerCase()
  if (name.length < 1 || name.length > MAX_CLUB_NAME_LENGTH || !isValidSlug(slug)) {
    throw new AppError('invalid_club')
  }
  checkPassword(input.password)

  const recoveryCode = newRecoveryCode()
  const passwordHash = await hashPassword(input.password)

  const token = await db.transaction(async (tx) => {
    const inserted = await tx.query(
      `insert into clubs (slug, name, password_hash, recovery_hash)
       values ($1, $2, $3, $4)
       on conflict (slug) do nothing
       returning slug`,
      [slug, name, passwordHash, hashRecoveryCode(recoveryCode)],
    )
    if (inserted.rowCount === 0) throw new AppError('club_slug_taken')
    return issueToken(tx, slug, tokenTtlDays)
  })
  return { token, recoveryCode }
}

/**
 * Check a club password and issue a token. An unknown club and a wrong password
 * give the same error, and both do the same amount of hashing work.
 */
export async function login(
  db: Db,
  slugInput: string,
  password: string,
  tokenTtlDays: number,
): Promise<LoginResponse> {
  const slug = slugInput.trim().toLowerCase()
  const { rows } = await db.query<{ name: string; password_hash: string }>(
    'select name, password_hash from clubs where slug = $1',
    [slug],
  )
  const club = rows[0]
  const valid = await verifyPassword(club?.password_hash ?? (await dummyHash()), password)
  if (!club || !valid) throw new AppError('invalid_credentials')
  return { token: await issueToken(db, slug, tokenTtlDays), name: club.name }
}

/**
 * Set a new password using the recovery code. Every existing token stops
 * working, and a fresh recovery code replaces the used one.
 */
export async function resetPassword(
  db: Db,
  slugInput: string,
  input: ResetPasswordRequest,
  tokenTtlDays: number,
): Promise<ResetPasswordResponse> {
  const slug = slugInput.trim().toLowerCase()
  checkPassword(input.newPassword)

  const { rows } = await db.query<{ recovery_hash: string; name: string }>(
    'select recovery_hash, name from clubs where slug = $1',
    [slug],
  )
  const stored = rows[0]?.recovery_hash
  // Compare against a throwaway digest for unknown clubs so both paths do the same work.
  const matches = sameHash(stored ?? hashRecoveryCode('unknown-club'), hashRecoveryCode(input.recoveryCode))
  if (!stored || !matches) throw new AppError('invalid_recovery_code')

  const recoveryCode = newRecoveryCode()
  const passwordHash = await hashPassword(input.newPassword)

  const token = await db.transaction(async (tx) => {
    await tx.query('update clubs set password_hash = $2, recovery_hash = $3 where slug = $1', [
      slug,
      passwordHash,
      hashRecoveryCode(recoveryCode),
    ])
    await revokeAllTokens(tx, slug)
    return issueToken(tx, slug, tokenTtlDays)
  })
  return { token, recoveryCode, name: rows[0].name }
}
