// server/api/checkout.post.ts
import type { CheckoutInput } from '#shared/types';
import { createOrder } from '~~/server/utils/catalog';

export default defineEventHandler(async event => {
  const body = await readBody<Partial<CheckoutInput>>(event);
  const buyer = body?.buyer;
  if (!body?.items?.length || !buyer?.email || !buyer.name || !buyer.address) {
    throw createError({ statusCode: 400, statusMessage: 'Dados do pedido incompletos' });
  }
  return await createOrder({ items: body.items, buyer, paymentMethod: 'pix' });
});
