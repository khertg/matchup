import {
  SNAPSHOT_LIMITS,
  jsonBytes,
  parseFullBackupEnvelope,
  parsePublicSnapshot,
  type RecordLifetimeRequest,
} from '@matchup/shared'
import type { FastifyInstance } from 'fastify'
import type { RouteDeps } from '../app'
import { AppError } from '../errors'
import { recordLifetime, MAX_PLAYERS_PER_BATCH } from '../services/lifetime'
import { clearSession, getFullSession, publishSession } from '../services/sessions'
import { authenticate } from './auth'

const publishBody = {
  type: 'object',
  required: ['public', 'full'],
  additionalProperties: false,
  properties: { public: { type: 'object' }, full: { type: 'object' } },
} as const

const lifetimeBody = {
  type: 'object',
  required: ['batchId', 'players'],
  additionalProperties: false,
  properties: {
    batchId: { type: 'string', maxLength: 64 },
    players: {
      type: 'array',
      maxItems: MAX_PLAYERS_PER_BATCH,
      items: {
        type: 'object',
        required: ['name', 'games', 'wins', 'losses'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', maxLength: 200 },
          games: { type: 'integer' },
          wins: { type: 'integer' },
          losses: { type: 'integer' },
        },
      },
    },
  },
} as const

/** Everything a signed-in club does: publish, resume and clear its session, upload leaderboard totals. */
export function registerSessionRoutes(api: FastifyInstance, { db, config, hub }: RouteDeps): void {
  const write = {
    rateLimit: { max: config.rateLimit.write.max, timeWindow: config.rateLimit.write.windowMs },
  }

  api.put<{ Body: { public: unknown; full: unknown } }>(
    '/session',
    { config: write, schema: { body: publishBody } },
    async (request) => {
      const { slug } = await authenticate(db, request)

      // parsePublicSnapshot returns a fresh copy with only the known public fields,
      // so anything extra a client sends (such as genders) can never reach viewers.
      const snapshot = parsePublicSnapshot(request.body.public)
      const backup = parseFullBackupEnvelope(request.body.full)
      if (!snapshot || !backup) throw new AppError('invalid_snapshot')
      if (jsonBytes(snapshot) > SNAPSHOT_LIMITS.publicBytes || jsonBytes(backup) > SNAPSHOT_LIMITS.fullBytes) {
        throw new AppError('payload_too_large')
      }

      const row = await publishSession(db, slug, snapshot, backup)
      hub.publish(slug, { type: 'update', row })
      return { updatedAt: row.updatedAt }
    },
  )

  // The private backup, so another staff device can pick the session up.
  api.get('/session', async (request) => {
    const { slug } = await authenticate(db, request)
    const backup = await getFullSession(db, slug)
    if (backup === null) throw new AppError('not_found')
    return backup
  })

  api.delete('/session', { config: write }, async (request, reply) => {
    const { slug } = await authenticate(db, request)
    await clearSession(db, slug)
    hub.publish(slug, { type: 'cleared' })
    return reply.code(204).send()
  })

  api.post<{ Body: RecordLifetimeRequest }>(
    '/lifetime',
    { config: write, schema: { body: lifetimeBody } },
    async (request, reply) => {
      const { slug } = await authenticate(db, request)
      await recordLifetime(db, slug, request.body.batchId, request.body.players)
      return reply.code(204).send()
    },
  )
}
