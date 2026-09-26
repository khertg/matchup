import type { LiveEvent } from '@q2dink/shared'
import type { FastifyInstance } from 'fastify'
import type { RouteDeps } from '../app'
import { AppError } from '../errors'
import { getLiveSession } from '../services/sessions'
import { publicSlug, slugParams } from './auth'

const formatEvent = (event: LiveEvent) =>
  event.type === 'update'
    ? `event: update\ndata: ${JSON.stringify(event.row)}\n\n`
    : event.type === 'revision'
      ? `event: revision\ndata: ${JSON.stringify({ revision: event.revision })}\n\n`
      : 'event: cleared\ndata: {}\n\n'

/** The public live board: read it once, or subscribe to changes. No login needed. */
export function registerLiveRoutes(api: FastifyInstance, { db, config, hub }: RouteDeps): void {
  api.get<{ Params: { slug: string } }>(
    '/clubs/:slug/live',
    { schema: { params: slugParams } },
    async (request, reply) => {
      const slug = publicSlug(request.params.slug)
      // An unknown club and a club with no running session look exactly the same.
      const row = await getLiveSession(db, slug, config.liveTtlHours)
      if (!row) throw new AppError('not_found')

      const etag = `W/"${Date.parse(row.updatedAt)}"`
      reply.header('etag', etag).header('cache-control', 'no-cache')
      if (request.headers['if-none-match'] === etag) return reply.code(304).send()
      return row
    },
  )

  api.get<{ Params: { slug: string } }>(
    '/clubs/:slug/live/stream',
    { schema: { params: slugParams } },
    async (request, reply) => {
      const slug = publicSlug(request.params.slug)
      const raw = reply.raw

      // Events that arrive while the first snapshot is still loading are held, then
      // sent after it, so a viewer never ends up on an older state than the newest one.
      let ready = false
      let closed = false
      const held: LiveEvent[] = []
      const send = (event: LiveEvent) => {
        if (closed) return
        if (ready) raw.write(formatEvent(event))
        else held.push(event)
      }

      const unsubscribe = hub.subscribe(slug, request.ip, {
        send,
        close: () => raw.end(),
      })
      if (!unsubscribe) throw new AppError('rate_limited', { retryAfterSeconds: 30 })

      const origin = request.headers.origin
      const cors =
        origin && config.allowedOrigins.includes(origin)
          ? { 'access-control-allow-origin': origin, vary: 'Origin' }
          : {}

      const heartbeat = setInterval(() => {
        if (!closed) raw.write(': ping\n\n')
      }, config.sseHeartbeatMs)
      const finish = () => {
        closed = true
        clearInterval(heartbeat)
        unsubscribe()
      }
      request.raw.on('close', finish)

      reply.hijack()
      raw.writeHead(200, {
        ...cors,
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no', // tell reverse proxies not to buffer the stream
        'x-content-type-options': 'nosniff',
      })
      raw.write('retry: 3000\n\n')

      const current = await getLiveSession(db, slug, config.liveTtlHours).catch(() => null)
      if (closed) return
      ready = true
      raw.write(formatEvent(current ? { type: 'update', row: current } : { type: 'cleared' }))
      for (const event of held) raw.write(formatEvent(event))
    },
  )
}
