import type {
  CreateClubRequest,
  LoginRequest,
  ResetPasswordRequest,
} from '@matchup/shared'
import type { FastifyInstance } from 'fastify'
import type { RouteDeps } from '../app'
import { AppError } from '../errors'
import { createClub, login, resetPassword } from '../services/clubs'
import { getLeaderboard } from '../services/lifetime'
import { revokeToken } from '../services/tokens'
import { authenticate, publicSlug, slugParams } from './auth'

const createBody = {
  type: 'object',
  required: ['name', 'slug', 'password'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', maxLength: 200 },
    slug: { type: 'string', maxLength: 100 },
    password: { type: 'string', maxLength: 1000 },
  },
} as const

const loginBody = {
  type: 'object',
  required: ['password'],
  additionalProperties: false,
  properties: { password: { type: 'string', maxLength: 1000 } },
} as const

const resetBody = {
  type: 'object',
  required: ['recoveryCode', 'newPassword'],
  additionalProperties: false,
  properties: {
    recoveryCode: { type: 'string', maxLength: 100 },
    newPassword: { type: 'string', maxLength: 1000 },
  },
} as const

export function registerClubRoutes(api: FastifyInstance, { db, config, guard }: RouteDeps): void {
  const strict = {
    rateLimit: { max: config.rateLimit.auth.max, timeWindow: config.rateLimit.auth.windowMs },
  }

  api.post<{ Body: CreateClubRequest }>(
    '/clubs',
    { config: strict, schema: { body: createBody } },
    async (request, reply) => {
      const grant = await createClub(db, request.body, config.tokenTtlDays)
      return reply.code(201).send(grant)
    },
  )

  api.post<{ Params: { slug: string }; Body: LoginRequest }>(
    '/clubs/:slug/login',
    { config: strict, schema: { params: slugParams, body: loginBody } },
    async (request) => {
      const slug = request.params.slug.trim().toLowerCase()
      guard.check(slug, request.ip)
      try {
        const result = await login(db, slug, request.body.password, config.tokenTtlDays)
        guard.success(slug, request.ip)
        return result
      } catch (error) {
        if (error instanceof AppError && error.code === 'invalid_credentials') guard.fail(slug, request.ip)
        throw error
      }
    },
  )

  api.post<{ Params: { slug: string }; Body: ResetPasswordRequest }>(
    '/clubs/:slug/reset-password',
    { config: strict, schema: { params: slugParams, body: resetBody } },
    async (request) => {
      const slug = request.params.slug.trim().toLowerCase()
      const key = `reset:${slug}`
      guard.check(key, request.ip)
      try {
        const grant = await resetPassword(db, slug, request.body, config.tokenTtlDays)
        guard.success(key, request.ip)
        return grant
      } catch (error) {
        if (error instanceof AppError && error.code === 'invalid_recovery_code') guard.fail(key, request.ip)
        throw error
      }
    },
  )

  api.post('/logout', async (request, reply) => {
    const { token } = await authenticate(db, request)
    await revokeToken(db, token)
    return reply.code(204).send()
  })

  // Public, like the live board. An unknown club just has an empty leaderboard.
  api.get<{ Params: { slug: string } }>(
    '/clubs/:slug/players',
    { schema: { params: slugParams } },
    async (request) => {
      const slug = publicSlug(request.params.slug)
      return { players: await getLeaderboard(db, slug) }
    },
  )
}
