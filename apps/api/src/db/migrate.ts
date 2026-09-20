import type { Db } from './index'
import { MIGRATIONS, type Migration } from './migrations'

/** Arbitrary constant so concurrent server starts apply migrations one at a time. */
const LOCK_KEY = 727_001

/** Apply any migrations that have not run yet. Safe to call on every start. */
export async function migrate(
  db: Db,
  migrations: Migration[] = MIGRATIONS,
  log: (message: string) => void = () => undefined,
): Promise<string[]> {
  await db.exec(`
    create table if not exists schema_migrations (
      id         text primary key,
      applied_at timestamptz not null default now()
    )
  `)

  const applied: string[] = []
  for (const migration of migrations) {
    await db.transaction(async (tx) => {
      await tx.query('select pg_advisory_xact_lock($1)', [LOCK_KEY])
      const done = await tx.query('select 1 from schema_migrations where id = $1', [migration.id])
      if (done.rowCount > 0) return
      await tx.exec(migration.sql)
      await tx.query('insert into schema_migrations (id) values ($1)', [migration.id])
      applied.push(migration.id)
      log(`applied migration ${migration.id}`)
    })
  }
  return applied
}
