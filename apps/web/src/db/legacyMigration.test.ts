import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { LEGACY_DB_NAME, migrateLegacyDatabase } from './legacyMigration'

/** A database as the app made it before the rename: the same tables, under the old name. */
async function makeLegacy(rows: {
  players?: object[]
  history?: object[]
  settings?: object[]
  sessions?: object[]
}) {
  const legacy = new Dexie(LEGACY_DB_NAME)
  legacy.version(3).stores({
    players: '++id, name',
    sessions: '++id, createdAt',
    history: 'id, endedAt',
    settings: 'key',
  })
  await legacy.open()
  for (const [table, list] of Object.entries(rows)) if (list?.length) await legacy.table(table).bulkAdd(list)
  legacy.close()
}

const legacyExists = () => Dexie.exists(LEGACY_DB_NAME)

beforeEach(async () => {
  await Dexie.delete(LEGACY_DB_NAME)
  await db.open()
  await Promise.all([db.players.clear(), db.history.clear(), db.settings.clear(), db.sessions.clear()])
})

describe('migrateLegacyDatabase', () => {
  it('does nothing on a device that never had the old database', async () => {
    expect(await migrateLegacyDatabase(db)).toBe('none')
    expect(await db.players.count()).toBe(0)
    expect((await db.settings.get('legacyMigrated'))).toBeUndefined()
  })

  it('copies the roster with its ids, totals and avatars, the history and the settings, then removes the old database', async () => {
    await makeLegacy({
      players: [
        { id: 3, name: 'Ann', skill: 4, games: 9, wins: 5, losses: 4, avatar: { kind: 'emoji', value: '🎾', color: '#123456' }, avatarDirty: true },
        { id: 7, name: 'Bob', skill: 2 },
      ],
      history: [{ id: 'abc', location: 'Sunset', endedAt: 5, synced: true }],
      settings: [{ key: 'sharePhotos', value: true }, { key: 'syncClub', value: 'downtown' }],
    })
    expect(await legacyExists()).toBe(true)

    expect(await migrateLegacyDatabase(db)).toBe('migrated')

    expect(await db.players.get(3)).toMatchObject({ name: 'Ann', skill: 4, games: 9, wins: 5, losses: 4, avatarDirty: true })
    expect((await db.players.get(3))?.avatar).toEqual({ kind: 'emoji', value: '🎾', color: '#123456' })
    expect((await db.players.get(7))?.name).toBe('Bob')
    expect((await db.history.get('abc'))?.location).toBe('Sunset')
    expect((await db.settings.get('sharePhotos'))?.value).toBe(true)
    expect((await db.settings.get('syncClub'))?.value).toBe('downtown')
    expect((await db.settings.get('legacyMigrated'))?.value).toBe(true)
    expect(await legacyExists()).toBe(false)
  })

  it('keeps handing out ids after the copied ones, so a new player never reuses an old id', async () => {
    await makeLegacy({ players: [{ id: 3, name: 'Ann', skill: 3 }, { id: 7, name: 'Bob', skill: 3 }] })
    await migrateLegacyDatabase(db)
    const id = await db.players.add({ name: 'Cy', skill: 3 })
    expect(id).toBeGreaterThan(7)
  })

  it('is safe to run again, and finishes deleting an old database that could not be removed the first time', async () => {
    await makeLegacy({ players: [{ id: 1, name: 'Ann', skill: 3 }] })
    await migrateLegacyDatabase(db)
    await db.players.update(1, { name: 'Anne' }) // changed since
    await makeLegacy({ players: [{ id: 1, name: 'Ann', skill: 3 }] }) // the old one came back (deletion had failed)
    expect(await migrateLegacyDatabase(db)).toBe('already')
    expect((await db.players.get(1))?.name).toBe('Anne') // not copied over again
    expect(await legacyExists()).toBe(false)
  })

  it('never overwrites a row the new database already has', async () => {
    await db.players.put({ id: 1, name: 'Anne', skill: 5 })
    await makeLegacy({ players: [{ id: 1, name: 'Ann', skill: 3 }, { id: 2, name: 'Bob', skill: 3 }] })
    await migrateLegacyDatabase(db)
    expect((await db.players.get(1))?.name).toBe('Anne')
    expect((await db.players.get(2))?.name).toBe('Bob')
  })

  it('picks up after an interrupted copy: rows already copied are kept, the rest are added, and the old database is only removed at the end', async () => {
    await makeLegacy({ players: [{ id: 1, name: 'Ann', skill: 3 }, { id: 2, name: 'Bob', skill: 3 }] })
    await db.players.put({ id: 1, name: 'Ann', skill: 3 }) // an earlier run got this far, then stopped
    expect(await legacyExists()).toBe(true)
    expect(await migrateLegacyDatabase(db)).toBe('migrated')
    expect(await db.players.count()).toBe(2)
    expect(await legacyExists()).toBe(false)
  })

  it('leaves the old database alone, and does not throw, when the copy fails', async () => {
    await makeLegacy({ players: [{ id: 1, name: 'Ann', skill: 3 }] })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken = Object.create(db) as typeof db
    Object.defineProperty(broken, 'table', {
      value: () => {
        throw new Error('disk full')
      },
    })
    expect(await migrateLegacyDatabase(broken)).toBe('failed')
    expect(await legacyExists()).toBe(true)
    warn.mockRestore()
    // The next start tries again and succeeds.
    expect(await migrateLegacyDatabase(db)).toBe('migrated')
    expect((await db.players.get(1))?.name).toBe('Ann')
  })

  it('also copes with an old database that predates the settings table', async () => {
    const legacy = new Dexie(LEGACY_DB_NAME)
    legacy.version(2).stores({ players: '++id, name', sessions: '++id, createdAt', history: 'id, endedAt' })
    await legacy.open()
    await legacy.table('players').add({ id: 4, name: 'Old Timer', skill: 3 })
    legacy.close()
    expect(await migrateLegacyDatabase(db)).toBe('migrated')
    expect((await db.players.get(4))?.name).toBe('Old Timer')
  })
})
