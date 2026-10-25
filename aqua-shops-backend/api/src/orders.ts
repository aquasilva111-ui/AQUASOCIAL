// Pedidos: valida o carrinho e calcula preços no servidor, cobra no provedor de pagamento DA LOJA
// (com a credencial dela, o dinheiro vai direto para a conta do lojista) e reage ao webhook da loja.
// Depois de pago, finaliza o carrinho no Mercur. A Aqua não divide, não retém e não estorna nada.
import type { CheckoutInput, Order } from '../../../aqua-shops/shared/types/index.ts';
import type { Catalog } from './catalog.ts';
import type { MercurCheckout } from './checkout.ts';
import type { Connections } from './connections.ts';
import type { PaymentEvent } from './payments.ts';
import type { OrderItem, OrderStore, StoredOrder } from './store.ts';

export class OrderError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 422 | 502,
  ) {
    super(message);
    this.name = 'OrderError';
  }
}

export interface OrdersDeps {
  catalog: Catalog;
  /** Monta o carrinho no Mercur (com frete) e o finaliza depois do pagamento. */
  checkout: MercurCheckout;
  store: OrderStore;
  /** Conexão de cada loja com o provedor dela. Sem conexão, a loja não vende. */
  connections: Connections;
  now?: () => Date;
  newId?: () => string;
}

const MAX_LINES = 20;
const MAX_QTY = 99;

const onlyDigits = (s: string) => s.replace(/\D/g, '');

function validate(input: Partial<CheckoutInput> | undefined): CheckoutInput {
  const items = input?.items;
  const buyer = input?.buyer;
  if (!Array.isArray(items) || !items.length || items.length > MAX_LINES) throw new OrderError('Carrinho inválido', 400);
  for (const it of items) {
    if (typeof it?.productId !== 'string' || !it.productId || !Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > MAX_QTY) {
      throw new OrderError('Item inválido', 400);
    }
  }
  if (!buyer?.name?.trim() || !buyer.email?.includes('@') || !buyer.address?.trim() || !buyer.city?.trim()) throw new OrderError('Dados do comprador incompletos', 400);
  const cpfCnpj = onlyDigits(buyer.cpfCnpj ?? '');
  if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) throw new OrderError('CPF ou CNPJ inválido', 400);
  return { items, buyer: { ...buyer, cpfCnpj }, paymentMethod: 'pix' };
}

const toContract = (o: StoredOrder): Order => ({
  id: o.id,
  number: o.number,
  totalCents: o.totalCents,
  shippingCents: o.shippingCents,
  createdAt: o.createdAt,
  paymentMethod: 'pix',
  status: o.status,
  pix: o.status === 'awaiting_payment' ? { payload: o.pixPayload, qrCodeBase64: o.pixQrCode, expiresAt: o.pixExpiresAt } : undefined,
  demo: false,
});

const dueDate = (now: Date) => new Date(now.getTime() + 24 * 3600_000).toISOString().slice(0, 10);

