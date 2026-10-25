import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ProductQuery, SortOrder } from '../../../aqua-shops/shared/types/index.ts';
import type { Catalog } from './catalog.ts';
import { OrderError, type OrdersService } from './orders.ts';
import type { Connections } from './connections.ts';

const SORTS: SortOrder[] = ['new', 'price_asc', 'price_desc'];

export interface AppOptions {
  corsOrigins?: string[];
  /** Sem isso (pagamento não configurado) os pedidos respondem 503. */
  orders?: OrdersService;
  /** Conexões das lojas com os provedores; cada loja recebe os webhooks em /webhooks/<provedor>/<shopId>. */
  connections?: Connections;
}

export function createApp(catalog: Catalog, options: AppOptions = {}) {
  const { corsOrigins = [], orders, connections } = options;
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

  // Um webhook por loja e provedor, validado com o segredo daquela loja.
  app.post('/webhooks/:provider/:shopId', async c => {
    if (!orders || !connections) return c.json({ message: 'Webhook não configurado' }, 503);
    const connection = await connections.get(c.req.param('shopId'), c.req.param('provider'));
    if (!connection) return c.json({ message: 'Webhook não configurado' }, 404);
    const raw = await c.req.text();
    if (!connection.provider.verifyWebhook(connection.webhookSecret, name => c.req.header(name), raw)) return c.json({ message: 'Não autorizado' }, 401);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return c.json({ message: 'Corpo inválido' }, 400);
    }
    const event = connection.provider.parseWebhook(body);
    return c.json({ result: event ? await orders.handleEvent(connection.provider.name, connection.shopId, event) : 'ignored' });
  });

  app.onError((err, c) => {
    if (err instanceof OrderError) return c.json({ message: err.message }, err.status);
    console.error(err);
    return c.json({ message: 'Erro ao falar com o Mercur' }, 502);
  });

  return app;
}
