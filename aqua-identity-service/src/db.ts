import {mkdirSync} from 'node:fs'
import {dirname} from 'node:path'
import {DatabaseSync, type SQLOutputValue} from 'node:sqlite'

export type UserRow = {
  id: string
  did: string | null
  handle: string | null
  password_hash: string | null
  created_at: number
  updated_at: number
}

export type IdentityRow = {
  id: string
  user_id: string
  provider: string
  subject: string
  email: string | null
  created_at: number
}

export type SessionRow = {
  id_hash: string
  user_id: string
  csrf_secret: string
  created_at: number
  expires_at: number
  auth_at: number
}

export type OauthTransactionRow = {
  state: string
  provider: string
  code_verifier: string
  nonce: string | null
  redirect_uri: string
  intent: string
  user_id: string | null
  created_at: number
  expires_at: number
}

export type EmailCodeRow = {
  id: string
  email: string
  code_hash: string
  intent: string
  user_id: string | null
  created_at: number
  expires_at: number
  consumed_at: number | null
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  did TEXT UNIQUE,
  handle TEXT,
  password_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  email TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(provider, subject)
);
CREATE INDEX IF NOT EXISTS identities_user ON identities(user_id);
CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_secret TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  auth_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS oauth_transactions (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  nonce TEXT,
  redirect_uri TEXT NOT NULL,
  intent TEXT NOT NULL,
  user_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS email_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  intent TEXT NOT NULL,
  user_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS email_codes_lookup ON email_codes(email, code_hash);
CREATE TABLE IF NOT EXISTS kv (
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (namespace, key)
);
`

function text(value: SQLOutputValue | undefined): string {
  if (typeof value !== 'string') throw new Error('expected text column')
  return value
}

function textOrNull(value: SQLOutputValue | undefined): string | null {
  if (value == null) return null
  return text(value)
}

function integer(value: SQLOutputValue | undefined): number {
  if (typeof value !== 'number') throw new Error('expected integer column')
  return value
}

function integerOrNull(value: SQLOutputValue | undefined): number | null {
  if (value == null) return null
  return integer(value)
}

function userFrom(row: Record<string, SQLOutputValue>): UserRow {
  return {
    id: text(row.id),
    did: textOrNull(row.did),
    handle: textOrNull(row.handle),
    password_hash: textOrNull(row.password_hash),
    created_at: integer(row.created_at),
    updated_at: integer(row.updated_at),
  }
}

function identityFrom(row: Record<string, SQLOutputValue>): IdentityRow {
  return {
    id: text(row.id),
    user_id: text(row.user_id),
    provider: text(row.provider),
    subject: text(row.subject),
    email: textOrNull(row.email),
    created_at: integer(row.created_at),
  }
}

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), {recursive: true})
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON')
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  migrate(db)
  return db
}

function migrate(db: DatabaseSync) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )`,
  )
  const current = db
    .prepare(
      'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1',
    )
    .get() as Record<string, SQLOutputValue> | undefined
  if (current && integer(current.version) >= 1) return
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(SCHEMA)
    db.prepare(
      'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
    ).run(1, Date.now())
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function withTransaction<T>(db: DatabaseSync, run: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = run()
    db.exec('COMMIT')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // The transaction is already closed.
    }
    throw error
  }
}

export function isUniqueError(error: unknown): boolean {
  return (
    error instanceof Error && /UNIQUE constraint failed/i.test(error.message)
  )
}

export function findUser(db: DatabaseSync, id: string): UserRow | undefined {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
    | Record<string, SQLOutputValue>
    | undefined
  return row ? userFrom(row) : undefined
}

export function findUserByDid(
  db: DatabaseSync,
  did: string,
): UserRow | undefined {
  const row = db.prepare('SELECT * FROM users WHERE did = ?').get(did) as
    | Record<string, SQLOutputValue>
    | undefined
  return row ? userFrom(row) : undefined
}

