import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import type {
  AnalyticsEvent,
  AuditEvent,
  Did,
  EcosystemResource,
  MonetizationEntry,
  ResourceKind,
} from '../../../../src/lib/ecosystem/types.ts';

export class EcosystemError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 429 | 503,
    message: string,
  ) {
    super(message);
  }
}
export interface EcosystemStore {
  list(kind: ResourceKind): Promise<EcosystemResource[]>;
  get(id: string): Promise<EcosystemResource | undefined>;
  find(
    kind: ResourceKind,
    owner: Did,
    slug: string,
  ): Promise<EcosystemResource | undefined>;
  create(resource: EcosystemResource, actor: Did): Promise<void>;
  mutate(
    id: string,
    actor: Did,
    action: string,
    expectedRevision: number | undefined,
    change: (r: EcosystemResource) => void,
  ): Promise<EcosystemResource>;
  consent(did: Did, enabled?: boolean): Promise<boolean>;
  record(owner: Did, event: AnalyticsEvent): Promise<void>;
  analytics(
    owner: Did,
  ): Promise<{ event: string; count: number; durationMs: number }[]>;
  ledger(owner: Did): Promise<MonetizationEntry[]>;
  audit(id: string): Promise<AuditEvent[]>;
}
const eventFor = (
  actorDid: Did,
  resourceId: string,
  action: string,
): AuditEvent => ({
  id: randomUUID(),
  actorDid,
  resourceId,
  action,
  timestamp: new Date().toISOString(),
});
/** ONLY for explicit tests; server startup never falls back to memory. */
export function createTestEcosystemStore(): EcosystemStore {
  const resources = new Map<string, EcosystemResource>();
  const consents = new Map<Did, boolean>();
  const events = new Map<string, { owner: Did; event: AnalyticsEvent }>();
  const audits: AuditEvent[] = [];
  return {
    async list(kind) {
      return structuredClone(
        [...resources.values()].filter(r => r.kind === kind).slice(0, 200),
      );
    },
    async get(id) {
      return structuredClone(resources.get(id));
    },
    async find(kind, owner, slug) {
      return structuredClone(
        [...resources.values()].find(
          r => r.kind === kind && r.ownerDid === owner && r.slug === slug,
        ),
      );
    },
    async create(r, actor) {
      if (
        [...resources.values()].some(
          x =>
            x.kind === r.kind && x.ownerDid === r.ownerDid && x.slug === r.slug,
        )
      )
        throw new EcosystemError(409, 'Slug já utilizado');
      resources.set(r.id, structuredClone(r));
      audits.push(eventFor(actor, r.id, 'create'));
    },
    async mutate(id, actor, action, revision, change) {
      const current = resources.get(id);
      if (!current) throw new EcosystemError(404, 'Recurso não encontrado');
      if (revision !== undefined && current.revision !== revision)
        throw new EcosystemError(409, 'Recurso mudou; atualize a página');
      const next = structuredClone(current);
      change(next);
      next.revision++;
      next.updatedAt = new Date().toISOString();
      resources.set(id, next);
      audits.push(eventFor(actor, id, action));
      return structuredClone(next);
    },
    async consent(did, enabled) {
      if (enabled !== undefined) consents.set(did, enabled);
      return consents.get(did) ?? false;
    },
    async record(owner, event) {
      if (!events.has(event.id))
        events.set(event.id, { owner, event: structuredClone(event) });
    },
    async analytics(owner) {
      const counts = new Map<
        string,
        { event: string; count: number; durationMs: number }
      >();
      for (const x of events.values())
        if (x.owner === owner) {
          const n = counts.get(x.event.event) ?? {
            event: x.event.event,
            count: 0,
            durationMs: 0,
          };
          n.count++;
          n.durationMs += x.event.context.durationMs ?? 0;
          counts.set(n.event, n);
        }
      return [...counts.values()];
    },
    async ledger() {
      return [];
    },
    async audit(id) {
      return audits.filter(a => a.resourceId === id).map(a => ({ ...a }));
    },
  };
}

