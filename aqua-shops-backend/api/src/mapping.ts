// Tradução pura: ofertas e produtos do Mercur → contrato da Aqua Shops.
// Produto da Aqua = produto do catálogo × vendedor (um "anúncio"). O preço é o da
// oferta mais barata do vendedor; o estoque é a soma das variantes.
import type { Category, Product, ProductQuery, ProductsPage, SortOrder } from '../../../aqua-shops/shared/types/index.ts';
import type { MercurOffer, MercurProduct } from './mercur.ts';

export const LISTING_SEPARATOR = '~';
const PAGE_SIZE = 21;
const MAX_STOCK = 999;

export const listingId = (productId: string, sellerId: string) => `${productId}${LISTING_SEPARATOR}${sellerId}`;

const toCents = (amount: number) => Math.round(amount * 100);

export function offerStock(offer: MercurOffer): number {
  const links = offer.inventory_item_link ?? [];
  if (!links.length) return 0;
  return Math.min(
    ...links.map(link => {
      const stocked = (link.inventory_item?.location_levels ?? []).reduce((sum, l) => sum + (l.stocked_quantity ?? 0), 0);
      return Math.floor(stocked / Math.max(link.required_quantity || 1, 1));
    }),
  );
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export function toListings(offers: MercurOffer[], products: MercurProduct[]): Product[] {
  const byId = new Map(products.map(p => [p.id, p]));
  const groups = new Map<string, MercurOffer[]>();
  for (const offer of offers) {
    const key = listingId(offer.product_id, offer.seller_id);
    groups.set(key, [...(groups.get(key) ?? []), offer]);
  }

  const listings: Product[] = [];
  for (const [id, group] of groups) {
    const product = byId.get(group[0]!.product_id);
    if (!product) continue;

    const priced = group.filter(o => typeof o.calculated_price?.calculated_amount === 'number');
    if (!priced.length) continue;
    const cheapest = priced.reduce((a, b) => (b.calculated_price!.calculated_amount! < a.calculated_price!.calculated_amount! ? b : a));
    const stock = Math.min(group.reduce((sum, o) => sum + offerStock(o), 0), MAX_STOCK);

    const price = cheapest.calculated_price!;
    const priceCents = toCents(price.calculated_amount!);
    const compareAt = price.original_amount != null ? toCents(price.original_amount) : undefined;

    const images = (product.images ?? [])
      .slice()
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      .map(i => i.url);
    if (!images.length && product.thumbnail) images.push(product.thumbnail);

    // Categoria "folha": a mais específica (sem filhos).
    const category = product.categories?.find(c => !c.category_children?.length) ?? product.categories?.[0];
    const seller = group[0]!.seller;

    listings.push({
      id,
      title: product.title,
      description: product.description ?? '',
      priceCents,
      compareAtCents: compareAt && compareAt > priceCents ? compareAt : undefined,
      images,
      categoryId: category?.id ?? 'sem-categoria',
      categoryName: category?.name ?? 'Outros',
      condition: product.metadata?.condition === 'used' ? 'used' : 'new',
      stock,
      seller: {
        // O Mercur não conhece DIDs. Enquanto o vendedor não liga o perfil AQUA
        // (seller.metadata.did), usamos o id do vendedor como identificador.
        did: str(seller.metadata?.did) ?? seller.id,
        handle: seller.handle,
        displayName: seller.name,
      },
      createdAt: group.map(o => o.created_at).sort()[0]!,
    });
  }
  return listings;
}

export function toCategories(listings: Product[]): Category[] {
  const seen = new Map<string, Category>();
  for (const p of listings) if (p.stock > 0 && !seen.has(p.categoryId)) seen.set(p.categoryId, { id: p.categoryId, name: p.categoryName });
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

const SORTS: Record<SortOrder, (a: Product, b: Product) => number> = {
  new: (a, b) => b.createdAt.localeCompare(a.createdAt),
  price_asc: (a, b) => a.priceCents - b.priceCents,
  price_desc: (a, b) => b.priceCents - a.priceCents,
};

export function queryListings(all: Product[], q: ProductQuery): ProductsPage {
  const term = q.search?.trim().toLowerCase();
  const items = all
    .filter(
      p =>
        p.stock > 0 &&
        (!q.category || p.categoryName === q.category || p.categoryId === q.category) &&
        (!q.seller || p.seller.did === q.seller) &&
        (!term || `${p.title} ${p.categoryName} ${p.seller.displayName}`.toLowerCase().includes(term)),
    )
    .sort(SORTS[q.sort && q.sort in SORTS ? q.sort : 'new']);

  const size = Math.min(Math.max(Number(q.limit) || PAGE_SIZE, 1), 50);
  const start = Math.max(Number.parseInt(q.cursor ?? '0', 10) || 0, 0);
  const next = start + size;
  return { items: items.slice(start, next), nextCursor: next < items.length ? String(next) : null };
}

/** Uma oferta que dá para comprar: é o que o pedido de fato reserva no Mercur. */
export interface Purchasable {
  listingId: string;
  productId: string;
  sellerId: string;
  offerId: string;
  variantId: string;
  unitCents: number;
  stock: number;
}

/** Ofertas com preço e estoque por anúncio, da mais barata para a mais cara. */
export function toPurchasables(offers: MercurOffer[]): Map<string, Purchasable[]> {
  const out = new Map<string, Purchasable[]>();
  for (const offer of offers) {
    const amount = offer.calculated_price?.calculated_amount;
    if (typeof amount !== 'number') continue;
    const stock = offerStock(offer);
    if (stock < 1) continue;
    const listingId_ = listingId(offer.product_id, offer.seller_id);
    out.set(listingId_, [
      ...(out.get(listingId_) ?? []),
      { listingId: listingId_, productId: offer.product_id, sellerId: offer.seller_id, offerId: offer.id, variantId: offer.variant_id, unitCents: toCents(amount), stock },
    ]);
  }
  for (const list of out.values()) list.sort((a, b) => a.unitCents - b.unitCents || a.offerId.localeCompare(b.offerId));
  return out;
}

/** A oferta mais barata do anúncio que tem estoque para a quantidade pedida. */
export function pickOffer(purchasables: Map<string, Purchasable[]>, id: string, quantity: number): Purchasable | null {
  return purchasables.get(id)?.find(p => p.stock >= quantity) ?? null;
}
