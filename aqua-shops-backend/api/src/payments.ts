// Conector de pagamento por loja. A Aqua nunca toca no dinheiro: cada loja conecta o PRÓPRIO
// provedor (Asaas, Mercado Pago, Stripe, Pix...) com as credenciais dela, e o comprador paga
// direto a esse provedor. Um `PaymentProvider` é só o "driver" de um provedor: não guarda estado
// nem credencial. Toda chamada recebe a credencial da loja (já decifrada) como argumento.
//
// Fora do escopo por desenho: split, comissão descontada da venda, custódia e estorno. O estorno é
// feito pelo lojista no provedor dele; a Aqua só reflete o estado (evento `refunded`).
import { timingSafeEqual } from 'node:crypto';
import { fromReais, type AsaasClient } from './asaas.ts';

/** Segredos da loja num provedor (chave de API, tokens OAuth...). Só existe decifrado em memória. */
export type ShopCredential = Record<string, string>;

export type ConnectInput =
  | { kind: 'api_key'; apiKey: string }
  | { kind: 'oauth'; code: string; redirectUri: string };

export interface ConnectContext {
  /** Endereço público do webhook desta loja neste provedor: /webhooks/<provedor>/<shopId>. */
  webhookUrl: string;
  /** Segredo de webhook desta loja (gerado pela Aqua). O provedor deve devolvê-lo nas notificações. */
  webhookSecret: string;
}

export interface ConnectResult {
  /** Id da conta da loja no provedor, se houver. */
  accountId?: string;
  /** O que guardar (cifrado) para cobrar depois. */
  credential: ShopCredential;
}

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
}

export interface PixDetails {
  /** Código "copia e cola". */
  payload: string;
  qrCodeBase64: string;
  expiresAt: string;
}

export interface Charge {
  /** Id da cobrança no provedor da loja. */
  paymentId: string;
  pix: PixDetails;
}

export type ChargeStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'refunded';

/** O que o provedor da loja diz sobre uma cobrança. É a fonte da verdade, não o webhook. */
export interface ChargeState {
  status: ChargeStatus;
  /** Valor da cobrança em centavos, quando o provedor informa. */
  amountCents?: number;
}

/** O que a Aqua entende de um webhook, independente do provedor. */
export interface PaymentEvent {
  /** Id único do evento, para ignorar entregas repetidas. */
  eventId: string;
  /** O nosso id de pedido (guardado como referência externa na cobrança). */
  orderId: string;
  /** `refunded` só reflete um estorno feito pelo lojista no provedor. */
  kind: 'paid' | 'expired' | 'cancelled' | 'refunded';
}

export interface PaymentProvider {
  /** Nome curto e estável (vai na URL do webhook e no banco): "asaas", "mercadopago"... */
  readonly name: string;
  /** Formas de a loja se conectar a este provedor. */
  readonly connectionKinds: ReadonlyArray<ConnectInput['kind']>;
  /** Só para OAuth: para onde mandar o lojista autorizar. */
  authorizationUrl?(redirectUri: string, state: string): string;
  /** Liga a loja ao provedor (chave ou OAuth) e devolve o que guardar. */
  connect(input: ConnectInput, context: ConnectContext): Promise<ConnectResult>;
  /** Cria a cobrança na conta da loja, com a credencial dela. */
  createCharge(credential: ShopCredential, input: ChargeInput): Promise<Charge>;
  /**
   * Lê o estado de uma cobrança no provedor da loja. O webhook só avisa que algo mudou: antes de marcar
   * um pedido como pago, a API confirma aqui o status e o valor.
   */
  getChargeStatus(credential: ShopCredential, paymentId: string): Promise<ChargeState>;
  /** Confere se o webhook veio mesmo do provedor DESTA loja (segredo de webhook da loja). */
  verifyWebhook(webhookSecret: string, header: (name: string) => string | undefined, rawBody: string): boolean;
  /** Traduz o corpo do webhook; devolve null para eventos que não nos interessam. */
  parseWebhook(body: unknown): PaymentEvent | null;
}

export const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// ---- Asaas ---------------------------------------------------------------------------------
// Usa a conta Asaas do PRÓPRIO lojista, sem split. Ainda não validado contra o sandbox (fase 2).

const onlyDigits = (s: string) => s.replace(/\D/g, '');

type AsaasApi = Pick<AsaasClient, 'findOrCreateCustomer' | 'createPixCharge' | 'getPixQrCode' | 'getPayment'>;

const ASAAS_STATUS: Record<string, ChargeStatus> = {
  PENDING: 'pending',
  RECEIVED: 'paid',
  CONFIRMED: 'paid',
  RECEIVED_IN_CASH: 'paid',
  OVERDUE: 'expired',
  REFUNDED: 'refunded',
  REFUND_REQUESTED: 'refunded',
  REFUND_IN_PROGRESS: 'refunded',
};

