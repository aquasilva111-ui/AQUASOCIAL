import {mkdir, readdir, readFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

export type Row = Record<string, any>

export interface Queryable {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>
}

export interface Db extends Queryable {
  /** Runs `fn` in one transaction; any throw rolls everything back. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>
  close(): Promise<void>
}

/** Embedded Postgres (PGlite) for development and tests. */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const {PGlite} = await import('@electric-sql/pglite')
  if (dataDir) await mkdir(dataDir, {recursive: true})
  const pg = new PGlite(dataDir)
  await pg.waitReady
  const wrap = (q: {
    query: (sql: string, params?: unknown[]) => Promise<{rows: unknown[]}>
  }): Queryable => ({
    async query<T extends Row>(sql: string, params?: unknown[]) {
      const res = await q.query(sql, params)
      return res.rows as T[]
    },
  })
  return {
    ...wrap(pg),
    transaction: fn => pg.transaction(tx => fn(wrap(tx))),
    close: () => pg.close(),
  }
}

/** Real Postgres for production (same SQL, same migrations). */
export async function createPgDb(url: string): Promise<Db> {
  const {default: pg} = await import('pg')
  // BIGINT money columns come back as strings by default; keep them exact.
  const pool = new pg.Pool({connectionString: url})
  return {
    async query<T extends Row>(sql: string, params?: unknown[]) {
      return (await pool.query(sql, params as any[])).rows as T[]
    },
    async transaction(fn) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await fn({
          async query<T extends Row>(sql: string, params?: unknown[]) {
            return (await client.query(sql, params as any[])).rows as T[]
          },
        })
        await client.query('COMMIT')
        return result
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  'migrations',
)

/** Forward-only migrations; each file runs once, inside a transaction. */
export async function migrate(db: Db): Promise<string[]> {
  await db.query(`create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`)
  const done = new Set(
    (await db.query<{name: string}>('select name from schema_migrations')).map(
      r => r.name,
    ),
  )
  const files = (await readdir(MIGRATIONS_DIR))
    .filter(f => f.endsWith('.sql'))
    .sort()
  const applied: string[] = []
  for (const file of files) {
    if (done.has(file)) continue
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8')
    await db.transaction(async tx => {
      for (const statement of splitSql(sql)) await tx.query(statement)
      await tx.query('insert into schema_migrations (name) values ($1)', [file])
    })
    applied.push(file)
  }
  return applied
}

/** Splits on `;` at line ends, keeping $$-quoted function bodies intact. */
function splitSql(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let inDollar = false
  for (const line of sql.split('\n')) {
    if (line.trim().startsWith('--') && !inDollar) continue
    current += line + '\n'
    const dollars = line.split('$$').length - 1
    if (dollars % 2 === 1) inDollar = !inDollar
    if (!inDollar && line.trimEnd().endsWith(';')) {
      statements.push(current.trim())
      current = ''
    }
  }
  if (current.trim()) statements.push(current.trim())
  return statements
}
