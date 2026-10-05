// Checkout no Mercur: monta o carrinho (itens por oferta + frete de cada vendedor) antes de
// cobrar, e o finaliza depois que o Pix é pago. Assim o valor cobrado é exatamente o total
// do Mercur, com frete, e o pedido aparece separado por vendedor no painel de cada um.

export interface CheckoutLine {
  offerId: string;
  sellerId: string;
  quantity: number;
  unitCents: number;
}

export interface CheckoutBuyer {
  email: string;
  name: string;
  phone: string;
  city: string;
  address: string;
}

export interface PreparedCart {
  cartId: string;
  /** Frete escolhido por vendedor, em centavos. */
  shippingBySeller: Record<string, number>;
  /** Total do carrinho no Mercur (itens + frete), em centavos. */
  totalCents: number;
}

export interface MercurCheckout {
  prepare(buyer: CheckoutBuyer, lines: CheckoutLine[]): Promise<PreparedCart>;
  complete(cartId: string): Promise<{ orderGroupId: string }>;
}

export class CheckoutError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = 'CheckoutError';
  }
}

export interface MercurCheckoutConfig {
  baseUrl: string;
  publishableKey: string;
  currency: string;
  /** Provedor de pagamento do Mercur. O dinheiro passa pelo Asaas, fora do Mercur. */
  paymentProviderId?: string;
  fetchImpl?: typeof fetch;
}

const cents = (reais: number) => Math.round(reais * 100);

export function createMercurCheckout(config: MercurCheckoutConfig): MercurCheckout {
  const doFetch = config.fetchImpl ?? fetch;
  const provider = config.paymentProviderId ?? 'pp_system_default';

  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await doFetch(`${config.baseUrl}${path}`, {
      method,
      headers: { 'x-publishable-api-key': config.publishableKey, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (!res.ok) throw new CheckoutError(data.message || `Mercur ${res.status} em ${path.split('?')[0]}`, res.status === 400 || res.status === 409 ? 409 : 502);
    return data;
  }

  let regionId: Promise<string> | undefined;
  const region = () =>
    (regionId ??= call<{ regions: Array<{ id: string; currency_code: string }> }>('GET', '/store/regions').then(({ regions }) => {
      const found = regions.find(r => r.currency_code === config.currency);
      if (!found) throw new CheckoutError(`Sem região com a moeda "${config.currency}" no Mercur`);
      return found.id;
    }));

  return {
    async prepare(buyer, lines) {
      const [first = '', ...rest] = buyer.name.trim().split(/\s+/);
      const { cart } = await call<{ cart: { id: string } }>('POST', '/store/carts', {
        region_id: await region(),
        email: buyer.email,
        shipping_address: {
          first_name: first,
          last_name: rest.join(' ') || first,
          address_1: buyer.address,
          city: buyer.city,
          country_code: 'br',
          phone: buyer.phone || undefined,
        },
      });

      for (const line of lines) {
        await call('POST', `/store/carts/${cart.id}/line-items`, { offer_id: line.offerId, quantity: line.quantity });
      }

      // O Mercur devolve as opções de frete agrupadas por vendedor. Escolhemos a mais barata de cada um.
      const { shipping_options } = await call<{
        shipping_options: Record<string, Array<{ id: string; amount?: number; calculated_price?: { calculated_amount?: number } }>>;
      }>('GET', `/store/shipping-options?cart_id=${cart.id}`);

      const sellers = [...new Set(lines.map(l => l.sellerId))];
      const shippingBySeller: Record<string, number> = {};
      const chosen: Array<{ option_id: string }> = [];
      for (const sellerId of sellers) {
        const options = (shipping_options?.[sellerId] ?? []).map(o => ({ id: o.id, amount: o.amount ?? o.calculated_price?.calculated_amount ?? 0 }));
        if (!options.length) throw new CheckoutError('Um dos vendedores não entrega neste endereço', 409);
        options.sort((a, b) => a.amount - b.amount);
        chosen.push({ option_id: options[0]!.id });
        shippingBySeller[sellerId] = cents(options[0]!.amount);
      }

      const withShipping = await call<{ cart: { total: number } }>('POST', `/store/carts/${cart.id}/shipping-methods`, chosen);
      return { cartId: cart.id, shippingBySeller, totalCents: cents(withShipping.cart.total) };
    },

    async complete(cartId) {
      const { payment_collection } = await call<{ payment_collection: { id: string } }>('POST', '/store/payment-collections', { cart_id: cartId });
      await call('POST', `/store/payment-collections/${payment_collection.id}/payment-sessions`, { provider_id: provider });
      const done = await call<{ type: string; order_group?: { id: string }; error?: { message: string } }>('POST', `/store/carts/${cartId}/complete`);
      if (done.type !== 'order_group' || !done.order_group) throw new CheckoutError(done.error?.message ?? 'O Mercur não finalizou o pedido', 409);
      return { orderGroupId: done.order_group.id };
    },
  };
}
