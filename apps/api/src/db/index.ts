import pg from 'pg'

export interface QueryResult<T> {
  rows: T[]
  /** Rows returned, or rows affected for INSERT/UPDATE/DELETE without RETURNING. */
  rowCount: number
}

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>
  /** Run one or more statements with no parameters (used by migrations). */
  exec(sql: string): Promise<void>
}

export interface Db extends Queryable {
  /** Everything inside `fn` commits together, or rolls back if it throws. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>
  close(): Promise<void>
}

// ---- Postgres ---------------------------------------------------------------

function fromPgClient(client: pg.Pool | pg.PoolClient): Queryable {
  return {
    async query<T>(sql: string, params?: unknown[]) {
      const result = await client.query(sql, params as unknown[] | undefined)
      return { rows: result.rows as T[], rowCount: result.rowCount ?? result.rows.length }
    },
    async exec(sql: string) {
      await client.query(sql)
    },
  }
}

function connectPostgres(url: string): Db {
  const pool = new pg.Pool({ connectionString: url, max: 10 })
  return {
    ...fromPgClient(pool),
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      const client = await pool.connect()
      try {
        await client.query('begin')
        const result = await fn(fromPgClient(client))
        await client.query('commit')
        return result
      } catch (error) {
        await client.query('rollback').catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

// ---- PGlite (embedded Postgres for development and tests) --------------------

interface PgliteLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; affectedRows?: number }>
  exec(sql: string): Promise<unknown>
  transaction<T>(fn: (tx: PgliteLike) => Promise<T>): Promise<T>
  close(): Promise<void>
}

function fromPglite(client: PgliteLike): Queryable {
  return {
    async query<T>(sql: string, params?: unknown[]) {
      const result = await client.query(sql, params)
      return { rows: result.rows as T[], rowCount: result.affectedRows || result.rows.length }
    },
    async exec(sql: string) {
      await client.exec(sql)
    },
  }
}

async function connectPglite(url: string): Promise<Db> {
  // Loaded only when needed so production images never touch it.
  const { PGlite } = await import('@electric-sql/pglite')
  const location = url.slice('pglite://'.length)
  const client = (await PGlite.create(location === 'memory' ? undefined : location)) as unknown as PgliteLike
  return {
    ...fromPglite(client),
    transaction: (fn) => client.transaction((tx) => fn(fromPglite(tx))),
    close: () => client.close(),
  }
}

/** Connect to Postgres, or to the embedded database for `pglite://` URLs. */
export async function connectDb(url: string): Promise<Db> {
  return url.startsWith('pglite://') ? connectPglite(url) : connectPostgres(url)
}
