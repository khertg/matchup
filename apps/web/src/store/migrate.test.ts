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
      stats: _s,
      ...legacy
    } = createSession('doubles', 2)
    const migrated = migrateSession(legacy as never, 1)
    expect(migrated?.avgGameMinutes).toBe(12)
    expect(migrated?.matchmaking).toBe('balanced')
    expect(migrated?.partners).toEqual([])
    expect(migrated?.lastResult).toEqual({})
    expect(migrated?.stats).toEqual({})
    expect(migrated?.courts).toHaveLength(2)
  })

  it('upgrades a v2 session with the matchmaking defaults', () => {
    const { matchmaking: _m, partners: _p, lastResult: _l, stats: _s, ...v2 } = createSession('doubles', 1)
    const migrated = migrateSession(v2 as never, 2)
    expect(migrated).toMatchObject({ matchmaking: 'balanced', partners: [], lastResult: {}, stats: {} })
  })

  it('names the courts of a v4 session Court <id>, keeping everything else', () => {
    const current = createSession('doubles', 2, { matchmaking: 'skill' })
    const v4 = { ...current, courts: current.courts.map(({ id, teams }) => ({ id, teams })) }
    const migrated = migrateSession(v4 as never, 4)
    expect(migrated?.courts.map((c) => c.name)).toEqual(['Court 1', 'Court 2'])
    expect(migrated?.courts.map((c) => c.id)).toEqual([1, 2])
    expect(migrated?.matchmaking).toBe('skill')
  })

  it('keeps the names of a session that already has them', () => {
    const named = createSession('doubles', 2)
    named.courts[1].name = 'Center Court'
    expect(migrateSession(named, 4)?.courts[1].name).toBe('Center Court')
  })

  it('adds empty stats to a v3 session without touching its other fields', () => {
    const { stats: _s, ...v3 } = createSession('doubles', 1, { matchmaking: 'mixed' })
    const migrated = migrateSession(v3 as never, 3)
    expect(migrated?.stats).toEqual({})
    expect(migrated?.matchmaking).toBe('mixed')
  })

  it('leaves a current session untouched', () => {
    const session = createSession('singles', 3, { avgGameMinutes: 20 })
    expect(migrateSession(session, SESSION_STORE_VERSION)).toEqual(session)
  })
})
