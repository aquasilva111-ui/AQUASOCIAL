import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Catalog } from '../src/catalog.ts';
import { createConnections, createVault, type Connections } from '../src/connections.ts';
import { createOrdersService, OrderError } from '../src/orders.ts';
import { createFakeProvider } from '../src/payments.ts';
import { createMemoryStore, type OrderStore } from '../src/store.ts';

const buyer = { email: 'a@example.test', name: 'Teste', cpfCnpj: '123.456.789-09', phone: '(11) 99999-0000', city: 'Cidade', address: 'Rua 1' };
const offer = (sellerId: string, unitCents: number, stock = 10) => ({ listingId: 'x', productId: 'p', sellerId, offerId: `off_${sellerId}`, variantId: `var_${sellerId}`, unitCents, stock });
const product = (title: string) => ({ title }) as never;
const cart = { items: [{ productId: 'p~a', quantity: 1 }], buyer, paymentMethod: 'pix' as const };

let store: OrderStore;
let provider: ReturnType<typeof createFakeProvider>;
let connections: Connections;
let catalog: Catalog;
let checkout: { prepare: ReturnType<typeof vi.fn>; complete: ReturnType<typeof vi.fn> };

const make = () =>
  createOrdersService({
    catalog,
    store,
    connections,
    checkout,
    now: () => new Date('2026-10-05T12:00:00Z'),
    newId: () => '12345678-aaaa',
  });

beforeEach(async () => {
  store = createMemoryStore();
  provider = createFakeProvider();
  connections = createConnections({ store, vault: createVault('a'.repeat(64)), providers: [provider], publicUrl: 'https://api.test', newSecret: () => 'segredo-loja' });
  // Cada loja conecta o PRÓPRIO provedor, com a credencial dela.
  await connections.connect('sel_a', 'fake', { kind: 'api_key', apiKey: 'chave-a' });
  await connections.connect('sel_b', 'fake', { kind: 'api_key', apiKey: 'chave-b' });
  checkout = {
    // frete de R$ 10 por vendedor; o total do carrinho é a soma dos itens com o frete
    prepare: vi.fn(async (_buyer: unknown, lines: Array<{ sellerId: string; quantity: number; unitCents: number }>) => {
      const sellers = [...new Set(lines.map(l => l.sellerId))];
      const shippingBySeller = Object.fromEntries(sellers.map(s => [s, 1000]));
      const items = lines.reduce((sum, l) => sum + l.quantity * l.unitCents, 0);
      return { cartId: 'cart_1', shippingBySeller, totalCents: items + sellers.length * 1000 };
    }),
    complete: vi.fn().mockResolvedValue({ orderGroupId: 'ordgrp_1' }),
  };
  catalog = {
    list: vi.fn(),
    get: vi.fn(),
    categories: vi.fn(),
    resolve: vi.fn(async (id: string, qty: number) => {
      const table: Record<string, { seller: string; price: number; stock: number }> = { 'p~a': { seller: 'sel_a', price: 10000, stock: 5 }, 'p~b': { seller: 'sel_b', price: 5000, stock: 5 } };
      const row = table[id];
      return row && row.stock >= qty ? { product: product(id), offer: offer(row.seller, row.price, row.stock) } : null;
    }),
  } as unknown as Catalog;
});