/** `clientFor` recebe a chave de API da loja e devolve o cliente do Asaas dela. */
export function createAsaasProvider(clientFor: (apiKey: string) => AsaasApi): PaymentProvider {
  const keyOf = (credential: ShopCredential) => {
    const apiKey = credential.apiKey;
    if (!apiKey) throw new Error('Loja sem chave do Asaas');
    return apiKey;
  };

  return {
    name: 'asaas',
    connectionKinds: ['api_key'],

    async connect(input) {
      if (input.kind !== 'api_key' || !input.apiKey.trim()) throw new Error('O Asaas conecta com a chave de API da loja');
      // Fase 2: validar a chave no sandbox e cadastrar o webhook da loja (context.webhookUrl/webhookSecret).
      return { credential: { apiKey: input.apiKey.trim() } };
    },

    async createCharge(credential, input) {
      const client = clientFor(keyOf(credential));
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
      });
      const qr = await client.getPixQrCode(charge.id);
      return { paymentId: charge.id, pix: { payload: qr.payload, qrCodeBase64: qr.encodedImage, expiresAt: qr.expirationDate } };
    },

    async getChargeStatus(credential, paymentId) {
      const payment = await clientFor(keyOf(credential)).getPayment(paymentId);
      return {
        status: ASAAS_STATUS[payment.status] ?? 'pending',
        ...(typeof payment.value === 'number' ? { amountCents: fromReais(payment.value) } : {}),
      };
    },

    verifyWebhook(webhookSecret, header) {
      return sameSecret(header('asaas-access-token') ?? '', webhookSecret);
    },

    parseWebhook(body) {
      const e = body as { id?: string; event?: string; payment?: { externalReference?: string | null } } | null;
      const orderId = e?.payment?.externalReference ?? undefined;
      if (!e?.id || !e.event || !orderId?.startsWith('ord_')) return null;
      const kind: PaymentEvent['kind'] | undefined =
        e.event === 'PAYMENT_RECEIVED' || e.event === 'PAYMENT_CONFIRMED'
          ? 'paid'
          : e.event === 'PAYMENT_OVERDUE'
            ? 'expired'
            : e.event === 'PAYMENT_DELETED'
              ? 'cancelled'
              : e.event === 'PAYMENT_REFUNDED'
                ? 'refunded'
                : undefined;
      return kind ? { eventId: e.id, orderId, kind } : null;
    },
  };
}

// ---- Provedor de mentira (desenvolvimento e testes) ----------------------------------------

/** Não cobra nada. Gera um Pix falso e confere o webhook pelo segredo da loja no header x-fake-token. */
export type FakeProvider = PaymentProvider & {
  /** Cobranças pedidas, com a credencial da loja usada em cada uma. */
  charges: Array<ChargeInput & { credential: ShopCredential }>;
  /** Estado devolvido por getChargeStatus (padrão: pending). */
  statuses: Map<string, ChargeStatus>;
  /** Valor devolvido por getChargeStatus (padrão: não informa). */
  amounts: Map<string, number>;
  /** Faz getChargeStatus falhar, como se o provedor estivesse fora do ar. */
  failStatusWith?: Error;
};

export function createFakeProvider(): FakeProvider {
  const charges: Array<ChargeInput & { credential: ShopCredential }> = [];
  const statuses = new Map<string, ChargeStatus>();
  const amounts = new Map<string, number>();
  const self: FakeProvider = {
    name: 'fake',
    connectionKinds: ['api_key', 'oauth'],
    charges,
    statuses,
    amounts,
    authorizationUrl: (redirectUri, state) => `https://fake.example/oauth?redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`,
    async connect(input) {
      const token = input.kind === 'api_key' ? input.apiKey : input.code;
      if (!token) throw new Error('Credencial vazia');
      return { accountId: `fake_acc_${token}`, credential: { token } };
    },
    async createCharge(credential, input) {
      charges.push({ ...input, credential });
      return {
        paymentId: `fake_${input.orderId}`,
        pix: { payload: `00020126FAKE${input.orderId}`, qrCodeBase64: 'iVBORw0KGgo=', expiresAt: `${input.dueDate} 23:59:59` },
      };
    },
    async getChargeStatus(_credential, paymentId) {
      if (self.failStatusWith) throw self.failStatusWith;
      const amountCents = amounts.get(paymentId);
      return { status: statuses.get(paymentId) ?? 'pending', ...(amountCents === undefined ? {} : { amountCents }) };
    },
    verifyWebhook(webhookSecret, header) {
      return sameSecret(header('x-fake-token') ?? '', webhookSecret);
    },
    parseWebhook(body) {
      const e = body as { id?: string; kind?: PaymentEvent['kind']; orderId?: string } | null;
      return e?.id && e.orderId && e.kind ? { eventId: e.id, orderId: e.orderId, kind: e.kind } : null;
    },
  };
  return self;
}
