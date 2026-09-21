import {
  SNAPSHOT_LIMITS,
  jsonBytes,
  parseFullBackupEnvelope,
  parsePublicSnapshot,
  type PutHistoryRequest,
  type RecordLifetimeRequest,
  type RenamePlayerRequest,
} from '@matchup/shared'
import type { FastifyInstance } from 'fastify'
import type { RouteDeps } from '../app'
import { AppError } from '../errors'
import { deleteHistory, getHistory, isHistoryId, listHistory, putHistory } from '../services/history'
import { recordLifetime, MAX_PLAYERS_PER_BATCH } from '../services/lifetime'
import { renamePlayer } from '../services/players'
import { clearSession, getFullSession, publishSession } from '../services/sessions'
import { authenticate } from './auth'

const publishBody = {
  type: 'object',
  required: ['public', 'full'],
  additionalProperties: false,
  properties: { public: { type: 'object' }, full: { type: 'object' } },
} as const

const historyBody = {
  type: 'object',
  required: ['endedAt', 'mode', 'players', 'games', 'full'],
  additionalProperties: false,
  properties: {
    endedAt: { type: 'string', maxLength: 40 },
    mode: { type: 'string', enum: ['doubles', 'singles'] },
    players: { type: 'integer', minimum: 0, maximum: SNAPSHOT_LIMITS.players },
    games: { type: 'integer', minimum: 0, maximum: 1_000_000 },
    full: { type: 'object' },
  },
} as const

const renameBody = {
  type: 'object',
  required: ['from', 'to'],
  additionalProperties: false,
  properties: {
    from: { type: 'string', maxLength: 200 },
    to: { type: 'string', maxLength: 200 },
  },
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

/** Everything a signed-in club does: publish, resume and clear its session, keep its history, upload leaderboard totals. */
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

  // A player was renamed on a staff device: their leaderboard row and shared avatar follow the new name.
  api.post<{ Body: RenamePlayerRequest }>(
    '/players/rename',
    { config: write, schema: { body: renameBody } },
    async (request, reply) => {
      const { slug } = await authenticate(db, request)
      await renamePlayer(db, slug, request.body.from, request.body.to)
      return reply.code(204).send()
    },
  )

  // Ended sessions, kept so the club can look back at them and resume one from any staff device.
  api.put<{ Params: { id: string }; Body: PutHistoryRequest }>(
    '/history/:id',
    { config: write, schema: { body: historyBody } },
    async (request, reply) => {
      const { slug } = await authenticate(db, request)
      const { id } = request.params
      const { full, ...rest } = request.body
      const backup = parseFullBackupEnvelope(full)
      const endedAt = new Date(rest.endedAt)
      if (!isHistoryId(id) || !backup || Number.isNaN(endedAt.getTime())) throw new AppError('invalid_request')
      if (jsonBytes(backup) > SNAPSHOT_LIMITS.fullBytes) throw new AppError('payload_too_large')
      await putHistory(db, slug, id, { ...rest, endedAt: endedAt.toISOString() }, backup)
      return reply.code(204).send()
    },
  )

  api.get('/history', async (request) => {
    const { slug } = await authenticate(db, request)
    return { sessions: await listHistory(db, slug) }
  })

  api.get<{ Params: { id: string } }>('/history/:id', async (request) => {
    const { slug } = await authenticate(db, request)
    if (!isHistoryId(request.params.id)) throw new AppError('not_found')
    const state = await getHistory(db, slug, request.params.id)
    if (state === null) throw new AppError('not_found')
    return state
  })

  api.delete<{ Params: { id: string } }>('/history/:id', { config: write }, async (request, reply) => {
    const { slug } = await authenticate(db, request)
    if (isHistoryId(request.params.id)) await deleteHistory(db, slug, request.params.id)
    return reply.code(204).send()
  })
}