describe('criar pedido', () => {
  it('calcula tudo no servidor e cobra na conta da loja, sem split nem comissão', async () => {
    const order = await make().create({ items: [{ productId: 'p~a', quantity: 2 }], buyer, paymentMethod: 'pix' });
    expect(order.totalCents).toBe(21000); // 20000 em itens + R$ 10 de frete
    expect(order.shippingCents).toBe(1000);
    expect(order.status).toBe('awaiting_payment');
    expect(order.pix?.payload).toContain('FAKE');

    const charge = provider.charges[0]!;
    expect(charge.totalCents).toBe(21000); // o valor inteiro, nada é descontado pela Aqua
    expect(charge.orderId).toBe('ord_12345678-aaaa');
    expect(charge.dueDate).toBe('2026-10-06');
    expect(charge.credential).toEqual({ token: 'chave-a' }); // a credencial da loja, não a da Aqua
    expect(charge).not.toHaveProperty('splits');
    expect(charge.buyer.cpfCnpj).toBe('12345678909');

    const stored = (await store.get('ord_12345678-aaaa'))!;
    expect(stored.paymentProvider).toBe('fake');
    expect(stored.shopId).toBe('sel_a');
    expect(stored).not.toHaveProperty('split');
  });

  it('cada loja cobra com a sua credencial', async () => {
    await make().create({ items: [{ productId: 'p~b', quantity: 1 }], buyer, paymentMethod: 'pix' });
    expect(provider.charges[0]!.credential).toEqual({ token: 'chave-b' });
  });

  it('por enquanto aceita itens de uma loja só (uma cobrança por loja chega na fase 3)', async () => {
    await expect(make().create({ items: [{ productId: 'p~a', quantity: 1 }, { productId: 'p~b', quantity: 1 }], buyer, paymentMethod: 'pix' })).rejects.toMatchObject({ status: 422 });
    expect(provider.charges).toHaveLength(0);
  });

  it('rejeita dados inválidos e estoque insuficiente sem cobrar nada', async () => {
    const svc = make();
    await expect(svc.create({ items: [], buyer, paymentMethod: 'pix' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.create({ items: [{ productId: 'p~a', quantity: 0 }], buyer, paymentMethod: 'pix' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.create({ ...cart, buyer: { ...buyer, cpfCnpj: '123' } })).rejects.toMatchObject({ status: 400 });
    await expect(svc.create({ items: [{ productId: 'p~a', quantity: 9 }], buyer, paymentMethod: 'pix' })).rejects.toMatchObject({ status: 409 });
    expect(provider.charges).toHaveLength(0);
  });

  it('recusa se o total do Mercur não bate com o calculado (preço mudou no meio)', async () => {
    checkout.prepare.mockResolvedValueOnce({ cartId: 'cart_1', shippingBySeller: { sel_a: 1000 }, totalCents: 99999 });
    await expect(make().create(cart)).rejects.toMatchObject({ status: 409 });
    expect(provider.charges).toHaveLength(0);
  });

  it('repassa a recusa de frete do Mercur como 409', async () => {
    checkout.prepare.mockRejectedValueOnce(Object.assign(new Error('Um dos vendedores não entrega neste endereço'), { status: 409 }));
    await expect(make().create(cart)).rejects.toMatchObject({ status: 409 });
  });

  it('loja que não conectou um provedor não vende', async () => {
    store = createMemoryStore();
    connections = createConnections({ store, vault: createVault('a'.repeat(64)), providers: [provider], publicUrl: 'https://api.test' });
    await expect(make().create(cart)).rejects.toMatchObject({ status: 422 });
    expect(provider.charges).toHaveLength(0);
  });

  it('devolve 502 quando o provedor falha e não grava o pedido', async () => {
    vi.spyOn(provider, 'createCharge').mockRejectedValue(new Error('CPF inválido'));
    const err = await make().create(cart).catch(e => e);
    expect(err).toBeInstanceOf(OrderError);
    expect(err.status).toBe(502);
    expect(await store.get('ord_12345678-aaaa')).toBeNull();
  });
});

describe('webhook da loja', () => {
  const create = () => make().create(cart);
  const evt = (eventId: string, kind: 'paid' | 'expired' | 'cancelled' | 'refunded') => ({ eventId, orderId: 'ord_12345678-aaaa', kind });

  it('marca como pago e finaliza o carrinho no Mercur uma única vez', async () => {
    await create();
    const svc = make();
    expect(await svc.handleEvent('fake', 'sel_a', evt('e1', 'paid'))).toBe('paid');
    expect(await svc.handleEvent('fake', 'sel_a', evt('e1', 'paid'))).toBe('duplicate'); // mesma entrega
    expect(await svc.handleEvent('fake', 'sel_a', evt('e2', 'paid'))).toBe('duplicate'); // outro evento, já pago
    expect(checkout.complete).toHaveBeenCalledTimes(1);
    expect(checkout.complete).toHaveBeenCalledWith('cart_1');
    const o = await store.get('ord_12345678-aaaa');
    expect(o?.status).toBe('paid');
    expect(o?.mercurOrderGroupId).toBe('ordgrp_1');
  });

  it('a loja só mexe nos próprios pedidos', async () => {
    await create(); // pedido da loja sel_a
    const svc = make();
    expect(await svc.handleEvent('fake', 'sel_b', evt('e1', 'paid'))).toBe('ignored'); // webhook de outra loja
    expect((await store.get('ord_12345678-aaaa'))?.status).toBe('awaiting_payment');
    expect(await svc.handleEvent('asaas', 'sel_a', evt('e1', 'paid'))).toBe('ignored'); // provedor que não cobrou
    expect(checkout.complete).not.toHaveBeenCalled();
    expect(await svc.handleEvent('fake', 'sel_a', evt('e1', 'paid'))).toBe('paid'); // e o id do evento ainda não foi gasto
  });

  it('o mesmo id de evento em lojas diferentes não colide', async () => {
    await create();
    const svc = make();
    expect(await svc.handleEvent('fake', 'sel_b', evt('e1', 'paid'))).toBe('ignored');
    expect(await svc.handleEvent('fake', 'sel_a', evt('e1', 'paid'))).toBe('paid');
  });

  it('se não der para criar o pedido no Mercur, segue pago com o motivo e a Aqua NÃO estorna', async () => {
    await create();
    checkout.complete.mockRejectedValue(new Error('Estoque acabou'));
    expect(provider).not.toHaveProperty('refund'); // o conector nem tem como estornar
    await make().handleEvent('fake', 'sel_a', evt('e1', 'paid'));
    const o = await store.get('ord_12345678-aaaa');
    expect(o?.status).toBe('paid');
    expect(o?.failure).toBe('Estoque acabou');
  });

  it('estorno feito pelo lojista no provedor só é refletido no pedido', async () => {
    await create();
    const svc = make();
    expect(await svc.handleEvent('fake', 'sel_a', evt('e1', 'refunded'))).toBe('ignored'); // nada a estornar antes de pagar
    expect((await store.get('ord_12345678-aaaa'))?.status).toBe('awaiting_payment');
    await svc.handleEvent('fake', 'sel_a', evt('e2', 'paid'));
    expect(await svc.handleEvent('fake', 'sel_a', evt('e3', 'refunded'))).toBe('refunded');
    expect((await store.get('ord_12345678-aaaa'))?.status).toBe('refunded');
  });

  it('vencido ou cancelado vira cancelado e pedidos de outros sistemas são ignorados', async () => {
    await create();
    const svc = make();
    expect(await svc.handleEvent('fake', 'sel_a', { eventId: 'x', orderId: 'outro-sistema', kind: 'paid' })).toBe('ignored');
    expect(await svc.handleEvent('fake', 'sel_a', evt('e1', 'expired'))).toBe('closed');
    expect((await store.get('ord_12345678-aaaa'))?.status).toBe('cancelled');
  });

  it('só mostra o Pix enquanto espera pagamento', async () => {
    await create();
    const svc = make();
    expect((await svc.get('ord_12345678-aaaa'))?.pix).toBeDefined();
    await svc.handleEvent('fake', 'sel_a', evt('e1', 'paid'));
    expect((await svc.get('ord_12345678-aaaa'))?.pix).toBeUndefined();
    expect(await svc.get('nao-existe')).toBeNull();
  });
});
