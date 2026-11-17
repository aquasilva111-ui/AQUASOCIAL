import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgStore } from '../src/store.ts';

// Roda a migração contra Postgres real: num banco vazio e em bancos com os dois esquemas antigos.
// Cria e apaga os próprios bancos, nunca toca em outro. Rode com: TEST_DATABASE_URL=postgres://... npm test
const url = process.env.TEST_DATABASE_URL;

const OLDEST = `
create schema aqua;
create table aqua.orders (id text primary key, number text not null unique, status text not null, data jsonb not null,
  asaas_payment_id text unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table aqua.webhook_events (event_id text primary key, received_at timestamptz not null default now());
create table aqua.seller_wallets (seller_id text primary key, wallet_id text not null, created_at timestamptz not null default now());
`;

const PROVIDERS = `
create schema aqua;
create table aqua.orders (id text primary key, number text not null unique, status text not null, data jsonb not null,
  payment_provider text not null default 'asaas', payment_id text unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table aqua.webhook_events (event_id text primary key, received_at timestamptz not null default now());
create table aqua.seller_wallets (provider text not null default 'asaas', seller_id text not null, wallet_id text not null,
  created_at timestamptz not null default now(), primary key (provider, seller_id));
`;

describe.skipIf(!url)('migração (Postgres real)', () => {
  const suffix = `${Date.now()}`;
  const names = { empty: `aqua_mig_empty_${suffix}`, oldest: `aqua_mig_oldest_${suffix}`, providers: `aqua_mig_prov_${suffix}` };
  const adminUrl = () => url!;
  const urlFor = (db: string) => {
    const u = new URL(url!);
    u.pathname = `/${db}`;
    return u.toString();
  };
  const withClient = async <T>(connection: string, fn: (c: pg.Client) => Promise<T>) => {
    const c = new pg.Client({ connectionString: connection });
    await c.connect();
    try {
      return await fn(c);
    } finally {
      await c.end();
    }
  };
  const legacyOrder = (id: string, status: string, n: number) => ({
    id,
    number: String(n).padStart(8, '0'),
    status,
    data: JSON.stringify({ buyer: {}, items: [], split: { totalCents: 1000, commissionCents: 200, sellers: [] }, totalCents: 1000, mercurCartId: 'cart', shippingCents: 0, createdAt: '2026-10-01T00:00:00Z' }),
  });

  beforeAll(async () => {
    await withClient(adminUrl(), async c => {
      for (const db of Object.values(names)) await c.query(`create database ${db}`);
    });
    await withClient(urlFor(names.oldest), async c => {
      await c.query(OLDEST);
      await c.query('insert into aqua.orders (id, number, status, data, asaas_payment_id) values ($1,$2,$3,$4,$5)', [...Object.values(legacyOrder('ord_old', 'pending_payment', 1)), 'pay_old']);
      await c.query("insert into aqua.seller_wallets (seller_id, wallet_id) values ('sel_1', 'w1')");
    });
    await withClient(urlFor(names.providers), async c => {
      await c.query(PROVIDERS);
      const rows: Array<[string, string, number, string]> = [
        ['ord_pend', 'pending_payment', 1, 'pay_1'],
        ['ord_exp', 'expired', 2, 'pay_2'],
        ['ord_fail', 'failed', 3, 'pay_3'],
        ['ord_paid', 'paid', 4, 'pay_4'],
        ['ord_canc', 'cancelled', 5, 'pay_5'],
      ];
      for (const [id, status, n, pay] of rows) {
        await c.query('insert into aqua.orders (id, number, status, data, payment_provider, payment_id) values ($1,$2,$3,$4,$5,$6)', [...Object.values(legacyOrder(id, status, n)), 'asaas', pay]);
      }
      await c.query("insert into aqua.seller_wallets (provider, seller_id, wallet_id) values ('asaas', 'sel_1', 'w1')");
      await c.query("insert into aqua.webhook_events (event_id) values ('asaas:evt_1')");
    });
  });

  afterAll(async () => {
    await withClient(adminUrl(), async c => {
      for (const db of Object.values(names)) await c.query(`drop database if exists ${db} with (force)`);
    });
  });

  const tables = (c: pg.Client) =>
    c.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'aqua' order by table_name").then(r => r.rows.map(x => x.table_name));

  it('banco vazio: cria o esquema novo, sem seller_wallets', async () => {
    const store = await createPgStore(urlFor(names.empty));
    await store.close();
    await withClient(urlFor(names.empty), async c => {
      expect(await tables(c)).toEqual(['orders', 'shop_payment_connections', 'webhook_events']);
    });
  });

  it('é idempotente: subir de novo não quebra nem apaga conexões', async () => {
    const first = await createPgStore(urlFor(names.empty));
    await first.saveConnection({ shopId: 's', provider: 'asaas', credentialEnc: 'v1.k.i.t.d', webhookSecretEnc: 'v1.k.i.t.d', createdAt: new Date().toISOString() });
    await first.close();
    const second = await createPgStore(urlFor(names.empty));
    expect(await second.getConnection('s', 'asaas')).not.toBeNull();
    await second.close();
  });

  it('esquema com provedores: troca seller_wallets por shop_payment_connections e renomeia os estados', async () => {
    const store = await createPgStore(urlFor(names.providers));
    const status = async (id: string) => (await store.get(id))?.status;
    expect(await status('ord_pend')).toBe('awaiting_payment');
    expect(await status('ord_exp')).toBe('cancelled');
    expect(await status('ord_fail')).toBe('paid');
    expect(await status('ord_paid')).toBe('paid');
    expect(await status('ord_canc')).toBe('cancelled');
    expect((await store.get('ord_pend'))?.paymentId).toBe('pay_1'); // a cobrança antiga continua ligada
    await store.close();
    await withClient(urlFor(names.providers), async c => {
      expect(await tables(c)).toEqual(['orders', 'shop_payment_connections', 'webhook_events']);
      expect((await c.query('select count(*)::int as n from aqua.webhook_events')).rows[0].n).toBe(1); // eventos preservados
    });
  });

  it('esquema mais antigo (asaas_payment_id, wallets sem provedor): migra sem perder pedidos', async () => {
    const store = await createPgStore(urlFor(names.oldest));
    const order = await store.get('ord_old');
    expect(order?.status).toBe('awaiting_payment');
    expect(order?.paymentId).toBe('pay_old');
    expect(order?.paymentProvider).toBe('asaas');
    await store.close();
    await withClient(urlFor(names.oldest), async c => {
      expect(await tables(c)).toEqual(['orders', 'shop_payment_connections', 'webhook_events']);
    });
  });

  it('migrar duas vezes dá o mesmo resultado', async () => {
    const again = await createPgStore(urlFor(names.providers));
    expect((await again.get('ord_pend'))?.status).toBe('awaiting_payment');
    await again.close();
  });
});
