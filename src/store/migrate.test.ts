import { describe, expect, it } from 'vitest'
import { createSession } from '@/rotation/engine'
import { migrateSession, SESSION_STORE_VERSION } from './migrate'

describe('migrateSession', () => {
  it('passes a null session through', () => {
    expect(migrateSession(null, 1)).toBeNull()
  })

  it('adds the default game length to a v1 session', () => {
    const {
      avgGameMinutes: _a,
      matchmaking: _m,
      partners: _p,
      lastResult: _l,
      ...legacy
    } = createSession('doubles', 2)
    const migrated = migrateSession(legacy as never, 1)
    expect(migrated?.avgGameMinutes).toBe(12)
    expect(migrated?.matchmaking).toBe('balanced')
    expect(migrated?.partners).toEqual([])
    expect(migrated?.lastResult).toEqual({})
    expect(migrated?.courts).toHaveLength(2)
  })

  it('upgrades a v2 session with the matchmaking defaults', () => {
    const { matchmaking: _m, partners: _p, lastResult: _l, ...v2 } = createSession('doubles', 1)
    const migrated = migrateSession(v2 as never, 2)
    expect(migrated).toMatchObject({ matchmaking: 'balanced', partners: [], lastResult: {} })
  })

  it('leaves a current session untouched', () => {
    const session = createSession('singles', 3, { avgGameMinutes: 20 })
    expect(migrateSession(session, SESSION_STORE_VERSION)).toEqual(session)
  })
})
