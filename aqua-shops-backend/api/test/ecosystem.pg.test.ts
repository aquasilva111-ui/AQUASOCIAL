import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPgEcosystemStore,
  migrateEcosystem,
} from '../src/ecosystem/store.ts';
import { initialResource } from '../src/ecosystem/validation.ts';
import type { Did } from '../../../src/lib/ecosystem/types.ts';
const owner: Did = 'did:plc:database-owner';

// Actual PostgreSQL SQL engine in WASM. Native pg protocol coverage remains separately optional.
describe('Ecosystem PostgreSQL migration and persistence (PGlite)', () => {
  let db: PGlite;
  let pool: pg.Pool;
  let store: ReturnType<typeof createPgEcosystemStore>;
  beforeAll(async () => {
    db = new PGlite();
    const query = async (sql: string, params?: unknown[]) => {
      if (!params && sql.includes(';')) {
        const result = await db.exec(sql);
        return result.at(-1) ?? { rows: [] };
      }
      return db.query(sql, params);
    };
    pool = {
      query,
      connect: async () => ({ query, release: () => {} }),
    } as unknown as pg.Pool;
    await migrateEcosystem(pool);
    store = createPgEcosystemStore(pool);
  }, 30000);
  afterAll(async () => {
    await db?.close();
  });
  it('applies the versioned migration twice without dropping data', async () => {
    const r = initialResource(
      { kind: 'portal', name: 'Knowledge', slug: 'knowledge' },
      owner,
      [],
    );
    await store.create(r, owner);
    await migrateEcosystem(pool);
    expect(await store.get(r.id)).toEqual(r);
    expect(
      (await db.query('select id from aqua.ecosystem_migrations')).rows,
    ).toEqual([{ id: '001_ecosystem' }]);
  });
  it('commits resource and audit atomically, and rolls back failed mutations', async () => {
    const r = initialResource(
      { kind: 'community', name: 'People', slug: 'people' },
      owner,
      [],
    );
    await store.create(r, owner);
    const next = await store.mutate(r.id, owner, 'rename', 1, r => {
      r.name = 'New title';
    });
    expect(next.revision).toBe(2);
    await expect(
      store.mutate(r.id, owner, 'invalid', 2, r => {
        r.name = 'Lost title';
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    expect((await store.get(r.id))?.name).toBe('New title');
    expect(await store.audit(r.id)).toHaveLength(2);
    await expect(
      store.mutate(r.id, owner, 'stale', 1, () => {}),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('protects duplicate owner-scoped slugs and records consent durably', async () => {
    const r = initialResource(
      { kind: 'portal', name: 'Reference', slug: 'unique' },
      owner,
      [],
    );
    await store.create(r, owner);
    await expect(
      store.create({ ...r, id: randomUUID() }, owner),
    ).rejects.toMatchObject({ status: 409 });
    expect(await store.consent(owner)).toBe(false);
    expect(await store.consent(owner, true)).toBe(true);
    expect(await store.consent(owner)).toBe(true);
  });
  it('aggregates idempotent events by resource owner, not visitor identity', async () => {
    const r = initialResource(
      { kind: 'portal', name: 'Stats', slug: 'stats' },
      owner,
      [],
    );
    await store.create(r, owner);
    const e = {
      id: randomUUID(),
      event: 'watch_time' as const,
      resourceId: r.id,
      resourceType: 'portal',
      context: { durationMs: 1000 },
      timestamp: new Date().toISOString(),
    };
    await store.record(owner, e);
    await store.record(owner, e);
    expect(await store.analytics(owner)).toEqual([
      { event: 'watch_time', count: 1, durationMs: 1000 },
    ]);
    expect(await store.analytics('did:plc:unrelated')).toEqual([]);
    expect(
      (
        await db.query(
          "select column_name from information_schema.columns where table_schema='aqua' and table_name='ecosystem_events' and column_name='actor_did'",
        )
      ).rows,
    ).toHaveLength(0);
  });
  it('enforces monetary invariants and isolates ledger reads by DID', async () => {
    const id = randomUUID();
    await db.query(
      "insert into aqua.ecosystem_ledger(id,owner_did,source_type,source_id,gross,fees,net,currency,status) values ($1,$2,'shop','order',1000,100,900,'BRL','pending')",
      [id, owner],
    );
    expect((await store.ledger(owner))[0]).toMatchObject({
      id,
      gross: 1000,
      fees: 100,
      net: 900,
      currency: 'BRL',
    });
    expect(await store.ledger('did:plc:other')).toEqual([]);
    await expect(
      db.query(
        "insert into aqua.ecosystem_ledger(id,owner_did,source_type,source_id,gross,fees,net,currency,status) values ($1,$2,'shop','invalid',1000,100,999,'BRL','pending')",
        [randomUUID(), owner],
      ),
    ).rejects.toThrow();
  });
});
