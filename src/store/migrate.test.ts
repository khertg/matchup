import { describe, expect, it } from 'vitest'
import { createSession } from '@/rotation/engine'
import { migrateSession, SESSION_STORE_VERSION } from './migrate'

describe('migrateSession', () => {
  it('passes a null session through', () => {
    expect(migrateSession(null, 1)).toBeNull()
  })

  it('adds the default game length to a v1 session', () => {
    const { avgGameMinutes: _omit, ...legacy } = createSession('doubles', 2)
    const migrated = migrateSession(legacy as never, 1)
    expect(migrated?.avgGameMinutes).toBe(12)
    expect(migrated?.courts).toHaveLength(2)
  })

  it('leaves a current session untouched', () => {
    const session = createSession('singles', 3, 20)
    expect(migrateSession(session, SESSION_STORE_VERSION)).toEqual(session)
  })
})
