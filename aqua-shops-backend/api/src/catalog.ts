// Catálogo em memória, montado a partir do Mercur e renovado a cada TTL.
// Para o tamanho atual isso basta; quando virar gargalo, a busca vai para um
// índice próprio (Typesense) sem mudar o contrato (ver docs/aqua-shops.md).
import type { Category, Product, ProductQuery, ProductsPage } from '../../../aqua-shops/shared/types/index.ts';
import type { MercurClient } from './mercur.ts';
import { queryListings, toCategories, toListings } from './mapping.ts';

export interface Catalog {
  list(q: ProductQuery): Promise<ProductsPage>;
  get(id: string): Promise<Product | null>;
  categories(): Promise<Category[]>;
}

export function createCatalog(mercur: MercurClient, ttlMs = 30_000, now: () => number = Date.now): Catalog {
  let cache: { at: number; data: Promise<Product[]> } | undefined;

  const load = () => {
    if (!cache || now() - cache.at > ttlMs) {
      const data = Promise.all([mercur.listAllOffers(), mercur.listAllProducts()]).then(([offers, products]) => toListings(offers, products));
      // Se falhar, não guarda o erro no cache.
      data.catch(() => {
        if (cache?.data === data) cache = undefined;
      });
      cache = { at: now(), data };
    }
    return cache.data;
  };

  return {
    async list(q) {
      return queryListings(await load(), q);
    },
    async get(id) {
      return (await load()).find(p => p.id === id) ?? null;
    },
    async categories() {
      return toCategories(await load());
    },
  };
}
