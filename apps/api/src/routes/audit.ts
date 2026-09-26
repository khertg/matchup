import { isUuid, parseAuditEntries, parseRegisterDevice, type AuditPage, type ClubDevice } from '@q2dink/shared'
import type { FastifyInstance } from 'fastify'
import type { RouteDeps } from '../app'
import { AppError } from '../errors'
import { addAuditEntries, listAudit, listDevices, registerDevice } from '../services/audit'
import { authenticate } from './auth'

type AuditQuerystring = { sessionId?: string; deviceId?: string; before?: string; limit?: string }

/** The audit log and the club's named devices. Staff only: none of it is ever on the public live page. */
export function registerAuditRoutes(api: FastifyInstance, { db, config }: RouteDeps): void {
  const write = {
    rateLimit: { max: config.rateLimit.write.max, timeWindow: config.rateLimit.write.windowMs },
  }

  api.post('/audit', { config: write }, async (request, reply) => {
    const { slug } = await authenticate(db, request)
    const entries = parseAuditEntries(request.body)
    if (!entries) throw new AppError('invalid_request')
    await addAuditEntries(db, slug, entries, config.auditRetentionDays)
    return reply.code(204).send()
  })

  api.get<{ Querystring: AuditQuerystring }>('/audit', async (request): Promise<AuditPage> => {
    const { slug } = await authenticate(db, request)
    const { sessionId, deviceId, before, limit } = request.query
    if (sessionId !== undefined && !isUuid(sessionId)) throw new AppError('invalid_request')
    if (deviceId !== undefined && (deviceId.length === 0 || deviceId.length > 64)) throw new AppError('invalid_request')
    if (before !== undefined && Number.isNaN(Date.parse(before))) throw new AppError('invalid_request')
    const count = limit === undefined ? undefined : Number(limit)
    if (count !== undefined && !Number.isInteger(count)) throw new AppError('invalid_request')
    return listAudit(db, slug, { sessionId, deviceId, before, limit: count })
  })

  api.put('/devices/me', { config: write }, async (request, reply) => {
    const { slug } = await authenticate(db, request)
    const device = parseRegisterDevice(request.body)
    if (!device) throw new AppError('invalid_request')
    await registerDevice(db, slug, device)
    return reply.code(204).send()
  })

  api.get('/devices', async (request): Promise<{ devices: ClubDevice[] }> => {
    const { slug } = await authenticate(db, request)
    return { devices: await listDevices(db, slug) }
  })
}
