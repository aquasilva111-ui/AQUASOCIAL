// Tipos mínimos do que lemos do Mercur/Medusa (/store/offers e /store/products)
// e o cliente HTTP. Só o necessário: se o Mercur mudar, o estrago fica aqui.

export interface MercurOffer {
  id: string;
  seller_id: string;
  product_id: string;
  variant_id: string;
  created_at: string;
  seller: { id: string; name: string; handle: string; metadata?: Record<string, unknown> | null };
  inventory_item_link?: Array<{
    required_quantity: number;
    inventory_item?: { location_levels?: Array<{ stocked_quantity: number }> };
  }>;
  calculated_price?: {
    calculated_amount: number | null;
    original_amount: number | null;
    currency_code: string | null;
  };
}

export interface MercurProduct {
  id: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  metadata?: Record<string, unknown> | null;
  images?: Array<{ url: string; rank?: number | null }>;
  categories?: Array<{ id: string; name: string; category_children?: unknown[] | null }>;
}

export interface MercurClient {
  listAllOffers(): Promise<MercurOffer[]>;
  listAllProducts(): Promise<MercurProduct[]>;
}

export interface MercurConfig {
  baseUrl: string;
  publishableKey: string;
  currency: string;
  fetchImpl?: typeof fetch;
}

const PAGE = 100;

export function createMercurClient(config: MercurConfig): MercurClient {
  const doFetch = config.fetchImpl ?? fetch;
  let regionId: Promise<string> | undefined;

  const get = async <T>(path: string): Promise<T> => {
    const res = await doFetch(`${config.baseUrl}${path}`, {
      headers: { 'x-publishable-api-key': config.publishableKey },
    });
    if (!res.ok) throw new Error(`Mercur ${res.status} em ${path.split('?')[0]}`);
    return (await res.json()) as T;
  };

  // O preço calculado só vem com a região da moeda da loja.
  const region = () =>
    (regionId ??= get<{ regions: Array<{ id: string; currency_code: string }> }>('/store/regions').then(({ regions }) => {
      const found = regions.find(r => r.currency_code === config.currency);
      if (!found) throw new Error(`Nenhuma região com a moeda "${config.currency}" no Mercur`);
      return found.id;
    }));

  const pageAll = async <T>(collection: string, build: (offset: number) => string): Promise<T[]> => {
    const out: T[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const data = await get<Record<string, unknown> & { count: number }>(build(offset));
      const items = (data[collection] as T[] | undefined) ?? [];
      out.push(...items);
      if (!items.length || out.length >= data.count) return out;
    }
  };

  return {
    async listAllOffers() {
      const region_id = await region();
      return pageAll<MercurOffer>('offers', offset => `/store/offers?limit=${PAGE}&offset=${offset}&region_id=${region_id}`);
    },
    async listAllProducts() {
      const region_id = await region();
      return pageAll<MercurProduct>('products', offset => `/store/products?limit=${PAGE}&offset=${offset}&region_id=${region_id}`);
    },
  };
}
