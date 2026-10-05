import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ProductQuery, SortOrder } from '../../../aqua-shops/shared/types/index.ts';
import { timingSafeEqual } from 'node:crypto';
import type { Catalog } from './catalog.ts';
import { OrderError, type OrdersService } from './orders.ts';

const SORTS: SortOrder[] = ['new', 'price_asc', 'price_desc'];

export interface AppOptions {
  corsOrigins?: string[];
  /** Sem isso (pagamento não configurado) os pedidos respondem 503. */
  orders?: OrdersService;
  /** Token que o Asaas envia no header asaas-access-token. */
  webhookToken?: string;
}

const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function createApp(catalog: Catalog, options: AppOptions = {}) {
  const { corsOrigins = [], orders, webhookToken } = options;
  const app = new Hono();
  if (corsOrigins.length) app.use('*', cors({ origin: corsOrigins }));

  app.get('/health', c => c.json({ ok: true }));

  app.get('/products', async c => {
    const q = c.req.query();
    const query: ProductQuery = {
      cursor: q.cursor,
      search: q.search,
      category: q.category,
      seller: q.seller,
      sort: SORTS.includes(q.sort as SortOrder) ? (q.sort as SortOrder) : 'new',
      limit: q.limit ? Number(q.limit) : undefined,
    };
    return c.json(await catalog.list(query));
  });

  app.get('/products/:id', async c => {
    const product = await catalog.get(c.req.param('id'));
    return product ? c.json(product) : c.json({ message: 'Produto não encontrado' }, 404);
  });

  app.get('/categories', async c => c.json(await catalog.categories()));

  app.post('/orders', async c => {
    if (!orders) return c.json({ message: 'Pagamento não configurado' }, 503);
    const body = await c.req.json().catch(() => undefined);
    return c.json(await orders.create(body), 201);
  });

  // O id do pedido é um UUID aleatório e funciona como segredo de acesso.
  app.get('/orders/:id', async c => {
    if (!orders) return c.json({ message: 'Pagamento não configurado' }, 503);
    const order = await orders.get(c.req.param('id'));
    return order ? c.json(order) : c.json({ message: 'Pedido não encontrado' }, 404);
  });

  app.post('/webhooks/asaas', async c => {
    if (!orders || !webhookToken) return c.json({ message: 'Webhook não configurado' }, 503);
    if (!sameSecret(c.req.header('asaas-access-token') ?? '', webhookToken)) return c.json({ message: 'Não autorizado' }, 401);
    const event = await c.req.json().catch(() => undefined);
    const result = await orders.handleEvent(event ?? {});
    return c.json({ result });
  });

  app.onError((err, c) => {
    if (err instanceof OrderError) return c.json({ message: err.message }, err.status);
    console.error(err);
    return c.json({ message: 'Erro ao falar com o Mercur' }, 502);
  });

  return app;
}
