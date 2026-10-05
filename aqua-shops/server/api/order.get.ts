// server/api/order.get.ts
import { getOrder } from '~~/server/utils/catalog';

// Sem cache: o cliente consulta até o Pix ser pago.
export default defineEventHandler(async event => {
  const { id } = getQuery(event) as { id?: string };
  const order = id ? await getOrder(id) : null;
  if (!order) throw createError({ statusCode: 404, statusMessage: 'Pedido não encontrado' });
  return order;
});
