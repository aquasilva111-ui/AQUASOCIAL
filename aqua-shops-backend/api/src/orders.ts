// Pedidos: valida o carrinho, calcula preços e split no servidor, cobra pelo provedor de
// pagamento (Pix) e reage ao webhook. Depois de pago, finaliza o carrinho no Mercur.
import type { CheckoutInput, Order } from '../../../aqua-shops/shared/types/index.ts';
import type { Catalog } from './catalog.ts';
import type { MercurCheckout } from './checkout.ts';
import type { PaymentEvent, PaymentProvider } from './payments.ts';
import { computeSplit, type SplitConfig } from './split.ts';
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
  /** Provedores de pagamento. O primeiro cobra os pedidos novos; todos podem confirmar/estornar os seus. */
  payments: PaymentProvider[];
  split: SplitConfig;
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
  pix: o.status === 'pending_payment' ? { payload: o.pixPayload, qrCodeBase64: o.pixQrCode, expiresAt: o.pixExpiresAt } : undefined,
  demo: false,
});

const dueDate = (now: Date) => new Date(now.getTime() + 24 * 3600_000).toISOString().slice(0, 10);

export function createOrdersService(deps: OrdersDeps) {
  const active = deps.payments[0];
  if (!active) throw new Error('Configure pelo menos um provedor de pagamento');
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

      const grossBySeller = new Map<string, number>();
      for (const i of items) grossBySeller.set(i.sellerId, (grossBySeller.get(i.sellerId) ?? 0) + i.unitCents * i.quantity);
      for (const [sellerId, shipping] of Object.entries(cart.shippingBySeller)) grossBySeller.set(sellerId, (grossBySeller.get(sellerId) ?? 0) + shipping);
      const expected = [...grossBySeller.values()].reduce((sum, v) => sum + v, 0);
      if (expected !== cart.totalCents) throw new OrderError('O preço mudou durante o pedido. Tente novamente.', 409);

      const split = computeSplit(
        [...grossBySeller].map(([sellerId, grossCents]) => ({ sellerId, grossCents })),
        deps.split,
      );

      const wallets = await deps.store.walletsFor(active.name, split.sellers.map(s => s.sellerId));
      const missing = split.sellers.filter(s => !wallets.has(s.sellerId));
      if (missing.length) throw new OrderError('Um dos vendedores ainda não pode receber pagamentos', 422);

      const id = `ord_${newId()}`;
      const createdAt = now().toISOString();
      let charge;
      try {
        charge = await active.createCharge({
          orderId: id,
          totalCents: split.totalCents,
          description: `Pedido AQUA Shops ${id.slice(4, 12)}`,
          dueDate: dueDate(now()),
          buyer: { name: input.buyer.name, email: input.buyer.email, cpfCnpj: input.buyer.cpfCnpj, phone: input.buyer.phone ?? '' },
          // Só os vendedores entram no split; o que sobra (comissão menos taxa) fica com a plataforma.
          splits: split.sellers.filter(s => s.payoutCents > 0).map(s => ({ recipientId: wallets.get(s.sellerId)!, amountCents: s.payoutCents })),
        });
      } catch (error) {
        throw new OrderError(error instanceof Error ? error.message : 'Falha ao gerar o Pix', 502);
      }

      const stored: StoredOrder = {
        id,
        number: id.replace(/\D/g, '').slice(0, 8).padEnd(8, '0'),
        status: 'pending_payment',
        buyer: input.buyer,
        items,
        split,
        totalCents: split.totalCents,
        mercurCartId: cart.cartId,
        shippingCents: Object.values(cart.shippingBySeller).reduce((sum, v) => sum + v, 0),
        paymentProvider: active.name,
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

    /** Processa um evento de pagamento. Seguro para repetir (provedores entregam "pelo menos uma vez"). */
    async handleEvent(provider: string, event: PaymentEvent): Promise<'ignored' | 'duplicate' | 'paid' | 'closed'> {
      const orderId = event.orderId;
      if (!orderId.startsWith('ord_')) return 'ignored';
      if (!(await deps.store.recordEvent(`${provider}:${event.eventId}`))) return 'duplicate';

      if (event.kind === 'paid') {
        // Só quem conseguir mudar de pending_payment para paid dispara a entrega.
        if (!(await deps.store.transition(orderId, 'pending_payment', 'paid'))) return 'duplicate';
        const order = (await deps.store.get(orderId))!;
        try {
          const { orderGroupId } = await deps.checkout.complete(order.mercurCartId);
          await deps.store.update(orderId, { mercurOrderGroupId: orderGroupId });
        } catch (error) {
          // Pagou mas não conseguimos entregar (ex.: estoque acabou): devolve o dinheiro.
          await deps.store.update(orderId, { status: 'failed', failure: error instanceof Error ? error.message : 'Falha ao criar o pedido' });
          await deps.payments.find(p => p.name === order.paymentProvider)?.refund(order.paymentId).catch(() => {});
        }
        return 'paid';
      }
      await deps.store.transition(orderId, 'pending_payment', event.kind === 'expired' ? 'expired' : 'cancelled');
      return 'closed';
    },
  };
}

export type OrdersService = ReturnType<typeof createOrdersService>;
