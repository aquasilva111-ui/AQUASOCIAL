import { describe, expect, it, vi } from 'vitest';
import { createAsaasProvider } from '../src/payments.ts';

const client = () => ({
  findOrCreateCustomer: vi.fn().mockResolvedValue('cus_1'),
  createPixCharge: vi.fn().mockResolvedValue({ id: 'pay_1', status: 'PENDING', value: 0 }),
  getPixQrCode: vi.fn().mockResolvedValue({ payload: '000201...', encodedImage: 'B64', expirationDate: '2026-10-06 23:59:59' }),
  refundPayment: vi.fn().mockResolvedValue({}),
});

describe('adaptador do Asaas', () => {
  it('traduz a cobrança genérica para o formato do Asaas e devolve o Pix', async () => {
    const c = client();
    const charge = await createAsaasProvider(c, 'tok').createCharge({
      orderId: 'ord_1',
      totalCents: 10000,
      description: 'Pedido',
      dueDate: '2026-10-06',
      buyer: { name: 'A', email: 'a@x.test', cpfCnpj: '12345678909', phone: '(11) 99999-0000' },
      splits: [{ recipientId: 'w1', amountCents: 9000 }],
    });
    expect(charge).toEqual({ paymentId: 'pay_1', pix: { payload: '000201...', qrCodeBase64: 'B64', expiresAt: '2026-10-06 23:59:59' } });
    expect(c.findOrCreateCustomer.mock.calls[0]![0].mobilePhone).toBe('11999990000');
    expect(c.createPixCharge.mock.calls[0]![0]).toMatchObject({ externalReference: 'ord_1', valueCents: 10000, splits: [{ walletId: 'w1', fixedValueCents: 9000 }] });
  });

  it('autentica o webhook pelo header do Asaas', () => {
    const p = createAsaasProvider(client(), 'segredo');
    expect(p.verifyWebhook(h => (h === 'asaas-access-token' ? 'segredo' : undefined), '{}')).toBe(true);
    expect(p.verifyWebhook(h => (h === 'asaas-access-token' ? 'errado' : undefined), '{}')).toBe(false);
    expect(p.verifyWebhook(() => undefined, '{}')).toBe(false);
  });

  it('traduz os eventos do Asaas e ignora o que não interessa', () => {
    const p = createAsaasProvider(client(), 't');
    const ev = (event: string, ref: string | null = 'ord_1') => ({ id: 'e1', event, payment: { externalReference: ref } });
    expect(p.parseWebhook(ev('PAYMENT_RECEIVED'))).toEqual({ eventId: 'e1', orderId: 'ord_1', kind: 'paid' });
    expect(p.parseWebhook(ev('PAYMENT_CONFIRMED'))?.kind).toBe('paid');
    expect(p.parseWebhook(ev('PAYMENT_OVERDUE'))?.kind).toBe('expired');
    expect(p.parseWebhook(ev('PAYMENT_DELETED'))?.kind).toBe('cancelled');
    expect(p.parseWebhook(ev('PAYMENT_REFUNDED'))?.kind).toBe('cancelled');
    expect(p.parseWebhook(ev('PAYMENT_CREATED'))).toBeNull();
    expect(p.parseWebhook(ev('PAYMENT_RECEIVED', 'de-outro-sistema'))).toBeNull();
    expect(p.parseWebhook(ev('PAYMENT_RECEIVED', null))).toBeNull();
    expect(p.parseWebhook(null)).toBeNull();
  });
});
