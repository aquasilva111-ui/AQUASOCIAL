// Interface de provedor de pagamento. O resto da API só conhece isto: trocar de Asaas para
// Woovi, Mercado Pago ou cripto é escrever outro adaptador, sem mexer em pedidos nem no Mercur.
import { timingSafeEqual } from 'node:crypto';
import type { AsaasClient } from './asaas.ts';

export interface ChargeBuyer {
  name: string;
  email: string;
  cpfCnpj: string;
  phone: string;
}

export interface ChargeInput {
  orderId: string;
  totalCents: number;
  description: string;
  /** AAAA-MM-DD */
  dueDate: string;
  buyer: ChargeBuyer;
  /** Quanto cada recebedor leva. O que sobra do total é a comissão da plataforma. */
  splits: Array<{ recipientId: string; amountCents: number }>;
}

export interface PixDetails {
  /** Código "copia e cola". */
  payload: string;
  qrCodeBase64: string;
  expiresAt: string;
}

export interface Charge {
  /** Id da cobrança no provedor. */
  paymentId: string;
  pix: PixDetails;
}

/** O que a Aqua entende de um webhook, independente do provedor. */
export interface PaymentEvent {
  /** Id único do evento, para ignorar entregas repetidas. */
  eventId: string;
  /** O nosso id de pedido (guardado como referência externa na cobrança). */
  orderId: string;
  kind: 'paid' | 'expired' | 'cancelled';
}

export interface PaymentProvider {
  /** Nome curto e estável (vai na URL do webhook e no banco): "asaas", "woovi"... */
  readonly name: string;
  createCharge(input: ChargeInput): Promise<Charge>;
  /** Devolve o dinheiro de uma cobrança já paga. */
  refund(paymentId: string): Promise<void>;
  /** Confere se o webhook veio mesmo do provedor (token/assinatura nos headers). */
  verifyWebhook(header: (name: string) => string | undefined, rawBody: string): boolean;
  /** Traduz o corpo do webhook; devolve null para eventos que não nos interessam. */
  parseWebhook(body: unknown): PaymentEvent | null;
}

const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// ---- Asaas ---------------------------------------------------------------------------------

const onlyDigits = (s: string) => s.replace(/\D/g, '');

export function createAsaasProvider(client: Pick<AsaasClient, 'findOrCreateCustomer' | 'createPixCharge' | 'getPixQrCode' | 'refundPayment'>, webhookToken: string): PaymentProvider {
  return {
    name: 'asaas',

    async createCharge(input) {
      const customerId = await client.findOrCreateCustomer({
        name: input.buyer.name,
        email: input.buyer.email,
        cpfCnpj: input.buyer.cpfCnpj,
        mobilePhone: onlyDigits(input.buyer.phone) || undefined,
      });
      const charge = await client.createPixCharge({
        customerId,
        valueCents: input.totalCents,
        dueDate: input.dueDate,
        externalReference: input.orderId,
        description: input.description,
        splits: input.splits.map(s => ({ walletId: s.recipientId, fixedValueCents: s.amountCents })),
      });
      const qr = await client.getPixQrCode(charge.id);
      return { paymentId: charge.id, pix: { payload: qr.payload, qrCodeBase64: qr.encodedImage, expiresAt: qr.expirationDate } };
    },

    async refund(paymentId) {
      await client.refundPayment(paymentId);
    },

    verifyWebhook(header) {
      return sameSecret(header('asaas-access-token') ?? '', webhookToken);
    },

    parseWebhook(body) {
      const e = body as { id?: string; event?: string; payment?: { externalReference?: string | null } } | null;
      const orderId = e?.payment?.externalReference ?? undefined;
      if (!e?.id || !e.event || !orderId?.startsWith('ord_')) return null;
      const kind =
        e.event === 'PAYMENT_RECEIVED' || e.event === 'PAYMENT_CONFIRMED'
          ? 'paid'
          : e.event === 'PAYMENT_OVERDUE'
            ? 'expired'
            : e.event === 'PAYMENT_DELETED' || e.event === 'PAYMENT_REFUNDED'
              ? 'cancelled'
              : undefined;
      return kind ? { eventId: e.id, orderId, kind } : null;
    },
  };
}

// ---- Provedor de mentira (desenvolvimento e testes) ----------------------------------------

/** Não cobra nada. Gera um Pix falso e aceita webhooks com o token informado. */
export function createFakeProvider(webhookToken = 'fake-token'): PaymentProvider & { charges: ChargeInput[] } {
  const charges: ChargeInput[] = [];
  return {
    name: 'fake',
    charges,
    async createCharge(input) {
      charges.push(input);
      return {
        paymentId: `fake_${input.orderId}`,
        pix: { payload: `00020126FAKE${input.orderId}`, qrCodeBase64: 'iVBORw0KGgo=', expiresAt: `${input.dueDate} 23:59:59` },
      };
    },
    async refund() {},
    verifyWebhook(header) {
      return sameSecret(header('x-fake-token') ?? '', webhookToken);
    },
    parseWebhook(body) {
      const e = body as { id?: string; kind?: PaymentEvent['kind']; orderId?: string } | null;
      return e?.id && e.orderId && e.kind ? { eventId: e.id, orderId: e.orderId, kind: e.kind } : null;
    },
  };
}
