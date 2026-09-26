import { describe, expect, it } from 'vitest'
import { AUDIT_LIMITS, parseAuditEntries, parseDeviceName, parseRegisterDevice } from './audit'

const device = { id: 'dev-1', label: 'iPhone · iOS 18 · Safari', name: 'Desk' }
const entry = (over: Record<string, unknown> = {}) => ({
  id: '0b6f4a4e-3c1d-4b8e-9a51-2f1f0c2d9e10',
  at: '2026-09-27T10:00:00.000Z',
  device,
  kind: 'checkIn',
  summary: 'Checked in Ann',
  sessionId: '5c0e7a52-1d8b-4f6f-8a3e-7b9c2d1e0f44',
  ...over,
})

describe('parseAuditEntries', () => {
  it('returns a fresh copy with only the known fields', () => {
    const [parsed] = parseAuditEntries({ entries: [entry({ extra: 1, device: { ...device, secret: 'x' } })] })!
    expect(parsed).toEqual(entry())
    expect(parsed).not.toHaveProperty('extra')
    expect(parsed.device).not.toHaveProperty('secret')
  })

  it('takes an entry without a session or a device name (a device not named yet)', () => {
    const [parsed] = parseAuditEntries({ entries: [entry({ sessionId: undefined, device: { id: 'd', label: 'iPhone' } })] })!
    expect(parsed).not.toHaveProperty('sessionId')
    expect(parsed.device).toEqual({ id: 'd', label: 'iPhone' })
  })

  it('trims text and normalises the time', () => {
    const [parsed] = parseAuditEntries({ entries: [entry({ summary: '  Checked in Ann ', at: '2026-09-27T12:00:00+02:00' })] })!
    expect(parsed.summary).toBe('Checked in Ann')
    expect(parsed.at).toBe('2026-09-27T10:00:00.000Z')
  })

  it('refuses the whole batch when any entry is not an entry', () => {
    for (const bad of [
      entry({ id: 'not-a-uuid' }),
      entry({ at: 'yesterday' }),
      entry({ summary: '' }),
      entry({ summary: 'x'.repeat(AUDIT_LIMITS.summary + 1) }),
      entry({ kind: 'k'.repeat(AUDIT_LIMITS.kind + 1) }),
      entry({ device: { id: 'd' } }),
      entry({ device: { ...device, name: 'n'.repeat(AUDIT_LIMITS.deviceName + 1) } }),
      entry({ sessionId: 'nope' }),
    ]) {
      expect(parseAuditEntries({ entries: [entry(), bad] })).toBeNull()
    }
  })

  it('refuses a batch that is too big, or not a batch at all', () => {
    expect(parseAuditEntries({ entries: Array.from({ length: AUDIT_LIMITS.batch + 1 }, () => entry()) })).toBeNull()
    expect(parseAuditEntries([entry()])).toBeNull()
    expect(parseAuditEntries(null)).toBeNull()
    expect(parseAuditEntries({ entries: [] })).toEqual([])
  })
})

describe('parseRegisterDevice', () => {
  it('takes a device and its trimmed name, and nothing else', () => {
    expect(parseRegisterDevice({ id: 'dev-1', label: 'iPhone', name: ' Maria ', extra: true })).toEqual({
      id: 'dev-1',
      label: 'iPhone',
      name: 'Maria',
    })
  })

  it('needs a name', () => {
    expect(parseRegisterDevice({ id: 'dev-1', label: 'iPhone' })).toBeNull()
    expect(parseRegisterDevice({ id: 'dev-1', label: 'iPhone', name: '   ' })).toBeNull()
    expect(parseDeviceName('x'.repeat(AUDIT_LIMITS.deviceName + 1))).toBeNull()
  })
})
