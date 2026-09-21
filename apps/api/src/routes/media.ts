import type { PutAvatarRequest, PutLogoRequest } from '@matchup/shared'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { RouteDeps } from '../app'
import { AppError } from '../errors'
import {
  checkKey,
  deleteAvatar,
  deleteAvatarPhotos,
  deleteLogo,
  getAvatarIndex,
  getAvatarPhoto,
  getLogo,
  putAvatar,
  putLogo,
  type StoredImage,
} from '../services/media'
import { authenticate, publicSlug, slugParams } from './auth'

const avatarBody = {
  type: 'object',
  required: ['kind'],
  additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: ['photo', 'emoji', 'initials'] },
    emoji: { type: 'string', maxLength: 32 },
    color: { type: 'string', maxLength: 7 },
    photo: {
      type: 'object',
      required: ['data'],
      additionalProperties: false,
      properties: { data: { type: 'string', maxLength: 80 * 1024 } },
    },
  },
} as const

const logoBody = {
  type: 'object',
  required: ['logo'],
  additionalProperties: false,
  properties: {
    logo: {
      type: 'object',
      required: ['data'],
      additionalProperties: false,
      properties: { data: { type: 'string', maxLength: 200 * 1024 } },
    },
  },
} as const

const keyParams = {
  type: 'object',
  required: ['key'],
  properties: { key: { type: 'string', maxLength: 200 } },
} as const

const publicKeyParams = {
  type: 'object',
  required: ['slug', 'key'],
  properties: { slug: { type: 'string', maxLength: 64 }, key: { type: 'string', maxLength: 200 } },
} as const

/** Send a stored image: its own validated type, cached hard when the URL carries its version. */
function sendImage(request: FastifyRequest, reply: FastifyReply, image: StoredImage) {
  const etag = `W/"${image.version}"`
  const versioned = typeof (request.query as { v?: string }).v === 'string'
  reply
    .header('etag', etag)
    .header('content-type', image.type)
    .header('x-content-type-options', 'nosniff')
    .header('cache-control', versioned ? 'public, max-age=31536000, immutable' : 'no-cache')
  if (request.headers['if-none-match'] === etag) return reply.code(304).send()
  return reply.send(image.bytes)
}

/** The club's logo and player avatars. Staff change them; anyone with the live link can look. */
export function registerMediaRoutes(api: FastifyInstance, { db, config }: RouteDeps): void {
  const write = {
    rateLimit: { max: config.rateLimit.write.max, timeWindow: config.rateLimit.write.windowMs },
  }

  api.put<{ Body: PutLogoRequest }>('/logo', { config: write, schema: { body: logoBody } }, async (request, reply) => {
    const { slug } = await authenticate(db, request)
    await putLogo(db, slug, request.body.logo.data)
    return reply.code(204).send()
  })

  api.delete('/logo', { config: write }, async (request, reply) => {
    const { slug } = await authenticate(db, request)
    await deleteLogo(db, slug)
    return reply.code(204).send()
  })

  api.put<{ Params: { key: string }; Body: PutAvatarRequest }>(
    '/avatars/:key',
    { config: write, schema: { params: keyParams, body: avatarBody } },
    async (request, reply) => {
      const { slug } = await authenticate(db, request)
      await putAvatar(db, slug, request.params.key, request.body)
      return reply.code(204).send()
    },
  )

  api.delete<{ Params: { key: string } }>(
    '/avatars/:key',
    { config: write, schema: { params: keyParams } },
    async (request, reply) => {
      const { slug } = await authenticate(db, request)
      await deleteAvatar(db, slug, request.params.key)
      return reply.code(204).send()
    },
  )

  // Sharing photos was switched off: take every photo down (emoji and initials avatars stay).
  api.delete('/avatars', { config: write }, async (request, reply) => {
    const { slug } = await authenticate(db, request)
    await deleteAvatarPhotos(db, slug)
    return reply.code(204).send()
  })

  api.get<{ Params: { slug: string } }>('/clubs/:slug/logo', { schema: { params: slugParams } }, async (request, reply) => {
    const logo = await getLogo(db, publicSlug(request.params.slug))
    // An unknown club and a club without a logo look exactly the same.
    if (!logo) throw new AppError('not_found')
    return sendImage(request, reply, logo)
  })

  api.get<{ Params: { slug: string } }>(
    '/clubs/:slug/avatars',
    { schema: { params: slugParams } },
    async (request, reply) => {
      const { avatars, logo, etag } = await getAvatarIndex(db, publicSlug(request.params.slug))
      reply.header('etag', etag).header('cache-control', 'no-cache')
      if (request.headers['if-none-match'] === etag) return reply.code(304).send()
      return { avatars, logo }
    },
  )

  api.get<{ Params: { slug: string; key: string } }>(
    '/clubs/:slug/avatars/:key/photo',
    { schema: { params: publicKeyParams } },
    async (request, reply) => {
      const slug = publicSlug(request.params.slug)
      let key: string
      try {
        key = checkKey(request.params.key)
      } catch {
        throw new AppError('not_found')
      }
      const photo = await getAvatarPhoto(db, slug, key)
      if (!photo) throw new AppError('not_found')
      return sendImage(request, reply, photo)
    },
  )
}
