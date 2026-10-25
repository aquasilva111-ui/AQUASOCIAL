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

  it('grava o pedido ANTES de cobrar: o pedido já existe quando o provedor é chamado', async () => {
    let seen: Awaited<ReturnType<OrderStore['get']>> = null;
    const original = provider.createCharge.bind(provider);
    vi.spyOn(provider, 'createCharge').mockImplementation(async (credential, input) => {
      seen = await store.get(input.orderId);
      return original(credential, input);
    });
    const order = await make().create(cart);
    expect(seen).toMatchObject({ id: 'ord_12345678-aaaa', status: 'awaiting_payment', shopId: 'sel_a' });
    expect(seen).not.toHaveProperty('paymentId'); // ainda sem cobrança
    const stored = (await store.get('ord_12345678-aaaa'))!;
    expect(stored.paymentId).toBe('fake_ord_12345678-aaaa'); // gravada depois
    expect(stored.pixPayload).toContain('FAKE');
    expect(order.pix?.payload).toBe(stored.pixPayload);
  });

  it('se não conseguir gravar o pedido, não cobra nada', async () => {
    vi.spyOn(store, 'insert').mockRejectedValue(new Error('banco fora do ar'));
    await expect(make().create(cart)).rejects.toThrow('banco fora do ar');
    expect(provider.charges).toHaveLength(0);
  });

  it('se a cobrança falhar, cancela o pedido e devolve mensagem genérica (o erro do provedor só vai para o log)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(provider, 'createCharge').mockRejectedValue(new Error('CPF 123.456.789-09 inválido na conta chave-secreta'));
    const err = await make().create(cart).catch(e => e);
    expect(err).toBeInstanceOf(OrderError);
    expect(err.status).toBe(502);
    expect(err.message).not.toMatch(/CPF|chave-secreta/);
    expect(log).toHaveBeenCalled();
    expect((await store.get('ord_12345678-aaaa'))?.status).toBe('cancelled');
    log.mockRestore();
  });

  it('se não conseguir registrar a cobrança depois de criada, cancela o pedido', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(store, 'update').mockRejectedValue(new Error('banco caiu'));
    await expect(make().create(cart)).rejects.toMatchObject({ status: 502 });
    expect((await store.get('ord_12345678-aaaa'))?.status).toBe('cancelled');
    log.mockRestore();
  });
});

describe('webhook da loja', () => {
  const chargeId = 'fake_ord_12345678-aaaa';
  // O provedor da loja confirma o pagamento (é ele a fonte da verdade, não o webhook).
  const create = async () => {
    const order = await make().create(cart);
    provider.statuses.set(chargeId, 'paid');
    return order;
  };
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

  it('não marca como pago se o provedor da loja não confirma (webhook com segredo certo não basta)', async () => {
    await make().create(cart); // cobrança pendente no provedor
    const svc = make();
    expect(await svc.handleEvent('fake', 'sel_a', evt('e1', 'paid'))).toBe('ignored');
    expect((await store.get('ord_12345678-aaaa'))?.status).toBe('awaiting_payment');
    expect(checkout.complete).not.toHaveBeenCalled();
    provider.statuses.set(chargeId, 'paid'); // depois o provedor confirma
    expect(await svc.handleEvent('fake', 'sel_a', evt('e1', 'paid'))).toBe('paid'); // o mesmo evento ainda vale: não foi gasto
  });

  it('confere o valor com o provedor quando ele informa', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await create(); // o pedido é de R$ 110,00 (item 10000 + frete 1000)
    provider.amounts.set(chargeId, 100);
    const svc = make();
    expect(await svc.handleEvent('fake', 'sel_a', evt('e1', 'paid'))).toBe('ignored');
    const o = await store.get('ord_12345678-aaaa');
    expect(o?.status).toBe('awaiting_payment');
    expect(o?.failure).toMatch(/valor/i);
    provider.amounts.set(chargeId, 11000);
    expect(await svc.handleEvent('fake', 'sel_a', evt('e2', 'paid'))).toBe('paid');
    log.mockRestore();
  });

  it('se o provedor estiver fora do ar o erro sobe (para ele reenviar) e o evento não é gasto', async () => {
    await create();
    provider.failStatusWith = new Error('provedor fora do ar');
    const svc = make();
    await expect(svc.handleEvent('fake', 'sel_a', evt('e1', 'paid'))).rejects.toThrow('fora do ar');
    expect((await store.get('ord_12345678-aaaa'))?.status).toBe('awaiting_payment');
    provider.failStatusWith = undefined;
    expect(await svc.handleEvent('fake', 'sel_a', evt('e1', 'paid'))).toBe('paid');
  });

  it('pago antes de a cobrança ser registrada: pede para o provedor tentar de novo', async () => {
    await store.insert({ id: 'ord_sem_cobranca', number: '1', status: 'awaiting_payment', shopId: 'sel_a', buyer, items: [], totalCents: 1, mercurCartId: 'c', shippingCents: 0, paymentProvider: 'fake', createdAt: '2026-10-05T12:00:00Z' });
    await expect(make().handleEvent('fake', 'sel_a', { eventId: 'e1', orderId: 'ord_sem_cobranca', kind: 'paid' })).rejects.toMatchObject({ status: 409 });
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