export function createOrdersService(deps: OrdersDeps) {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());

  return {
    async create(raw: Partial<CheckoutInput> | undefined): Promise<Order> {
      const input = validate(raw);

      // Junta linhas repetidas do mesmo anúncio.
      const wanted = new Map<string, number>();
      for (const it of input.items) wanted.set(it.productId, (wanted.get(it.productId) ?? 0) + it.quantity);

      const items: OrderItem[] = [];
      for (const [listingId, quantity] of wanted) {
        if (quantity > MAX_QTY) throw new OrderError('Quantidade acima do limite', 400);
        const found = await deps.catalog.resolve(listingId, quantity);
        if (!found) throw new OrderError('Estoque insuficiente', 409);
        items.push({
          listingId,
          title: found.product.title,
          quantity,
          unitCents: found.offer.unitCents,
          sellerId: found.offer.sellerId,
          offerId: found.offer.offerId,
          variantId: found.offer.variantId,
        });
      }

      // O carrinho no Mercur define o valor final (com frete). O Pix cobra exatamente esse total.
      const cart = await deps.checkout
        .prepare(
          input.buyer,
          items.map(i => ({ offerId: i.offerId, sellerId: i.sellerId, quantity: i.quantity, unitCents: i.unitCents })),
        )
        .catch(error => {
          if (error instanceof OrderError) throw error;
          const status = (error as { status?: number }).status === 409 ? 409 : 502;
          throw new OrderError(error instanceof Error ? error.message : 'Falha ao montar o carrinho', status);
        });

      // Um pedido e uma cobrança por loja. Carrinho com várias lojas (uma cobrança em cada) é a fase 3.
      const sellers = [...new Set(items.map(i => i.sellerId))];
      if (sellers.length !== 1) throw new OrderError('Por enquanto cada compra aceita itens de uma loja só.', 422);
      const shopId = sellers[0]!;

      const shippingCents = Object.values(cart.shippingBySeller).reduce((sum, v) => sum + v, 0);
      const expected = items.reduce((sum, i) => sum + i.unitCents * i.quantity, 0) + shippingCents;
      if (expected !== cart.totalCents) throw new OrderError('O preço mudou durante o pedido. Tente novamente.', 409);

      const connection = await deps.connections.forShop(shopId);
      if (!connection) throw new OrderError('Esta loja ainda não conectou um provedor de pagamento', 422);

      const id = `ord_${newId()}`;
      const createdAt = now().toISOString();
      let charge;
      try {
        charge = await connection.provider.createCharge(connection.credential, {
          orderId: id,
          totalCents: cart.totalCents,
          description: `Pedido AQUA Shops ${id.slice(4, 12)}`,
          dueDate: dueDate(now()),
          buyer: { name: input.buyer.name, email: input.buyer.email, cpfCnpj: input.buyer.cpfCnpj, phone: input.buyer.phone ?? '' },
        });
      } catch (error) {
        throw new OrderError(error instanceof Error ? error.message : 'Falha ao gerar o Pix', 502);
      }

      const stored: StoredOrder = {
        id,
        number: id.replace(/\D/g, '').slice(0, 8).padEnd(8, '0'),
        status: 'awaiting_payment',
        shopId,
        buyer: input.buyer,
        items,
        totalCents: cart.totalCents,
        mercurCartId: cart.cartId,
        shippingCents,
        paymentProvider: connection.provider.name,
        paymentId: charge.paymentId,
        pixPayload: charge.pix.payload,
        pixQrCode: charge.pix.qrCodeBase64,
        pixExpiresAt: charge.pix.expiresAt,
        createdAt,
      };
      await deps.store.insert(stored);
      return toContract(stored);
    },

    async get(id: string): Promise<Order | null> {
      const o = await deps.store.get(id);
      return o ? toContract(o) : null;
    },

    /**
     * Processa um evento do webhook de uma loja. Seguro para repetir (provedores entregam "pelo menos
     * uma vez"). Só vale para pedidos DESTA loja: o segredo de uma loja não mexe no pedido de outra.
     * O estorno é do lojista; aqui só refletimos o que o provedor dele informa.
     */
    async handleEvent(provider: string, shopId: string, event: PaymentEvent): Promise<'ignored' | 'duplicate' | 'paid' | 'closed' | 'refunded'> {
      const orderId = event.orderId;
      if (!orderId.startsWith('ord_')) return 'ignored';
      const order = await deps.store.get(orderId);
      if (!order || order.shopId !== shopId || order.paymentProvider !== provider) return 'ignored';
      if (!(await deps.store.recordEvent(`${provider}:${shopId}:${event.eventId}`))) return 'duplicate';

      if (event.kind === 'paid') {
        // Só quem conseguir mudar de awaiting_payment para paid dispara a entrega.
        if (!(await deps.store.transition(orderId, 'awaiting_payment', 'paid'))) return 'duplicate';
        try {
          const { orderGroupId } = await deps.checkout.complete(order.mercurCartId);
          await deps.store.update(orderId, { mercurOrderGroupId: orderGroupId });
        } catch (error) {
          // Pagou, mas não conseguimos criar o pedido (ex.: estoque acabou). O pedido fica pago com o
          // motivo anotado para o lojista resolver (e estornar, se quiser) no provedor dele.
          await deps.store.update(orderId, { failure: error instanceof Error ? error.message : 'Falha ao criar o pedido' });
        }
        return 'paid';
      }
      if (event.kind === 'refunded') {
        for (const from of ['paid', 'shipped', 'delivered'] as const) {
          if (await deps.store.transition(orderId, from, 'refunded')) return 'refunded';
        }
        return 'ignored'; // nada pago para estornar (ex.: pedido ainda aguardando pagamento)
      }
      // Vencida ou cancelada no provedor, antes de pagar.
      await deps.store.transition(orderId, 'awaiting_payment', 'cancelled');
      return 'closed';
    },
  };
}

export type OrdersService = ReturnType<typeof createOrdersService>;
