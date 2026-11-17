import { describe, expect, it, vi } from 'vitest';
import { createAsaasProvider, createFakeProvider } from '../src/payments.ts';

const client = () => ({
  findOrCreateCustomer: vi.fn().mockResolvedValue('cus_1'),
  createPixCharge: vi.fn().mockResolvedValue({ id: 'pay_1', status: 'PENDING', value: 0 }),
  getPixQrCode: vi.fn().mockResolvedValue({ payload: '000201...', encodedImage: 'B64', expirationDate: '2026-10-06 23:59:59' }),
  getPayment: vi.fn().mockResolvedValue({ id: 'pay_1', status: 'RECEIVED', value: 0 }),
});

const charge = {
  orderId: 'ord_1',
  totalCents: 10000,
  description: 'Pedido',
  dueDate: '2026-10-06',
  buyer: { name: 'A', email: 'a@x.test', cpfCnpj: '12345678909', phone: '(11) 99999-0000' },
};

describe('conector do Asaas (conta do lojista)', () => {
  it('cobra com a chave da loja, sem split, e devolve o Pix', async () => {
    const c = client();
    const clientFor = vi.fn(() => c);
    const result = await createAsaasProvider(clientFor).createCharge({ apiKey: 'chave-da-loja' }, charge);
    expect(result).toEqual({ paymentId: 'pay_1', pix: { payload: '000201...', qrCodeBase64: 'B64', expiresAt: '2026-10-06 23:59:59' } });
    expect(clientFor).toHaveBeenCalledWith('chave-da-loja');
    expect(c.findOrCreateCustomer.mock.calls[0]![0].mobilePhone).toBe('11999990000');
    const sent = c.createPixCharge.mock.calls[0]![0];
    expect(sent).toMatchObject({ externalReference: 'ord_1', valueCents: 10000 });
    expect(sent).not.toHaveProperty('splits');
  });

  it('recusa cobrar loja sem chave', async () => {
    await expect(createAsaasProvider(() => client()).createCharge({}, charge)).rejects.toThrow('Loja sem chave');
  });

  it('conecta com a chave de API e não aceita OAuth', async () => {
    const p = createAsaasProvider(() => client());
    const ctx = { webhookUrl: 'https://api.test/webhooks/asaas/loja', webhookSecret: 's' };
    expect(await p.connect({ kind: 'api_key', apiKey: '  k  ' }, ctx)).toEqual({ credential: { apiKey: 'k' } });
    await expect(p.connect({ kind: 'api_key', apiKey: ' ' }, ctx)).rejects.toThrow();
    await expect(p.connect({ kind: 'oauth', code: 'c', redirectUri: 'https://x' }, ctx)).rejects.toThrow();
    expect(p.connectionKinds).toEqual(['api_key']);
  });

  it('lê o estado da cobrança no Asaas da loja', async () => {
    const c = client();
    const p = createAsaasProvider(() => c);
    c.getPayment.mockResolvedValueOnce({ id: 'pay_1', status: 'RECEIVED', value: 123.45 });
    expect(await p.getChargeStatus({ apiKey: 'k' }, 'pay_1')).toEqual({ status: 'paid', amountCents: 12345 }); // valor em centavos
    for (const [asaas, ours] of [['PENDING', 'pending'], ['OVERDUE', 'expired'], ['REFUNDED', 'refunded'], ['ALGO_NOVO', 'pending']] as const) {
      c.getPayment.mockResolvedValueOnce({ id: 'pay_1', status: asaas, value: 0 });
      expect((await p.getChargeStatus({ apiKey: 'k' }, 'pay_1')).status).toBe(ours);
    }
  });

  it('autentica o webhook com o segredo DA LOJA, no header do Asaas', () => {
    const p = createAsaasProvider(() => client());
    expect(p.verifyWebhook('segredo-da-loja', h => (h === 'asaas-access-token' ? 'segredo-da-loja' : undefined), '{}')).toBe(true);
    expect(p.verifyWebhook('segredo-da-loja', h => (h === 'asaas-access-token' ? 'segredo-de-outra' : undefined), '{}')).toBe(false);
    expect(p.verifyWebhook('segredo-da-loja', () => undefined, '{}')).toBe(false);
  });

  it('traduz os eventos do Asaas (estorno só é refletido) e ignora o que não interessa', () => {
    const p = createAsaasProvider(() => client());
    const ev = (event: string, ref: string | null = 'ord_1') => ({ id: 'e1', event, payment: { externalReference: ref } });
    expect(p.parseWebhook(ev('PAYMENT_RECEIVED'))).toEqual({ eventId: 'e1', orderId: 'ord_1', kind: 'paid' });
    expect(p.parseWebhook(ev('PAYMENT_CONFIRMED'))?.kind).toBe('paid');
    expect(p.parseWebhook(ev('PAYMENT_OVERDUE'))?.kind).toBe('expired');
    expect(p.parseWebhook(ev('PAYMENT_DELETED'))?.kind).toBe('cancelled');
    expect(p.parseWebhook(ev('PAYMENT_REFUNDED'))?.kind).toBe('refunded');
    expect(p.parseWebhook(ev('PAYMENT_CREATED'))).toBeNull();
    expect(p.parseWebhook(ev('PAYMENT_RECEIVED', 'de-outro-sistema'))).toBeNull();
    expect(p.parseWebhook(ev('PAYMENT_RECEIVED', null))).toBeNull();
    expect(p.parseWebhook(null)).toBeNull();
  });
});

describe('o contrato não tem como a Aqua mexer no dinheiro', () => {
  it('nenhum conector expõe estorno nem split', () => {
    for (const p of [createAsaasProvider(() => client()), createFakeProvider()]) {
      expect(p).not.toHaveProperty('refund');
      expect(Object.keys(p)).not.toContain('splits');
    }
  });
});

describe('provedor de mentira', () => {
  it('registra a credencial da loja usada em cada cobrança e valida pelo segredo da loja', async () => {
    const p = createFakeProvider();
    await p.createCharge({ token: 'loja-a' }, charge);
    expect(p.charges[0]!.credential).toEqual({ token: 'loja-a' });
    expect(p.verifyWebhook('seg', h => (h === 'x-fake-token' ? 'seg' : undefined), '{}')).toBe(true);
    expect(p.verifyWebhook('seg', () => undefined, '{}')).toBe(false);
  });
});
