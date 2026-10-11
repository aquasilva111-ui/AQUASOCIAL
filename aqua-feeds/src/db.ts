// Mesmo padrão do aqua-adult-api: PGlite (embutido) em dev/testes, Postgres em produção.

export type Row = Record<string, any>

export interface Queryable {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>
}

export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>
  close(): Promise<void>
}

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const {PGlite} = await import('@electric-sql/pglite')
  if (dataDir) {
    const {mkdir} = await import('node:fs/promises')
    await mkdir(dataDir, {recursive: true})
  }
  const pg = new PGlite(dataDir)
  await pg.waitReady
  const wrap = (q: {
    query: (sql: string, params?: unknown[]) => Promise<{rows: unknown[]}>
  }): Queryable => ({
    async query<T extends Row>(sql: string, params?: unknown[]) {
      return (await q.query(sql, params)).rows as T[]
    },
  })
  return {
    ...wrap(pg),
    transaction: fn => pg.transaction(tx => fn(wrap(tx))),
    close: () => pg.close(),
  }
}

export async function createPgDb(url: string): Promise<Db> {
  const {default: pg} = await import('pg')
  const pool = new pg.Pool({connectionString: url})
  return {
    async query<T extends Row>(sql: string, params?: unknown[]) {
      return (await pool.query(sql, params as unknown[])).rows as T[]
    },
    async transaction(fn) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const out = await fn({
          async query<T extends Row>(sql: string, params?: unknown[]) {
            return (await client.query(sql, params as unknown[])).rows as T[]
          },
        })
        await client.query('COMMIT')
        return out
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

/** Migrações só para frente; cada uma roda uma vez, dentro de uma transação. */
const MIGRATIONS: Array<[string, string]> = [
  [
    '001_init',
    `
    create table posts (
      uri text primary key,
      author_did text not null,
      indexed_at timestamptz not null,
      is_reply boolean not null default false,
      langs text[] not null default '{}'
    );
    create index posts_indexed on posts (indexed_at desc);

    -- like / repost / reply. uri é o do próprio registro (para apagar depois).
    create table interactions (
      uri text primary key,
      kind text not null check (kind in ('like', 'repost', 'reply')),
      subject_uri text not null references posts (uri) on delete cascade,
      actor_did text not null,
      created_at timestamptz not null
    );
    create index interactions_subject on interactions (subject_uri);
    create index interactions_created on interactions (created_at);

    create table hot_snapshots (
      id bigint primary key,
      created_at timestamptz not null default now(),
      size int not null
    );
    create table hot_ranks (
      snapshot_id bigint not null references hot_snapshots (id) on delete cascade,
      rank int not null,
      uri text not null,
      primary key (snapshot_id, rank)
    );

    -- posição do Jetstream (time_us) para retomar sem perder eventos
    create table cursor_state (
      service text primary key,
      cursor bigint not null,
      updated_at timestamptz not null default now()
    );
    `,
  ],
  [
    '002_pra_voce',
    `
    -- Convenções de cada post (formato, criador, tags, idioma) e texto para casar palavras
    alter table posts add column conv_keys text[] not null default '{}';
    alter table posts add column media_type text not null default 'text';
    alter table posts add column text_norm text not null default '';

    -- quem usa o "Pra você" (só a atividade dessas contas vira sinal)
    create table viewers (
      did text primary key,
      first_seen timestamptz not null default now(),
      last_seen timestamptz not null default now()
    );

    -- sinais do usuário: curtir, repostar, responder, seguir, salvar, tempo, mais/menos, visto
    create table user_signals (
      id bigserial primary key,
      did text not null,
      kind text not null,
      at timestamptz not null,
      keys text[] not null default '{}',
      subject text,
      seconds real,
      source_uri text unique
    );
    create index user_signals_did_at on user_signals (did, at desc);

    -- ajustes explícitos: adicionar, reforçar, silenciar, apagar, "está errada"
    create table user_adjustments (
      id bigserial primary key,
      did text not null,
      key text not null,
      action text not null,
      factor real,
      note text,
      at timestamptz not null
    );
    create index user_adjustments_did on user_adjustments (did, at);

    -- Git pessoal (histórico das Convenções), pacote exportado do aqua-personal-git
    create table user_repos (
      did text primary key,
      bundle jsonb not null,
      updated_at timestamptz not null default now()
    )
    `,
  ],
]

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
  const applied: string[] = []
  for (const [name, sql] of MIGRATIONS) {
    if (done.has(name)) continue
    await db.transaction(async tx => {
      for (const stmt of sql
        .split(';')
        .map(s => s.trim())
        .filter(Boolean))
        await tx.query(stmt)
      await tx.query('insert into schema_migrations (name) values ($1)', [name])
    })
    applied.push(name)
  }
  return applied
}
