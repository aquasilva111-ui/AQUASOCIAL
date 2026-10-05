// server/api/search.get.ts
import { listProducts, cacheKey } from '~~/server/utils/catalog';

export default cachedEventHandler(
  async event => {
    const { search = '' } = getQuery(event) as { search?: string };
    return await listProducts({ search, limit: 12, sort: 'new' });
  },
  { maxAge: 60, swr: true, getKey: event => cacheKey(event.path) },
);
