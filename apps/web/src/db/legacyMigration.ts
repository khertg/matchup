import Dexie from 'dexie'

/**
 * The app used to be called Matchup and kept the roster, saved sessions and settings in an
 * IndexedDB database named `matchup`. It is now Q2Dink (`q2dink`), and browsers cannot rename a
 * database, so on the first launch after the rename this copies everything across and removes the old
 * one. Nobody loses their roster, history, avatars or totals.
 *
 * This file is the one place the old name may still appear.
 */

export const LEGACY_DB_NAME = 'matchup'
const DONE_KEY = 'legacyMigrated'
const TABLES = ['players', 'sessions', 'history', 'settings'] as const

export type LegacyResult = 'none' | 'migrated' | 'already' | 'failed'

/**
 * Copy the old database into `target` and delete it. Safe to repeat and to interrupt:
 * - rows are copied by their own ids, and a row the new database already has is left as it is;
 * - "done" is written last, and the old database is deleted only after that;
 * - any failure leaves the old database untouched and the app running.
 * Runs inside Dexie's `ready` hook, so the app's first queries wait for it.
 */
export async function migrateLegacyDatabase(target: Dexie): Promise<LegacyResult> {
  try {
    if (!(await Dexie.exists(LEGACY_DB_NAME))) return 'none'

    const done = (await target.table('settings').get(DONE_KEY))?.value === true
    if (!done) {
      const legacy = new Dexie(LEGACY_DB_NAME)
      try {
        await legacy.open() // no schema given: it opens the database as it was made
        for (const name of TABLES) {
          if (!legacy.tables.some((table) => table.name === name)) continue
          const rows = (await legacy.table(name).toArray()) as Record<string, unknown>[]
          const destination = target.table(name)
          const keyPath = destination.schema.primKey.keyPath as string
          const existing = new Set(await destination.toCollection().primaryKeys())
          const fresh = rows.filter((row) => !existing.has(row[keyPath] as never))
          if (fresh.length > 0) await destination.bulkPut(fresh)
        }
        await target.table('settings').put({ key: DONE_KEY, value: true })
      } finally {
        legacy.close()
      }
    }
    await Dexie.delete(LEGACY_DB_NAME)
    return done ? 'already' : 'migrated'
  } catch (error) {
    console.warn('Could not move the saved data from the old database yet; it is kept and will be tried again.', error)
    return 'failed'
  }
}
