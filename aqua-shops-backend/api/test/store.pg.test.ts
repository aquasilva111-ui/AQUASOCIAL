import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgStore, type StoredOrder } from '../src/store.ts';

// Integração com Postgres real. Rode com: TEST_DATABASE_URL=postgres://... npm test
const url = process.env.TEST_DATABASE_URL;

const order = (id: string): StoredOrder => ({
  id,
  number: id.replace(/\D/g, '').slice(0, 8).padEnd(8, '0'),
  status: 'pending_payment',
  buyer: { email: 'a@example.test', name: 'T', cpfCnpj: '12345678909', phone: '0', city: 'C', address: 'R' },
  items: [{ listingId: 'p~s', title: 'X', quantity: 1, unitCents: 1000, sellerId: 's', offerId: 'o', variantId: 'v' }],
  split: { totalCents: 1000, commissionCents: 200, sellers: [{ sellerId: 's', grossCents: 1000, commissionCents: 200, payoutCents: 800 }] },
  totalCents: 1000,
  mercurCartId: 'cart_1',
  shippingCents: 0,
  asaasPaymentId: `pay_${id}`,
  pixPayload: '000201',
  pixQrCode: 'B64',
  pixExpiresAt: '2026-10-06',
  createdAt: '2026-10-05T12:00:00.000Z',
});

describe.skipIf(!url)('PgOrderStore (Postgres real)', () => {
  let store: Awaited<ReturnType<typeof createPgStore>>;
  const uid = `ord_${Date.now()}${Math.floor(Math.random() * 1000)}`;

  beforeAll(async () => {
    store = await createPgStore(url!);
  });
  afterAll(async () => {
    await store.close();
  });

  it('grava e lê o pedido sem perder campos', async () => {
    await store.insert(order(uid));
    expect(await store.get(uid)).toEqual(order(uid));
    expect(await store.get('nao-existe')).toBeNull();
  });

  it('só troca o status quando o atual confere (corrida entre webhooks)', async () => {
    const results = await Promise.all([store.transition(uid, 'pending_payment', 'paid'), store.transition(uid, 'pending_payment', 'paid')]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await store.get(uid))?.status).toBe('paid');
  });

  it('atualiza campos extras e mantém o resto', async () => {
    const updated = await store.update(uid, { mercurOrderGroupId: 'ordgrp_1' });
    expect(updated?.mercurOrderGroupId).toBe('ordgrp_1');
    expect((await store.get(uid))?.items).toHaveLength(1);
  });

  it('registra cada evento do webhook uma única vez', async () => {
    const eventId = `evt_${uid}`;
    expect(await store.recordEvent(eventId)).toBe(true);
    expect(await store.recordEvent(eventId)).toBe(false);
  });

  it('guarda e busca carteiras de vendedores', async () => {
    await store.setWallet(`sel_${uid}`, 'w1');
    await store.setWallet(`sel_${uid}`, 'w2'); // atualiza
    expect(await store.walletsFor([`sel_${uid}`, 'sem-carteira'])).toEqual(new Map([[`sel_${uid}`, 'w2']]));
    expect(await store.walletsFor([])).toEqual(new Map());
  });
});