export function insertUser(
  db: DatabaseSync,
  input: {
    id: string
    did: string | null
    handle: string | null
    passwordHash: string | null
    now: number
  },
) {
  db.prepare(
    `INSERT INTO users (id, did, handle, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.did,
    input.handle,
    input.passwordHash,
    input.now,
    input.now,
  )
}

export function setUserDid(
  db: DatabaseSync,
  userId: string,
  did: string,
  now: number,
) {
  db.prepare('UPDATE users SET did = ?, updated_at = ? WHERE id = ?').run(
    did,
    now,
    userId,
  )
}

export function setUserHandle(
  db: DatabaseSync,
  userId: string,
  handle: string,
  now: number,
) {
  db.prepare('UPDATE users SET handle = ?, updated_at = ? WHERE id = ?').run(
    handle,
    now,
    userId,
  )
}

export function setPasswordHash(
  db: DatabaseSync,
  userId: string,
  passwordHash: string | null,
  now: number,
) {
  db.prepare(
    'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
  ).run(passwordHash, now, userId)
}

export function findIdentity(
  db: DatabaseSync,
  provider: string,
  subject: string,
): IdentityRow | undefined {
  const row = db
    .prepare('SELECT * FROM identities WHERE provider = ? AND subject = ?')
    .get(provider, subject) as Record<string, SQLOutputValue> | undefined
  return row ? identityFrom(row) : undefined
}

export function listIdentities(
  db: DatabaseSync,
  userId: string,
): IdentityRow[] {
  const rows = db
    .prepare(
      'SELECT * FROM identities WHERE user_id = ? ORDER BY created_at, rowid',
    )
    .all(userId) as Record<string, SQLOutputValue>[]
  return rows.map(identityFrom)
}

export function insertIdentity(
  db: DatabaseSync,
  input: {
    id: string
    userId: string
    provider: string
    subject: string
    email: string | null
    now: number
  },
) {
  db.prepare(
    `INSERT INTO identities (id, user_id, provider, subject, email, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.userId,
    input.provider,
    input.subject,
    input.email,
    input.now,
  )
}

export function deleteIdentity(db: DatabaseSync, id: string) {
  db.prepare('DELETE FROM identities WHERE id = ?').run(id)
}

export function insertSession(
  db: DatabaseSync,
  input: {
    idHash: string
    userId: string
    csrfSecret: string
    now: number
    expiresAt: number
  },
) {
  db.prepare(
    `INSERT INTO sessions (id_hash, user_id, csrf_secret, created_at, expires_at, auth_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    input.idHash,
    input.userId,
    input.csrfSecret,
    input.now,
    input.expiresAt,
    input.now,
  )
}

export function findSession(
  db: DatabaseSync,
  idHash: string,
): SessionRow | undefined {
  const row = db
    .prepare('SELECT * FROM sessions WHERE id_hash = ?')
    .get(idHash) as Record<string, SQLOutputValue> | undefined
  if (!row) return undefined
  return {
    id_hash: text(row.id_hash),
    user_id: text(row.user_id),
    csrf_secret: text(row.csrf_secret),
    created_at: integer(row.created_at),
    expires_at: integer(row.expires_at),
    auth_at: integer(row.auth_at),
  }
}

export function deleteSession(db: DatabaseSync, idHash: string) {
  db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(idHash)
}

export function insertOauthTransaction(
  db: DatabaseSync,
  input: {
    state: string
    provider: string
    codeVerifier: string
    nonce: string | null
    redirectUri: string
    intent: string
    userId: string | null
    now: number
    expiresAt: number
  },
) {
  db.prepare(
    `INSERT INTO oauth_transactions
      (state, provider, code_verifier, nonce, redirect_uri, intent, user_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.state,
    input.provider,
    input.codeVerifier,
    input.nonce,
    input.redirectUri,
    input.intent,
    input.userId,
    input.now,
    input.expiresAt,
  )
}

export function takeOauthTransaction(
  db: DatabaseSync,
  state: string,
  now: number,
):
  | {ok: true; row: OauthTransactionRow}
  | {ok: false; reason: 'state-mismatch' | 'state-expired'} {
  return withTransaction(db, () => {
    const row = db
      .prepare('SELECT * FROM oauth_transactions WHERE state = ?')
      .get(state) as Record<string, SQLOutputValue> | undefined
    if (!row) return {ok: false as const, reason: 'state-mismatch' as const}
    db.prepare('DELETE FROM oauth_transactions WHERE state = ?').run(state)
    const parsed: OauthTransactionRow = {
      state: text(row.state),
      provider: text(row.provider),
      code_verifier: text(row.code_verifier),
      nonce: textOrNull(row.nonce),
      redirect_uri: text(row.redirect_uri),
      intent: text(row.intent),
      user_id: textOrNull(row.user_id),
      created_at: integer(row.created_at),
      expires_at: integer(row.expires_at),
    }
    if (parsed.expires_at <= now) {
      return {ok: false as const, reason: 'state-expired' as const}
    }
    return {ok: true as const, row: parsed}
  })
}

export function insertEmailCode(
  db: DatabaseSync,
  input: {
    id: string
    email: string
    codeHash: string
    intent: string
    userId: string | null
    now: number
    expiresAt: number
  },
) {
  withTransaction(db, () => {
    db.prepare(
      'UPDATE email_codes SET consumed_at = ? WHERE email = ? AND consumed_at IS NULL',
    ).run(input.now, input.email)
    db.prepare(
      `INSERT INTO email_codes
        (id, email, code_hash, intent, user_id, created_at, expires_at, consumed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    ).run(
      input.id,
      input.email,
      input.codeHash,
      input.intent,
      input.userId,
      input.now,
      input.expiresAt,
    )
  })
}

export function takeEmailCode(
  db: DatabaseSync,
  email: string,
  codeHash: string,
  now: number,
): EmailCodeRow | undefined {
  return withTransaction(db, () => {
    const row = db
      .prepare(
        `SELECT * FROM email_codes
         WHERE email = ? AND code_hash = ? AND consumed_at IS NULL AND expires_at > ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(email, codeHash, now) as Record<string, SQLOutputValue> | undefined
    if (!row) return undefined
    const parsed: EmailCodeRow = {
      id: text(row.id),
      email: text(row.email),
      code_hash: text(row.code_hash),
      intent: text(row.intent),
      user_id: textOrNull(row.user_id),
      created_at: integer(row.created_at),
      expires_at: integer(row.expires_at),
      consumed_at: integerOrNull(row.consumed_at),
    }
    db.prepare('UPDATE email_codes SET consumed_at = ? WHERE id = ?').run(
      now,
      parsed.id,
    )
    return parsed
  })
}

export function sqliteKv(db: DatabaseSync, namespace: string) {
  return {
    async set(key: string, value: unknown) {
      db.prepare(
        `INSERT INTO kv (namespace, key, value) VALUES (?, ?, ?)
         ON CONFLICT(namespace, key) DO UPDATE SET value = excluded.value`,
      ).run(namespace, key, JSON.stringify(value))
    },
    async get(key: string) {
      const row = db
        .prepare('SELECT value FROM kv WHERE namespace = ? AND key = ?')
        .get(namespace, key) as Record<string, SQLOutputValue> | undefined
      if (!row) return undefined
      return JSON.parse(text(row.value)) as unknown
    },
    async del(key: string) {
      db.prepare('DELETE FROM kv WHERE namespace = ? AND key = ?').run(
        namespace,
        key,
      )
    },
  }
}
