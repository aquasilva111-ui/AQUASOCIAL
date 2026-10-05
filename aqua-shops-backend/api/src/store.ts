// Armazenamento dos pedidos da Aqua Shops (esquema próprio "aqua" no Postgres, separado das
// tabelas do Mercur). Uma versão em memória serve para os testes.
import pg from 'pg';
import type { OrderStatus } from '../../../aqua-shops/shared/types/index.ts';
import type { SplitResult } from './split.ts';

export interface OrderItem {
  listingId: string;
  title: string;
  quantity: number;
  unitCents: number;
  sellerId: string;
  offerId: string;
  variantId: string;
}

export interface Buyer {
  email: string;
  name: string;
  cpfCnpj: string;
  phone: string;
  city: string;
  address: string;
}

export interface StoredOrder {
  id: string;
  number: string;
  status: OrderStatus;
  buyer: Buyer;
  items: OrderItem[];
  split: SplitResult;
  totalCents: number;
  /** Carrinho criado no Mercur antes da cobrança; é finalizado quando o Pix for pago. */
  mercurCartId: string;
  /** Frete total incluído no valor cobrado, em centavos. */
  shippingCents: number;
  /** Provedor que cobrou (asaas, woovi...) e o id da cobrança lá. */
  paymentProvider: string;
  paymentId: string;
  pixPayload: string;
  pixQrCode: string;
  pixExpiresAt: string;
  mercurOrderGroupId?: string;
  failure?: string;
  createdAt: string;
}

export interface OrderStore {
  insert(order: StoredOrder): Promise<void>;
  get(id: string): Promise<StoredOrder | null>;
  /** Atualiza só os campos informados e devolve o pedido novo. */
  update(id: string, patch: Partial<Pick<StoredOrder, 'status' | 'mercurOrderGroupId' | 'failure'>>): Promise<StoredOrder | null>;
  /** Troca o status só se o atual for `from`. Devolve true se trocou (evita processar duas vezes). */
  transition(id: string, from: OrderStatus, to: OrderStatus): Promise<boolean>;
  /** Registra o id do evento do webhook. Devolve false se já tinha chegado (entrega repetida). */
  recordEvent(eventId: string): Promise<boolean>;
  /** Id do vendedor como recebedor no provedor (carteira Asaas, subconta Woovi...). */
  walletsFor(provider: string, sellerIds: string[]): Promise<Map<string, string>>;
  setWallet(provider: string, sellerId: string, walletId: string): Promise<void>;
}

export function createMemoryStore(): OrderStore {
  const orders = new Map<string, StoredOrder>();
  const events = new Set<string>();
  const wallets = new Map<string, string>(); // chave: provedor|vendedor
  const key = (provider: string, sellerId: string) => `${provider}|${sellerId}`;
  return {
    async insert(o) {
      orders.set(o.id, structuredClone(o));
    },
    async get(id) {
      const o = orders.get(id);
      return o ? structuredClone(o) : null;
    },
    async update(id, patch) {
      const o = orders.get(id);
      if (!o) return null;
      Object.assign(o, patch);
      return structuredClone(o);
    },
    async transition(id, from, to) {
      const o = orders.get(id);
      if (!o || o.status !== from) return false;
      o.status = to;
      return true;
    },
    async recordEvent(eventId) {
      if (events.has(eventId)) return false;
      events.add(eventId);
      return true;
    },
    async walletsFor(provider, ids) {
      return new Map(ids.filter(id => wallets.has(key(provider, id))).map(id => [id, wallets.get(key(provider, id))!]));
    },
    async setWallet(provider, sellerId, walletId) {
      wallets.set(key(provider, sellerId), walletId);
    },
  };
}

