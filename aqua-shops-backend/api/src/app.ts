import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ProductQuery, SortOrder } from '../../../aqua-shops/shared/types/index.ts';
import type { Catalog } from './catalog.ts';

const SORTS: SortOrder[] = ['new', 'price_asc', 'price_desc'];

export function createApp(catalog: Catalog, corsOrigins: string[] = []) {
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

  // Pedidos: o carrinho/checkout do Mercur e o pagamento (Pix com split) vêm no passo 7.
  app.post('/orders', c => c.json({ message: 'Pedidos ainda não implementados na API (passo 7)' }, 501));

  app.onError((err, c) => {
    console.error(err);
    return c.json({ message: 'Erro ao falar com o Mercur' }, 502);
  });

  return app;
}
