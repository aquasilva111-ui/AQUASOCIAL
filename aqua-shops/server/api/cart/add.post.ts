// server/api/cart/add.post.ts
import { getProduct } from '~~/server/utils/catalog';

export default defineEventHandler(async event => {
  const { productId } = await readBody<{ productId?: string }>(event);
  const product = productId ? await getProduct(productId) : null;
  if (!product || product.stock < 1) throw createError({ statusCode: 409, statusMessage: 'Estoque insuficiente' });
  const { id, title, priceCents, compareAtCents, images, stock, seller } = product;
  return { product: { id, title, priceCents, compareAtCents, images, stock, seller } };
});