const MIGRATION = `
create schema if not exists aqua;
create table if not exists aqua.orders (
  id text primary key,
  number text not null unique,
  status text not null,
  data jsonb not null,
  payment_provider text not null default 'asaas',
  payment_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Bancos criados antes da interface de provedores usavam asaas_payment_id.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'aqua' and table_name = 'orders' and column_name = 'asaas_payment_id') then
    alter table aqua.orders rename column asaas_payment_id to payment_id;
    alter table aqua.orders add column if not exists payment_provider text not null default 'asaas';
  end if;
end $$;
create table if not exists aqua.webhook_events (
  event_id text primary key,
  received_at timestamptz not null default now()
);
create table if not exists aqua.seller_wallets (
  provider text not null default 'asaas',
  seller_id text not null,
  wallet_id text not null,
  created_at timestamptz not null default now(),
  primary key (provider, seller_id)
);
-- Bancos antigos tinham a chave só no vendedor.
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'aqua' and table_name = 'seller_wallets' and column_name = 'provider') then
    alter table aqua.seller_wallets add column provider text not null default 'asaas';
    alter table aqua.seller_wallets drop constraint seller_wallets_pkey;
    alter table aqua.seller_wallets add primary key (provider, seller_id);
  end if;
end $$;
`;

type OrderRow = {
  id: string;
  number: string;
  status: OrderStatus;
  data: Omit<StoredOrder, 'id' | 'number' | 'status' | 'paymentProvider' | 'paymentId'>;
  payment_provider: string;
  payment_id: string;
};

export async function createPgStore(connectionString: string): Promise<OrderStore & { close(): Promise<void> }> {
  const pool = new pg.Pool({ connectionString, max: 5 });
  await pool.query(MIGRATION);

  const rowToOrder = (row: OrderRow): StoredOrder => ({
    ...row.data,
    id: row.id,
    number: row.number,
    status: row.status,
    paymentProvider: row.payment_provider,
    paymentId: row.payment_id,
  });

  const getOrder = async (id: string): Promise<StoredOrder | null> => {
    const { rows } = await pool.query<OrderRow>('select id, number, status, data, payment_provider, payment_id from aqua.orders where id = $1', [id]);
    return rows[0] ? rowToOrder(rows[0]) : null;
  };

  return {
    async insert(o) {
      const { id, number, status, paymentProvider, paymentId, ...data } = o;
      await pool.query('insert into aqua.orders (id, number, status, data, payment_provider, payment_id) values ($1,$2,$3,$4,$5,$6)', [
        id,
        number,
        status,
        JSON.stringify(data),
        paymentProvider,
        paymentId,
      ]);
    },
    get: getOrder,
    async update(id, patch) {
      const current = await getOrder(id);
      if (!current) return null;
      const next = { ...current, ...patch };
      const { id: _i, number: _n, status, paymentProvider: _p, paymentId: _a, ...data } = next;
      await pool.query('update aqua.orders set status = $2, data = $3, updated_at = now() where id = $1', [id, status, JSON.stringify(data)]);
      return next;
    },
    async transition(id, from, to) {
      const res = await pool.query('update aqua.orders set status = $3, updated_at = now() where id = $1 and status = $2', [id, from, to]);
      return (res.rowCount ?? 0) > 0;
    },
    async recordEvent(eventId) {
      const res = await pool.query('insert into aqua.webhook_events (event_id) values ($1) on conflict do nothing', [eventId]);
      return (res.rowCount ?? 0) > 0;
    },
    async walletsFor(provider, ids) {
      if (!ids.length) return new Map();
      const { rows } = await pool.query<{ seller_id: string; wallet_id: string }>('select seller_id, wallet_id from aqua.seller_wallets where provider = $1 and seller_id = any($2)', [provider, ids]);
      return new Map(rows.map(r => [r.seller_id, r.wallet_id]));
    },
    async setWallet(provider, sellerId, walletId) {
      await pool.query('insert into aqua.seller_wallets (provider, seller_id, wallet_id) values ($1,$2,$3) on conflict (provider, seller_id) do update set wallet_id = excluded.wallet_id', [provider, sellerId, walletId]);
    },
    close: () => pool.end(),
  };
}
