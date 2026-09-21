import { describe, expect, it } from 'vitest'
import { LEGACY_STORAGE_KEYS, migrateLegacyStorage } from './legacyStorage'

/** A tiny in-memory localStorage that can be told to fail. */
function fakeStorage(initial: Record<string, string> = {}, { failWrites = false } = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failWrites) throw new Error('quota')
      data.set(key, value)
    },
    removeItem: (key: string) => void data.delete(key),
  }
}

const session = JSON.stringify({ state: { location: 'Sunset Courts', session: { mode: 'doubles' } }, version: 7 })
const club = JSON.stringify({ state: { club: { slug: 'downtown', name: 'Downtown', token: 'tok' }, pendingLifetime: [] }, version: 1 })

describe('migrateLegacyStorage', () => {
  it('moves a running session and the club login to the new keys, and removes the old ones', () => {
    const storage = fakeStorage({ 'matchup-session': session, 'matchup-club': club })
    migrateLegacyStorage(storage)
    expect(storage.data.get('q2dink-session')).toBe(session)
    expect(storage.data.get('q2dink-club')).toBe(club)
    expect(storage.data.has('matchup-session')).toBe(false)
    expect(storage.data.has('matchup-club')).toBe(false)
  })

  it('never overwrites what the new app already saved, and leaves the old value alone', () => {
    const storage = fakeStorage({ 'matchup-session': session, 'q2dink-session': '{"new":true}' })
    migrateLegacyStorage(storage)
    expect(storage.data.get('q2dink-session')).toBe('{"new":true}')
    expect(storage.data.get('matchup-session')).toBe(session)
  })

  it('does nothing on a device that never used the old name, and can run again safely', () => {
    const storage = fakeStorage({ theme: 'dark' })
    migrateLegacyStorage(storage)
    migrateLegacyStorage(storage)
    expect([...storage.data.keys()]).toEqual(['theme'])
  })

  it('migrates each key independently', () => {
    const storage = fakeStorage({ 'matchup-club': club })
    migrateLegacyStorage(storage)
    expect(storage.data.get('q2dink-club')).toBe(club)
    expect(storage.data.has('q2dink-session')).toBe(false)
  })

  it('keeps the old value when the copy cannot be written, and never throws', () => {
    const storage = fakeStorage({ 'matchup-session': session }, { failWrites: true })
    expect(() => migrateLegacyStorage(storage)).not.toThrow()
    expect(storage.data.get('matchup-session')).toBe(session)
  })

  it('does nothing when there is no storage at all', () => {
    expect(() => migrateLegacyStorage(undefined)).not.toThrow()
  })

  it('covers exactly the keys the app used to have', () => {
    expect(LEGACY_STORAGE_KEYS.map(([oldKey]) => oldKey).sort()).toEqual(['matchup-club', 'matchup-session'])
    expect(LEGACY_STORAGE_KEYS.map(([, newKey]) => newKey).sort()).toEqual(['q2dink-club', 'q2dink-session'])
  })
})
