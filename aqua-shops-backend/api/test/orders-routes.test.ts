import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';
import type { Catalog } from '../src/catalog.ts';
import { createConnections, createVault } from '../src/connections.ts';
import { OrderError, type OrdersService } from '../src/orders.ts';
import { createFakeProvider } from '../src/payments.ts';
import { createMemoryStore } from '../src/store.ts';

const catalog = {} as Catalog;
const service = (): { [K in keyof OrdersService]: ReturnType<typeof vi.fn> } => ({ create: vi.fn(), get: vi.fn(), handleEvent: vi.fn().mockResolvedValue('paid') });
const build = async (svc = service()) => {
  const store = createMemoryStore();
  const connections = createConnections({
    store,
    vault: createVault('a'.repeat(64)),
    providers: [createFakeProvider()],
    publicUrl: 'https://api.test',
    newSecret: (() => {
      const secrets = ['segredo-loja-1', 'segredo-loja-2'];
      return () => secrets.shift() ?? 'extra';
    })(),
  });
  // Cada loja tem o seu segredo de webhook.
  await connections.connect('loja_1', 'fake', { kind: 'api_key', apiKey: 'k1' });
  await connections.connect('loja_2', 'fake', { kind: 'api_key', apiKey: 'k2' });
  return { svc, store, connections, app: createApp(catalog, { orders: svc as unknown as OrdersService, connections }) };
};
const post = (app: ReturnType<typeof createApp>, path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });

describe('rotas de pedido', () => {
  it('cria pedido (201) e repassa erros de negócio com o status certo', async () => {
    const { app, svc } = await build();
    svc.create.mockResolvedValueOnce({ id: 'ord_1' });
    expect((await post(app, '/orders', { items: [] })).status).toBe(201);
    svc.create.mockRejectedValueOnce(new OrderError('Estoque insuficiente', 409));
    const res = await post(app, '/orders', {});
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ message: 'Estoque insuficiente' });
  });

  it('busca pedido ou devolve 404', async () => {
    const { app, svc } = await build();
    svc.get.mockResolvedValueOnce({ id: 'ord_1' }).mockResolvedValueOnce(null);
    expect((await app.request('/orders/ord_1')).status).toBe(200);
    expect((await app.request('/orders/ord_2')).status).toBe(404);
  });
});

describe('webhooks por loja', () => {
  const event = { id: 'e1', orderId: 'ord_1', kind: 'paid' };
  const auth = (secret: string) => ({ 'x-fake-token': secret });

  it('recusa sem a autenticação certa e não processa nada', async () => {
    const { app, svc } = await build();
    expect((await post(app, '/webhooks/fake/loja_1', event)).status).toBe(401);
    expect((await post(app, '/webhooks/fake/loja_1', event, auth('errado'))).status).toBe(401);
    expect(svc.handleEvent).not.toHaveBeenCalled();
  });

  it('o segredo de uma loja não vale para o webhook de outra', async () => {
    const { app, svc } = await build();
    expect((await post(app, '/webhooks/fake/loja_2', event, auth('segredo-loja-1'))).status).toBe(401);
    expect(svc.handleEvent).not.toHaveBeenCalled();
  });

  it('aceita com o segredo da loja e entrega o evento com provedor e loja', async () => {
    const { app, svc } = await build();
    const res = await post(app, '/webhooks/fake/loja_2', event, auth('segredo-loja-2'));
    expect(res.status).toBe(200);
    expect(svc.handleEvent).toHaveBeenCalledWith('fake', 'loja_2', { eventId: 'e1', orderId: 'ord_1', kind: 'paid' });
  });

  it('ignora eventos que não interessam e recusa corpo inválido', async () => {
    const { app, svc } = await build();
    const h = auth('segredo-loja-1');
    expect(await (await post(app, '/webhooks/fake/loja_1', { id: 'x' }, h)).json()).toEqual({ result: 'ignored' });
    expect(svc.handleEvent).not.toHaveBeenCalled();
    expect((await post(app, '/webhooks/fake/loja_1', 'isso não é json', h)).status).toBe(400);
  });

  it('loja ou provedor sem conexão respondem 404; sem pedidos ligados, 503', async () => {
    const { app } = await build();
    expect((await post(app, '/webhooks/fake/loja_sem_conexao', event)).status).toBe(404);
    expect((await post(app, '/webhooks/outro/loja_1', event)).status).toBe(404);
    expect((await post(app, '/webhooks/fake', event)).status).toBe(404); // a rota antiga, global, não existe mais
    expect((await post(createApp(catalog), '/webhooks/fake/loja_1', event)).status).toBe(503);
  });

  it('credencial da loja ilegível responde 500 com mensagem própria, não "Erro ao falar com o Mercur"', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store } = await build();
    // Mesmo banco, chave de cifra diferente: simula a chave perdida.
    const lost = createConnections({ store, vault: createVault('c'.repeat(64)), providers: [createFakeProvider()], publicUrl: 'https://api.test' });
    const brokenApp = createApp(catalog, { orders: service() as unknown as OrdersService, connections: lost });
    const res = await post(brokenApp, '/webhooks/fake/loja_1', event, auth('segredo-loja-1'));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/ilegível/);
    expect(body.message).not.toMatch(/Mercur/);
    log.mockRestore();
  });
});
