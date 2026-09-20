import { isValidSlug } from '@matchup/shared'
import type { FastifyRequest } from 'fastify'
import type { Queryable } from '../db'
import { AppError } from '../errors'
import { resolveToken } from '../services/tokens'

export interface Authenticated {
  slug: string
  token: string
}

/** Require `Authorization: Bearer <token>` and return the club it belongs to. */
export async function authenticate(db: Queryable, request: FastifyRequest): Promise<Authenticated> {
  const match = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.authorization ?? '')
  if (!match) throw new AppError('invalid_token')
  const slug = await resolveToken(db, match[1])
  if (!slug) throw new AppError('invalid_token')
  return { slug, token: match[1] }
}

/** JSON schema for a `:slug` path parameter (structure only; the service decides what is valid). */
export const slugParams = {
  type: 'object',
  required: ['slug'],
  properties: { slug: { type: 'string', maxLength: 64 } },
} as const

/**
 * A club URL name from a public path. Anything malformed is reported as
 * not found, exactly like a club that does not exist, so nothing is revealed.
 */
export function publicSlug(raw: string): string {
  const slug = raw.toLowerCase()
  if (!isValidSlug(slug)) throw new AppError('not_found')
  return slug
}
