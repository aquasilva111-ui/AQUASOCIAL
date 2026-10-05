import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Catalog } from '../src/catalog.ts';
import { createOrdersService, OrderError } from '../src/orders.ts';
import { createFakeProvider } from '../src/payments.ts';
import { createMemoryStore, type OrderStore } from '../src/store.ts';

const buyer = { email: 'a@example.test', name: 'Teste', cpfCnpj: '123.456.789-09', phone: '(11) 99999-0000', city: 'Cidade', address: 'Rua 1' };
const offer = (sellerId: string, unitCents: number, stock = 10) => ({ listingId: 'x', productId: 'p', sellerId, offerId: `off_${sellerId}`, variantId: `var_${sellerId}`, unitCents, stock });
const product = (title: string) => ({ title }) as never;
const cart = { items: [{ productId: 'p~a', quantity: 1 }], buyer, paymentMethod: 'pix' as const };

let store: OrderStore;
let provider: ReturnType<typeof createFakeProvider>;
let catalog: Catalog;
let checkout: { prepare: ReturnType<typeof vi.fn>; complete: ReturnType<typeof vi.fn> };

const make = () =>
  createOrdersService({
    catalog,
    store,
    payments: [provider],
    checkout,
    split: { commissionBps: 1000, minCommissionCents: 200 },
    now: () => new Date('2026-10-05T12:00:00Z'),
    newId: () => '12345678-aaaa',
  });

beforeEach(async () => {
  store = createMemoryStore();
  await store.setWallet('fake', 'sel_a', 'wallet_a');
  await store.setWallet('fake', 'sel_b', 'wallet_b');
  provider = createFakeProvider();
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
  it('calcula tudo no servidor e cobra com split por vendedor', async () => {
    const order = await make().create({ items: [{ productId: 'p~a', quantity: 2 }, { productId: 'p~b', quantity: 1 }], buyer, paymentMethod: 'pix' });
    expect(order.totalCents).toBe(27000); // 25000 em itens + R$ 10 de frete de cada vendedor
    expect(order.shippingCents).toBe(2000);
    expect(order.status).toBe('pending_payment');
    expect(order.pix?.payload).toContain('FAKE');

    const charge = provider.charges[0]!;
    expect(charge.totalCents).toBe(27000);
    expect(charge.orderId).toBe('ord_12345678-aaaa');
    expect(charge.dueDate).toBe('2026-10-06');
    // O frete entra no valor de cada vendedor: a = 20000+1000, b = 5000+1000.
    // Comissão de 10% de 27000 = 2700, repartida: a fica com 21000-2100 e b com 6000-600.
    expect(charge.splits).toEqual([
      { recipientId: 'wallet_a', amountCents: 18900 },
      { recipientId: 'wallet_b', amountCents: 5400 },
    ]);
    expect(charge.buyer.cpfCnpj).toBe('12345678909');
    expect((await store.get('ord_12345678-aaaa'))?.paymentProvider).toBe('fake');
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

  it('não vende de vendedor sem carteira no provedor ativo', async () => {
    store = createMemoryStore();
    await store.setWallet('outro-provedor', 'sel_a', 'wallet_a'); // carteira de outro provedor não vale
    await expect(make().create(cart)).rejects.toMatchObject({ status: 422 });
  });

  it('devolve 502 quando o provedor falha e não grava o pedido', async () => {
    vi.spyOn(provider, 'createCharge').mockRejectedValue(new Error('CPF inválido'));
    const err = await make().create(cart).catch(e => e);
    expect(err).toBeInstanceOf(OrderError);
    expect(err.status).toBe(502);
    expect(await store.get('ord_12345678-aaaa')).toBeNull();
  });
});

describe('webhook', () => {
  const create = () => make().create(cart);
  const evt = (eventId: string, kind: 'paid' | 'expired' | 'cancelled') => ({ eventId, orderId: 'ord_12345678-aaaa', kind });

  it('marca como pago e finaliza o carrinho no Mercur uma única vez', async () => {
    await create();
    const svc = make();
    expect(await svc.handleEvent('fake', evt('e1', 'paid'))).toBe('paid');
    expect(await svc.handleEvent('fake', evt('e1', 'paid'))).toBe('duplicate'); // mesma entrega
    expect(await svc.handleEvent('fake', evt('e2', 'paid'))).toBe('duplicate'); // outro evento, já pago
    expect(checkout.complete).toHaveBeenCalledTimes(1);
    expect(checkout.complete).toHaveBeenCalledWith('cart_1');
    const o = await store.get('ord_12345678-aaaa');
    expect(o?.status).toBe('paid');
    expect(o?.mercurOrderGroupId).toBe('ordgrp_1');
  });

  it('o mesmo id de evento em provedores diferentes não colide', async () => {
    await create();
    const svc = make();
    expect(await svc.handleEvent('asaas', evt('e1', 'expired'))).toBe('closed');
    expect(await svc.handleEvent('fake', evt('e1', 'paid'))).toBe('duplicate'); // pedido já não está pendente
  });

  it('se não der para entregar, marca falha e pede o estorno ao provedor que cobrou', async () => {
    await create();
    checkout.complete.mockRejectedValue(new Error('Estoque acabou'));
    const refund = vi.spyOn(provider, 'refund');
    await make().handleEvent('fake', evt('e1', 'paid'));
    const o = await store.get('ord_12345678-aaaa');
    expect(o?.status).toBe('failed');
    expect(o?.failure).toBe('Estoque acabou');
    expect(refund).toHaveBeenCalledWith('fake_ord_12345678-aaaa');
  });

  it('vencido vira expirado, cancelado vira cancelado e pedidos de outros sistemas são ignorados', async () => {
    await create();
    const svc = make();
    expect(await svc.handleEvent('fake', { eventId: 'x', orderId: 'outro-sistema', kind: 'paid' })).toBe('ignored');
    expect(await svc.handleEvent('fake', evt('e1', 'expired'))).toBe('closed');
    expect((await store.get('ord_12345678-aaaa'))?.status).toBe('expired');
  });

  it('só mostra o Pix enquanto espera pagamento', async () => {
    await create();
    const svc = make();
    expect((await svc.get('ord_12345678-aaaa'))?.pix).toBeDefined();
    await svc.handleEvent('fake', evt('e1', 'paid'));
    expect((await svc.get('ord_12345678-aaaa'))?.pix).toBeUndefined();
    expect(await svc.get('nao-existe')).toBeNull();
  });
});
