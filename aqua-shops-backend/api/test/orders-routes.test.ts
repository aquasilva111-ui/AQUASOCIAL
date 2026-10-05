import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';
import type { Catalog } from '../src/catalog.ts';
import { OrderError, type OrdersService } from '../src/orders.ts';
import { createFakeProvider } from '../src/payments.ts';

const catalog = {} as Catalog;
const service = (): { [K in keyof OrdersService]: ReturnType<typeof vi.fn> } => ({ create: vi.fn(), get: vi.fn(), handleEvent: vi.fn().mockResolvedValue('paid') });
const build = (svc = service()) => ({ svc, app: createApp(catalog, { orders: svc as unknown as OrdersService, providers: [createFakeProvider('segredo-do-webhook')] }) });
const post = (app: ReturnType<typeof build>['app'], path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });

describe('rotas de pedido', () => {
  it('cria pedido (201) e repassa erros de negócio com o status certo', async () => {
    const { app, svc } = build();
    svc.create.mockResolvedValueOnce({ id: 'ord_1' });
    expect((await post(app, '/orders', { items: [] })).status).toBe(201);
    svc.create.mockRejectedValueOnce(new OrderError('Estoque insuficiente', 409));
    const res = await post(app, '/orders', {});
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ message: 'Estoque insuficiente' });
  });

  it('busca pedido ou devolve 404', async () => {
    const { app, svc } = build();
    svc.get.mockResolvedValueOnce({ id: 'ord_1' }).mockResolvedValueOnce(null);
    expect((await app.request('/orders/ord_1')).status).toBe(200);
    expect((await app.request('/orders/ord_2')).status).toBe(404);
  });
});

describe('webhooks por provedor', () => {
  const event = { id: 'e1', orderId: 'ord_1', kind: 'paid' };

  it('recusa sem a autenticação certa e não processa nada', async () => {
    const { app, svc } = build();
    expect((await post(app, '/webhooks/fake', event)).status).toBe(401);
    expect((await post(app, '/webhooks/fake', event, { 'x-fake-token': 'errado' })).status).toBe(401);
    expect(svc.handleEvent).not.toHaveBeenCalled();
  });

  it('aceita com a autenticação certa e entrega o evento traduzido, com o nome do provedor', async () => {
    const { app, svc } = build();
    const res = await post(app, '/webhooks/fake', event, { 'x-fake-token': 'segredo-do-webhook' });
    expect(res.status).toBe(200);
    expect(svc.handleEvent).toHaveBeenCalledWith('fake', { eventId: 'e1', orderId: 'ord_1', kind: 'paid' });
  });

  it('ignora eventos que não interessam e recusa corpo inválido', async () => {
    const { app, svc } = build();
    const h = { 'x-fake-token': 'segredo-do-webhook' };
    expect(await (await post(app, '/webhooks/fake', { id: 'x' }, h)).json()).toEqual({ result: 'ignored' });
    expect(svc.handleEvent).not.toHaveBeenCalled();
    expect((await post(app, '/webhooks/fake', 'isso não é json', h)).status).toBe(400);
  });

  it('provedor desconhecido ou pedidos desligados respondem 503', async () => {
    expect((await post(build().app, '/webhooks/outro', event)).status).toBe(503);
    const semPedidos = createApp(catalog, { providers: [createFakeProvider()] });
    expect((await post(semPedidos, '/webhooks/fake', event)).status).toBe(503);
  });
});
