import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';
import type { Catalog } from '../src/catalog.ts';
import { OrderError, type OrdersService } from '../src/orders.ts';

const catalog = {} as Catalog;
const service = (): { [K in keyof OrdersService]: ReturnType<typeof vi.fn> } => ({ create: vi.fn(), get: vi.fn(), handleEvent: vi.fn().mockResolvedValue('paid') });
const build = (svc = service()) => ({ svc, app: createApp(catalog, { orders: svc as unknown as OrdersService, webhookToken: 'segredo-do-webhook' }) });
const post = (app: ReturnType<typeof build>['app'], path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });

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

describe('webhook do Asaas', () => {
  it('recusa sem o token certo e não processa nada', async () => {
    const { app, svc } = build();
    expect((await post(app, '/webhooks/asaas', { id: 'e1' })).status).toBe(401);
    expect((await post(app, '/webhooks/asaas', { id: 'e1' }, { 'asaas-access-token': 'errado' })).status).toBe(401);
    expect(svc.handleEvent).not.toHaveBeenCalled();
  });

  it('aceita com o token certo', async () => {
    const { app, svc } = build();
    const res = await post(app, '/webhooks/asaas', { id: 'e1', event: 'PAYMENT_RECEIVED' }, { 'asaas-access-token': 'segredo-do-webhook' });
    expect(res.status).toBe(200);
    expect(svc.handleEvent).toHaveBeenCalledOnce();
  });

  it('fica desligado sem token configurado', async () => {
    const app = createApp(catalog, { orders: service() as unknown as OrdersService });
    expect((await post(app, '/webhooks/asaas', {})).status).toBe(503);
  });
});
