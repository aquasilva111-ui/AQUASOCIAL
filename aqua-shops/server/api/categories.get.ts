// server/api/categories.get.ts
import { cacheKey, listCategories } from '~~/server/utils/catalog';

export default cachedEventHandler(async () => await listCategories(), { maxAge: 60 * 60, swr: true, getKey: () => cacheKey('/api/categories') });