export async function migrateEcosystem(pool: pg.Pool) {
  const sql = await readFile(
    new URL('../../migrations/001_ecosystem.sql', import.meta.url),
    'utf8',
  );
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(802111)');
    await client.query(sql);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
export function createPgEcosystemStore(pool: pg.Pool): EcosystemStore {
  const audit = async (
    client: pg.PoolClient,
    actor: Did,
    id: string,
    action: string,
  ) => {
    await client.query(
      'insert into aqua.ecosystem_audit(id, actor_did, resource_id, action) values ($1,$2,$3,$4)',
      [randomUUID(), actor, id, action],
    );
  };
  return {
    async list(kind) {
      const q = await pool.query(
        'select document from aqua.ecosystem_resources where kind=$1 order by id limit 200',
        [kind],
      );
      return q.rows.map(r => r.document);
    },
    async get(id) {
      const q = await pool.query(
        'select document from aqua.ecosystem_resources where id=$1',
        [id],
      );
      return q.rows[0]?.document;
    },
    async find(kind, owner, slug) {
      const q = await pool.query(
        'select document from aqua.ecosystem_resources where kind=$1 and owner_did=$2 and slug=$3',
        [kind, owner, slug],
      );
      return q.rows[0]?.document;
    },
    async create(r, actor) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'insert into aqua.ecosystem_resources(id,kind,owner_did,slug,revision,document) values ($1,$2,$3,$4,$5,$6)',
          [r.id, r.kind, r.ownerDid, r.slug, r.revision, r],
        );
        await audit(client, actor, r.id, 'create');
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        if ((e as { code?: string }).code === '23505')
          throw new EcosystemError(409, 'Slug já utilizado');
        throw e;
      } finally {
        client.release();
      }
    },
    async mutate(id, actor, action, revision, change) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const q = await client.query(
          'select document from aqua.ecosystem_resources where id=$1 for update',
          [id],
        );
        const r: EcosystemResource | undefined = q.rows[0]?.document;
        if (!r) throw new EcosystemError(404, 'Recurso não encontrado');
        if (revision !== undefined && r.revision !== revision)
          throw new EcosystemError(409, 'Recurso mudou; atualize a página');
        change(r);
        r.revision++;
        r.updatedAt = new Date().toISOString();
        await client.query(
          'update aqua.ecosystem_resources set revision=$2, document=$3 where id=$1',
          [id, r.revision, r],
        );
        await audit(client, actor, id, action);
        await client.query('COMMIT');
        return r;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    async consent(did, enabled) {
      if (enabled !== undefined)
        await pool.query(
          'insert into aqua.ecosystem_consent(did,analytics) values ($1,$2) on conflict(did) do update set analytics=$2',
          [did, enabled],
        );
      const q = await pool.query(
        'select analytics from aqua.ecosystem_consent where did=$1',
        [did],
      );
      return q.rows[0]?.analytics ?? false;
    },
    async record(owner, event) {
      await pool.query(
        'insert into aqua.ecosystem_events(id,owner_did,resource_id,event,context) values ($1,$2,$3,$4,$5) on conflict do nothing',
        [event.id, owner, event.resourceId, event.event, event.context],
      );
    },
    async analytics(owner) {
      const q = await pool.query(
        "select event, count(*)::int as count, coalesce(sum((context->>'durationMs')::bigint),0)::text as duration from aqua.ecosystem_events where owner_did=$1 and timestamp > now()-interval '30 days' group by event",
        [owner],
      );
      return q.rows.map(r => ({
        event: r.event,
        count: r.count,
        durationMs: Number(r.duration),
      }));
    },
    async ledger(owner) {
      const q = await pool.query(
        'select id,owner_did,source_type,source_id,gross::text,fees::text,net::text,currency,status,created_at from aqua.ecosystem_ledger where owner_did=$1 order by created_at desc limit 200',
        [owner],
      );
      return q.rows.map(r => ({
        id: r.id,
        ownerDid: r.owner_did,
        sourceType: r.source_type,
        sourceId: r.source_id,
        gross: Number(r.gross),
        fees: Number(r.fees),
        net: Number(r.net),
        currency: r.currency,
        status: r.status,
        createdAt: r.created_at.toISOString(),
      }));
    },
    async audit(id) {
      const q = await pool.query(
        'select id,actor_did,action,resource_id,timestamp from aqua.ecosystem_audit where resource_id=$1 order by timestamp desc limit 100',
        [id],
      );
      return q.rows.map(r => ({
        id: r.id,
        actorDid: r.actor_did,
        action: r.action,
        resourceId: r.resource_id,
        timestamp: r.timestamp.toISOString(),
      }));
    },
  };
}
