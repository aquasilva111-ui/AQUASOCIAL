import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgStore, type StoredOrder } from '../src/store.ts';

// Integração com Postgres real. Rode com: TEST_DATABASE_URL=postgres://... npm test
const url = process.env.TEST_DATABASE_URL;

const order = (id: string): StoredOrder => ({
  id,
  // Único por id (a coluna number é unique); os ids de teste compartilham o mesmo prefixo de dígitos.
  number: String(createHash('sha1').update(id).digest().readUInt32BE(0) % 1e8).padStart(8, '0'),
  status: 'awaiting_payment',
  shopId: 'sel_s',
  buyer: { email: 'a@example.test', name: 'T', cpfCnpj: '12345678909', phone: '0', city: 'C', address: 'R' },
  items: [{ listingId: 'p~s', title: 'X', quantity: 1, unitCents: 1000, sellerId: 's', offerId: 'o', variantId: 'v' }],
  totalCents: 1000,
  mercurCartId: 'cart_1',
  shippingCents: 0,
  paymentProvider: 'asaas',
  paymentId: `pay_${id}`,
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
    const results = await Promise.all([store.transition(uid, 'awaiting_payment', 'paid'), store.transition(uid, 'awaiting_payment', 'paid')]);
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

  it('grava o pedido antes da cobrança: vários pedidos sem paymentId convivem e a cobrança é anexada depois', async () => {
    const a = `${uid}_a`;
    const b = `${uid}_b`;
    const { paymentId: _x, pixPayload: _y, pixQrCode: _z, pixExpiresAt: _w, ...bare } = order(a);
    await store.insert(bare);
    await store.insert({ ...bare, id: b, number: order(b).number }); // payment_id é unique: dois NULL não podem colidir
    expect((await store.get(a))?.paymentId).toBeUndefined();

    const updated = await store.update(a, { paymentId: `pay_${a}`, pixPayload: '000201', pixQrCode: 'B64', pixExpiresAt: '2026-10-06' });
    expect(updated).toMatchObject({ paymentId: `pay_${a}`, pixPayload: '000201', status: 'awaiting_payment' });
    expect(await store.get(a)).toEqual(order(a));
  });

  it('update não pisa no status mudado por um webhook no meio do caminho', async () => {
    const id = `${uid}_c`;
    await store.insert(order(id));
    await store.transition(id, 'awaiting_payment', 'paid'); // webhook chega
    await store.update(id, { pixPayload: 'novo' }); // e só então o update de outros campos
    expect((await store.get(id))?.status).toBe('paid');
    expect(await store.update('nao-existe', { failure: 'x' })).toBeNull();
  });

  it('guarda a conexão de cada loja por provedor e atualiza ao reconectar', async () => {
    const conn = (provider: string, credentialEnc: string) => ({ shopId: `loja_${uid}`, provider, accountId: 'acc_1', credentialEnc, webhookSecretEnc: 'seg', createdAt: new Date().toISOString() });
    await store.saveConnection(conn('asaas', 'v1.a'));
    await store.saveConnection(conn('asaas', 'v1.b')); // reconectar troca
    await store.saveConnection({ ...conn('outro', 'v1.c'), accountId: undefined });
    expect((await store.getConnection(`loja_${uid}`, 'asaas'))?.credentialEnc).toBe('v1.b');
    expect((await store.getConnection(`loja_${uid}`, 'outro'))?.accountId).toBeUndefined();
    expect((await store.listConnections(`loja_${uid}`)).map(c => c.provider)).toEqual(['asaas', 'outro']);
    expect(await store.getConnection('sem-loja', 'asaas')).toBeNull();
    expect(await store.listConnections('sem-loja')).toEqual([]);
    expect((await store.listAllConnections()).filter(c => c.shopId === `loja_${uid}`)).toHaveLength(2);
  });
});
