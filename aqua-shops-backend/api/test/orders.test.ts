import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Catalog } from '../src/catalog.ts';
import { createOrdersService, OrderError } from '../src/orders.ts';
import { createMemoryStore, type OrderStore } from '../src/store.ts';

const buyer = { email: 'a@example.test', name: 'Teste', cpfCnpj: '123.456.789-09', phone: '(11) 99999-0000', city: 'Cidade', address: 'Rua 1' };
const offer = (sellerId: string, unitCents: number, stock = 10) => ({ listingId: 'x', productId: 'p', sellerId, offerId: `off_${sellerId}`, variantId: `var_${sellerId}`, unitCents, stock });
const product = (title: string) => ({ title }) as never;

let store: OrderStore;
let asaas: { findOrCreateCustomer: ReturnType<typeof vi.fn>; createPixCharge: ReturnType<typeof vi.fn>; getPixQrCode: ReturnType<typeof vi.fn>; refundPayment: ReturnType<typeof vi.fn> };
let catalog: Catalog;
let fulfill: ReturnType<typeof vi.fn>;

const make = () =>
  createOrdersService({
    catalog,
    store,
    asaas,
    fulfill,
    split: { commissionBps: 1000, minCommissionCents: 200 },
    now: () => new Date('2026-10-05T12:00:00Z'),
    newId: () => '12345678-aaaa',
  });

beforeEach(async () => {
  store = createMemoryStore();
  await store.setWallet('sel_a', 'wallet_a');
  await store.setWallet('sel_b', 'wallet_b');
  asaas = {
    findOrCreateCustomer: vi.fn().mockResolvedValue('cus_1'),
    createPixCharge: vi.fn().mockResolvedValue({ id: 'pay_1', status: 'PENDING', value: 0 }),
    getPixQrCode: vi.fn().mockResolvedValue({ payload: '000201...', encodedImage: 'BASE64', expirationDate: '2026-10-06 23:59:59' }),
    refundPayment: vi.fn().mockResolvedValue({}),
  };
  fulfill = vi.fn().mockResolvedValue({ orderGroupId: 'ordgrp_1' });
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
    expect(order.totalCents).toBe(25000);
    expect(order.status).toBe('pending_payment');
    expect(order.pix?.payload).toBe('000201...');
    const charge = asaas.createPixCharge.mock.calls[0]![0];
    expect(charge.valueCents).toBe(25000);
    expect(charge.externalReference).toBe('ord_12345678-aaaa');
    expect(charge.dueDate).toBe('2026-10-06');
    // comissão de 10% = 2500, repartida: a (20000) fica com 18000 e b (5000) com 4500
    expect(charge.splits).toEqual([
      { walletId: 'wallet_a', fixedValueCents: 18000 },
      { walletId: 'wallet_b', fixedValueCents: 4500 },
    ]);
    expect(asaas.findOrCreateCustomer.mock.calls[0]![0].cpfCnpj).toBe('12345678909');
  });

  it('rejeita dados inválidos e estoque insuficiente sem cobrar nada', async () => {
    const svc = make();
    await expect(svc.create({ items: [], buyer, paymentMethod: 'pix' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.create({ items: [{ productId: 'p~a', quantity: 0 }], buyer, paymentMethod: 'pix' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.create({ items: [{ productId: 'p~a', quantity: 1 }], buyer: { ...buyer, cpfCnpj: '123' }, paymentMethod: 'pix' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.create({ items: [{ productId: 'p~a', quantity: 9 }], buyer, paymentMethod: 'pix' })).rejects.toMatchObject({ status: 409 });
    expect(asaas.createPixCharge).not.toHaveBeenCalled();
  });

  it('não vende de vendedor sem carteira Asaas', async () => {
    store = createMemoryStore();
    await expect(make().create({ items: [{ productId: 'p~a', quantity: 1 }], buyer, paymentMethod: 'pix' })).rejects.toMatchObject({ status: 422 });
  });

  it('devolve 502 quando o Asaas falha e não grava o pedido', async () => {
    asaas.createPixCharge.mockRejectedValue(new Error('CPF inválido'));
    const err = await make().create({ items: [{ productId: 'p~a', quantity: 1 }], buyer, paymentMethod: 'pix' }).catch(e => e);
    expect(err).toBeInstanceOf(OrderError);
    expect(err.status).toBe(502);
    expect(await store.get('ord_12345678-aaaa')).toBeNull();
  });
});

describe('webhook', () => {
  const create = () => make().create({ items: [{ productId: 'p~a', quantity: 1 }], buyer, paymentMethod: 'pix' });
  const evt = (id: string, event: string) => ({ id, event, payment: { id: 'pay_1', externalReference: 'ord_12345678-aaaa' } });

  it('marca como pago e cria o pedido no Mercur uma única vez', async () => {
    await create();
    const svc = make();
    expect(await svc.handleEvent(evt('e1', 'PAYMENT_RECEIVED'))).toBe('paid');
    expect(await svc.handleEvent(evt('e1', 'PAYMENT_RECEIVED'))).toBe('duplicate'); // mesma entrega
    expect(await svc.handleEvent(evt('e2', 'PAYMENT_CONFIRMED'))).toBe('duplicate'); // outro evento, já pago
    expect(fulfill).toHaveBeenCalledTimes(1);
    const o = await store.get('ord_12345678-aaaa');
    expect(o?.status).toBe('paid');
    expect(o?.mercurOrderGroupId).toBe('ordgrp_1');
  });

  it('se não der para entregar, marca falha e devolve o dinheiro', async () => {
    await create();
    fulfill.mockRejectedValue(new Error('Estoque acabou'));
    await make().handleEvent(evt('e1', 'PAYMENT_RECEIVED'));
    const o = await store.get('ord_12345678-aaaa');
    expect(o?.status).toBe('failed');
    expect(o?.failure).toBe('Estoque acabou');
    expect(asaas.refundPayment).toHaveBeenCalledWith('pay_1');
  });

  it('vencido vira expirado e eventos de outros sistemas são ignorados', async () => {
    await create();
    const svc = make();
    expect(await svc.handleEvent({ id: 'x', event: 'PAYMENT_RECEIVED', payment: { externalReference: 'outro-sistema' } })).toBe('ignored');
    expect(await svc.handleEvent(evt('e1', 'PAYMENT_OVERDUE'))).toBe('closed');
    expect((await store.get('ord_12345678-aaaa'))?.status).toBe('expired');
  });

  it('só mostra o Pix enquanto espera pagamento', async () => {
    await create();
    const svc = make();
    expect((await svc.get('ord_12345678-aaaa'))?.pix).toBeDefined();
    await svc.handleEvent(evt('e1', 'PAYMENT_RECEIVED'));
    expect((await svc.get('ord_12345678-aaaa'))?.pix).toBeUndefined();
    expect(await svc.get('nao-existe')).toBeNull();
  });
});
