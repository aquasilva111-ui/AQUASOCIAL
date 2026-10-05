import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';
import { createCatalog } from '../src/catalog.ts';
import type { MercurClient } from '../src/mercur.ts';
import { offers, products } from './fixtures.ts';

const mercur = (): MercurClient & { calls: number } => {
  const c = { calls: 0, listAllOffers: async () => (c.calls++, offers), listAllProducts: async () => products };
  return c;
};

describe('API', () => {
  it('lista produtos, busca um e devolve 404 para o que não existe', async () => {
    const app = createApp(createCatalog(mercur()));
    const list = await (await app.request('/products?sort=price_asc')).json();
    expect(list.items).toHaveLength(2);
    const id = encodeURIComponent(list.items[0].id);
    expect((await app.request(`/products/${id}`)).status).toBe(200);
    expect((await app.request('/products/nao-existe')).status).toBe(404);
  });

  it('ignora sort inválido e devolve categorias', async () => {
    const app = createApp(createCatalog(mercur()));
    expect((await app.request('/products?sort=drop-table')).status).toBe(200);
    expect(await (await app.request('/categories')).json()).toEqual([{ id: 'pcat_slides', name: 'Slides' }]);
  });

  it('reaproveita o cache dentro do TTL e recarrega depois', async () => {
    const m = mercur();
    let t = 0;
    const app = createApp(createCatalog(m, 1000, () => t));
    await app.request('/products');
    await app.request('/categories');
    expect(m.calls).toBe(1);
    t = 2000;
    await app.request('/products');
    expect(m.calls).toBe(2);
  });

  it('não guarda erro do Mercur no cache e responde 502', async () => {
    const failing: MercurClient = { listAllOffers: vi.fn().mockRejectedValueOnce(new Error('fora do ar')).mockResolvedValue(offers), listAllProducts: async () => products };
    const app = createApp(createCatalog(failing));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await app.request('/products')).status).toBe(502);
    await new Promise(r => setTimeout(r, 0));
    expect((await app.request('/products')).status).toBe(200);
  });

  it('pedidos respondem 503 quando o pagamento não está configurado', async () => {
    const app = createApp(createCatalog(mercur()));
    expect((await app.request('/orders', { method: 'POST', body: '{}' })).status).toBe(503);
    expect((await app.request('/orders/ord_x')).status).toBe(503);
  });
});
