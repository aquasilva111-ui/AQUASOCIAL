// Armazenamento dos pedidos da Aqua Shops (esquema próprio "aqua" no Postgres, separado das
// tabelas do Mercur). Uma versão em memória serve para os testes.
import pg from 'pg';
import type { OrderStatus } from '../../../aqua-shops/shared/types/index.ts';
import type { ShopPaymentConnection } from './connections.ts';

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
  /** Loja dona do pedido (um pedido por loja). Só o webhook desta loja pode mexer nele. */
  shopId: string;
  buyer: Buyer;
  items: OrderItem[];
  totalCents: number;
  /** Carrinho criado no Mercur antes da cobrança; é finalizado quando o Pix for pago. */
  mercurCartId: string;
  /** Frete total incluído no valor cobrado, em centavos. */
  shippingCents: number;
  /** Provedor da loja que cobrou (asaas, mercadopago...) e o id da cobrança lá. */
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
  /** Conexão da loja com um provedor (credencial e segredo de webhook cifrados). */
  getConnection(shopId: string, provider: string): Promise<ShopPaymentConnection | null>;
  listConnections(shopId: string): Promise<ShopPaymentConnection[]>;
  /** Cria ou troca a conexão da loja naquele provedor. */
  saveConnection(connection: ShopPaymentConnection): Promise<void>;
}

export function createMemoryStore(): OrderStore {
  const orders = new Map<string, StoredOrder>();
  const events = new Set<string>();
  const connections = new Map<string, ShopPaymentConnection>(); // chave: loja|provedor
  const key = (shopId: string, provider: string) => `${shopId}|${provider}`;
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
    async getConnection(shopId, provider) {
      const c = connections.get(key(shopId, provider));
      return c ? structuredClone(c) : null;
    },
    async listConnections(shopId) {
      return [...connections.values()].filter(c => c.shopId === shopId).map(c => structuredClone(c));
    },
    async saveConnection(connection) {
      connections.set(key(connection.shopId, connection.provider), structuredClone(connection));
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
-- Modelo antigo (split): um recebedor por vendedor. Substituído pela conexão de cada loja com o
-- PRÓPRIO provedor. Nunca rodou com vendedor real.
drop table if exists aqua.seller_wallets;
create table if not exists aqua.shop_payment_connections (
  shop_id text not null,
  provider text not null,
  account_id text,
  credential_enc text not null,
  webhook_secret_enc text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (shop_id, provider)
);
-- Estados antigos do pedido: vencido vira cancelado; pago-mas-sem-entrega continua pago (com o motivo em data.failure).
update aqua.orders set status = 'awaiting_payment' where status = 'pending_payment';
update aqua.orders set status = 'cancelled' where status = 'expired';
update aqua.orders set status = 'paid' where status = 'failed';
`;

type OrderRow = {
  id: string;
  number: string;
  status: OrderStatus;
  data: Omit<StoredOrder, 'id' | 'number' | 'status' | 'paymentProvider' | 'paymentId'>;
  payment_provider: string;
  payment_id: string;
};

type ConnectionRow = {
  shop_id: string;
  provider: string;
  account_id: string | null;
  credential_enc: string;
  webhook_secret_enc: string;
  created_at: Date;
};

const rowToConnection = (r: ConnectionRow): ShopPaymentConnection => ({
  shopId: r.shop_id,
  provider: r.provider,
  ...(r.account_id ? { accountId: r.account_id } : {}),
  credentialEnc: r.credential_enc,
  webhookSecretEnc: r.webhook_secret_enc,
  createdAt: r.created_at.toISOString(),
});

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
    async getConnection(shopId, provider) {
      const { rows } = await pool.query<ConnectionRow>('select * from aqua.shop_payment_connections where shop_id = $1 and provider = $2', [shopId, provider]);
      return rows[0] ? rowToConnection(rows[0]) : null;
    },
    async listConnections(shopId) {
      const { rows } = await pool.query<ConnectionRow>('select * from aqua.shop_payment_connections where shop_id = $1 order by created_at', [shopId]);
      return rows.map(rowToConnection);
    },
    async saveConnection(c) {
      await pool.query(
        `insert into aqua.shop_payment_connections (shop_id, provider, account_id, credential_enc, webhook_secret_enc)
         values ($1,$2,$3,$4,$5)
         on conflict (shop_id, provider) do update
           set account_id = excluded.account_id, credential_enc = excluded.credential_enc, webhook_secret_enc = excluded.webhook_secret_enc, updated_at = now()`,
        [c.shopId, c.provider, c.accountId ?? null, c.credentialEnc, c.webhookSecretEnc],
      );
    },
    close: () => pool.end(),
  };
}
