// server/api/product.get.ts
import { getProduct, cacheKey } from '~~/server/utils/catalog';

export default cachedEventHandler(
  async event => {
    const { id } = getQuery(event) as { id?: string };
    const product = id ? await getProduct(id) : null;
    if (!product) throw createError({ statusCode: 404, statusMessage: 'Produto não encontrado' });
    return product;
  },
  { maxAge: 60, swr: true, getKey: event => cacheKey(event.path) },
);
