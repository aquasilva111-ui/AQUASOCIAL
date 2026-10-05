// Catálogo em memória, montado a partir do Mercur e renovado a cada TTL.
// Para o tamanho atual isso basta; quando virar gargalo, a busca vai para um
// índice próprio (Typesense) sem mudar o contrato (ver docs/aqua-shops.md).
import type { Category, Product, ProductQuery, ProductsPage } from '../../../aqua-shops/shared/types/index.ts';
import type { MercurClient } from './mercur.ts';
import { pickOffer, queryListings, toCategories, toListings, toPurchasables, type Purchasable } from './mapping.ts';

export interface Catalog {
  list(q: ProductQuery): Promise<ProductsPage>;
  get(id: string): Promise<Product | null>;
  categories(): Promise<Category[]>;
  /** Oferta que atende a quantidade, lida do Mercur agora (sem cache), para o pedido. */
  resolve(id: string, quantity: number): Promise<{ product: Product; offer: Purchasable } | null>;
}

interface Snapshot {
  listings: Product[];
  purchasables: Map<string, Purchasable[]>;
}

export function createCatalog(mercur: MercurClient, ttlMs = 30_000, now: () => number = Date.now): Catalog {
  let cache: { at: number; data: Promise<Snapshot> } | undefined;

  const fetchSnapshot = (): Promise<Snapshot> =>
    Promise.all([mercur.listAllOffers(), mercur.listAllProducts()]).then(([offers, products]) => ({
      listings: toListings(offers, products),
      purchasables: toPurchasables(offers),
    }));

  const load = () => {
    if (!cache || now() - cache.at > ttlMs) {
      const data = fetchSnapshot();
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
      return queryListings((await load()).listings, q);
    },
    async get(id) {
      return (await load()).listings.find(p => p.id === id) ?? null;
    },
    async categories() {
      return toCategories((await load()).listings);
    },
    async resolve(id, quantity) {
      // Pedido não usa cache: o estoque precisa ser o de agora.
      const snap = await fetchSnapshot();
      const offer = pickOffer(snap.purchasables, id, quantity);
      const product = snap.listings.find(p => p.id === id);
      return offer && product ? { product, offer } : null;
    },
  };
}
