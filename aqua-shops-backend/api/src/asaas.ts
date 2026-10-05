// Cliente mínimo do Asaas (Pix com split). Só o que a Aqua Shops usa.
// Documentação: https://docs.asaas.com. Valores no Asaas são em reais (número);
// aqui entram e saem em centavos e a conversão fica neste arquivo.

export class AsaasError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AsaasError';
  }
}

export interface AsaasConfig {
  /** https://api-sandbox.asaas.com/v3 (testes) ou https://api.asaas.com/v3 (produção). */
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export interface PixChargeInput {
  customerId: string;
  valueCents: number;
  /** AAAA-MM-DD */
  dueDate: string;
  /** Nosso id do pedido, para achar a cobrança no webhook. */
  externalReference: string;
  description: string;
  splits: Array<{ walletId: string; fixedValueCents: number }>;
}

export interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  externalReference?: string | null;
}

export interface AsaasQrCode {
  encodedImage: string;
  payload: string;
  expirationDate: string;
}

export const toReais = (cents: number): number => {
  if (!Number.isInteger(cents) || cents < 0) throw new Error('Valor em centavos inválido');
  return Number((cents / 100).toFixed(2));
};

export const fromReais = (reais: number): number => Math.round(reais * 100);

export function createAsaasClient(config: AsaasConfig) {
  const doFetch = config.fetchImpl ?? fetch;
  const base = config.baseUrl.replace(/\/+$/, '');

  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        access_token: config.apiKey,
        // O Asaas exige User-Agent em contas novas.
        'user-agent': 'AquaShops/0.1',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    if (!res.ok) {
      const errors = (data as { errors?: Array<{ description?: string }> }).errors;
      const detail = errors?.map(e => e.description).filter(Boolean).join('; ');
      throw new AsaasError(detail || `Asaas respondeu ${res.status}`, res.status);
    }
    return data as T;
  }

  return {
    /** Reaproveita o cliente do mesmo CPF/CNPJ; senão cria. */
    async findOrCreateCustomer(input: { name: string; email: string; cpfCnpj: string; mobilePhone?: string }): Promise<string> {
      const found = await call<{ data?: Array<{ id: string }> }>('GET', `/customers?cpfCnpj=${encodeURIComponent(input.cpfCnpj)}&limit=1`);
      if (found.data?.[0]) return found.data[0].id;
      const created = await call<{ id: string }>('POST', '/customers', {
        name: input.name,
        email: input.email,
        cpfCnpj: input.cpfCnpj,
        mobilePhone: input.mobilePhone,
        notificationDisabled: true,
      });
      return created.id;
    },

    createPixCharge(input: PixChargeInput): Promise<AsaasPayment> {
      return call<AsaasPayment>('POST', '/payments', {
        customer: input.customerId,
        billingType: 'PIX',
        value: toReais(input.valueCents),
        dueDate: input.dueDate,
        externalReference: input.externalReference,
        description: input.description,
        split: input.splits.map(s => ({ walletId: s.walletId, fixedValue: toReais(s.fixedValueCents) })),
      });
    },

    getPixQrCode(paymentId: string): Promise<AsaasQrCode> {
      return call<AsaasQrCode>('GET', `/payments/${encodeURIComponent(paymentId)}/pixQrCode`);
    },

    getPayment(paymentId: string): Promise<AsaasPayment> {
      return call<AsaasPayment>('GET', `/payments/${encodeURIComponent(paymentId)}`);
    },

    refundPayment(paymentId: string): Promise<AsaasPayment> {
      return call<AsaasPayment>('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, {});
    },
  };
}

export type AsaasClient = ReturnType<typeof createAsaasClient>;
