import { describe, expect, it } from 'vitest';
import { CheckoutError, createMercurCheckout } from '../src/checkout.ts';

type Step = { match: RegExp; method?: string; status?: number; body: unknown };
const harness = (steps: Step[]) => {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const path = url.replace('http://mercur', '');
    const method = init.method ?? 'GET';
    calls.push({ method, path, body: init.body ? JSON.parse(init.body as string) : undefined });
    const step = steps.find(s => s.match.test(path) && (!s.method || s.method === method));
    if (!step) return new Response(JSON.stringify({ message: 'sem mock: ' + path }), { status: 500 });
    return new Response(JSON.stringify(step.body), { status: step.status ?? 200 });
  }) as unknown as typeof fetch;
  return { calls, mercur: createMercurCheckout({ baseUrl: 'http://mercur', publishableKey: 'pk_test', currency: 'brl', fetchImpl }) };
};

const buyer = { email: 'a@example.test', name: 'Maria da Silva Souza', phone: '11999990000', city: 'Cidade', address: 'Rua 1' };
const lines = [
  { offerId: 'off_a', sellerId: 'sel_a', quantity: 2, unitCents: 60000 },
  { offerId: 'off_b', sellerId: 'sel_b', quantity: 1, unitCents: 55200 },
];

const base: Step[] = [
  { match: /^\/store\/regions/, body: { regions: [{ id: 'reg_br', currency_code: 'brl' }, { id: 'reg_eu', currency_code: 'eur' }] } },
  { match: /^\/store\/carts$/, method: 'POST', body: { cart: { id: 'cart_1' } } },
  { match: /line-items$/, method: 'POST', body: { cart: {} } },
  {
    match: /^\/store\/shipping-options/,
    body: {
      shipping_options: {
        sel_a: [
          { id: 'so_a_exp', amount: 60 },
          { id: 'so_a_std', amount: 25.5 },
        ],
        sel_b: [{ id: 'so_b_std', calculated_price: { calculated_amount: 30 } }],
      },
    },
  },
  { match: /shipping-methods$/, method: 'POST', body: { cart: { total: 1755.5 } } },
];

describe('prepare', () => {
  it('monta o carrinho na região BRL, com um item por oferta e o frete mais barato de cada vendedor', async () => {
    const { mercur, calls } = harness(base);
    const cart = await mercur.prepare(buyer, lines);
    expect(cart).toEqual({ cartId: 'cart_1', shippingBySeller: { sel_a: 2550, sel_b: 3000 }, totalCents: 175550 });

    const create = calls.find(c => c.path === '/store/carts')!.body as { region_id: string; shipping_address: Record<string, unknown> };
    expect(create.region_id).toBe('reg_br');
    expect(create.shipping_address).toMatchObject({ first_name: 'Maria', last_name: 'da Silva Souza', country_code: 'br' });
    expect(calls.filter(c => c.path.endsWith('line-items')).map(c => c.body)).toEqual([
      { offer_id: 'off_a', quantity: 2 },
      { offer_id: 'off_b', quantity: 1 },
    ]);
    expect(calls.find(c => c.path.endsWith('shipping-methods'))!.body).toEqual([{ option_id: 'so_a_std' }, { option_id: 'so_b_std' }]);
  });

  it('recusa quando um vendedor não entrega no endereço', async () => {
    const { mercur } = harness([...base.filter(s => !/shipping-options/.test(String(s.match))), { match: /^\/store\/shipping-options/, body: { shipping_options: { sel_a: [{ id: 'x', amount: 1 }] } } }]);
    await expect(mercur.prepare(buyer, lines)).rejects.toMatchObject({ name: 'CheckoutError', status: 409 });
  });

  it('traduz erro de estoque do Mercur em 409', async () => {
    const { mercur } = harness([{ match: /line-items$/, method: 'POST', status: 400, body: { message: 'Inventory insuficiente' } }, ...base]);
    await expect(mercur.prepare(buyer, lines)).rejects.toMatchObject({ status: 409, message: 'Inventory insuficiente' });
  });
});

describe('complete', () => {
  const done: Step[] = [
    { match: /^\/store\/payment-collections$/, method: 'POST', body: { payment_collection: { id: 'pc_1' } } },
    { match: /payment-sessions$/, method: 'POST', body: {} },
  ];

  it('cria a sessão de pagamento e finaliza o carrinho em pedidos por vendedor', async () => {
    const { mercur, calls } = harness([...done, { match: /complete$/, method: 'POST', body: { type: 'order_group', order_group: { id: 'og_1' } } }]);
    expect(await mercur.complete('cart_1')).toEqual({ orderGroupId: 'og_1' });
    expect(calls.map(c => c.path)).toEqual(['/store/payment-collections', '/store/payment-collections/pc_1/payment-sessions', '/store/carts/cart_1/complete']);
    expect(calls[1]!.body).toEqual({ provider_id: 'pp_system_default' });
  });

  it('falha de forma explícita se o Mercur não devolver o grupo de pedidos', async () => {
    const { mercur } = harness([...done, { match: /complete$/, method: 'POST', body: { type: 'cart', error: { message: 'Pagamento não autorizado' } } }]);
    const err = await mercur.complete('cart_1').catch(e => e);
    expect(err).toBeInstanceOf(CheckoutError);
    expect(err.message).toBe('Pagamento não autorizado');
  });
});
