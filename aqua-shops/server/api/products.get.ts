// server/api/products.get.ts
import type { ProductQuery, SortOrder } from '#shared/types';
import { listProducts, cacheKey } from '~~/server/utils/catalog';

const SORTS: SortOrder[] = ['new', 'price_asc', 'price_desc'];

export default cachedEventHandler(
  async event => {
    const q = getQuery(event) as Record<string, string | undefined>;
    const query: ProductQuery = {
      cursor: q.cursor,
      search: q.search,
      category: q.category,
      seller: q.seller,
      sort: SORTS.includes(q.sort as SortOrder) ? (q.sort as SortOrder) : 'new',
      limit: q.limit ? Number(q.limit) : undefined,
    };
    return await listProducts(query);
  },
  { maxAge: 60, swr: true, getKey: event => cacheKey(event.path) },
);
