import { describe, expect, it } from 'vitest';
import { AsaasError, createAsaasClient, fromReais, toReais } from '../src/asaas.ts';

type Call = { url: string; init: RequestInit };
const fake = (responses: Array<{ status?: number; body: unknown }>) => {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift()!;
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { calls, client: createAsaasClient({ baseUrl: 'https://sandbox.example/v3/', apiKey: 'chave-de-teste', fetchImpl }) };
};

describe('conversão de valores', () => {
  it('converte centavos e reais sem erro de ponto flutuante', () => {
    expect(toReais(1999)).toBe(19.99);
    expect(toReais(10)).toBe(0.1);
    expect(fromReais(19.99)).toBe(1999);
    expect(() => toReais(1.5)).toThrow();
  });
});

describe('cliente Asaas', () => {
  it('cria a cobrança Pix com split em reais e autenticação por header', async () => {
    const { client, calls } = fake([{ body: { id: 'pay_1', status: 'PENDING', value: 100 } }]);
    await client.createPixCharge({
      customerId: 'cus_1',
      valueCents: 10000,
      dueDate: '2026-10-06',
      externalReference: 'ord_1',
      description: 'Pedido 1',
      splits: [{ walletId: 'w_a', fixedValueCents: 9000 }],
    });
    const { url, init } = calls[0]!;
    expect(url).toBe('https://sandbox.example/v3/payments');
    expect((init.headers as Record<string, string>).access_token).toBe('chave-de-teste');
    expect(JSON.parse(init.body as string)).toEqual({
      customer: 'cus_1',
      billingType: 'PIX',
      value: 100,
      dueDate: '2026-10-06',
      externalReference: 'ord_1',
      description: 'Pedido 1',
      split: [{ walletId: 'w_a', fixedValue: 90 }],
    });
  });

  it('reaproveita o cliente existente e só cria se não achar', async () => {
    const a = fake([{ body: { data: [{ id: 'cus_old' }] } }]);
    expect(await a.client.findOrCreateCustomer({ name: 'A', email: 'a@x.test', cpfCnpj: '123' })).toBe('cus_old');
    expect(a.calls).toHaveLength(1);

    const b = fake([{ body: { data: [] } }, { body: { id: 'cus_new' } }]);
    expect(await b.client.findOrCreateCustomer({ name: 'A', email: 'a@x.test', cpfCnpj: '123' })).toBe('cus_new');
    expect(b.calls[1]!.url).toBe('https://sandbox.example/v3/customers');
  });

  it('transforma o erro do Asaas em AsaasError legível', async () => {
    const { client } = fake([{ status: 400, body: { errors: [{ description: 'CPF inválido' }] } }]);
    await expect(client.getPayment('pay_x')).rejects.toMatchObject({ name: 'AsaasError', message: 'CPF inválido', status: 400 });
    expect(new AsaasError('x', 500)).toBeInstanceOf(Error);
  });
});
