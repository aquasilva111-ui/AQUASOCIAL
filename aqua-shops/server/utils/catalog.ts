// Adaptador de dados. Com AQUA_SHOPS_API definida, repassa para a API da Aqua Shops;
// sem ela, usa o catálogo de demonstração. O resto do storefront só usa estas funções.
import type { Category, CheckoutInput, Order, Product, ProductQuery, ProductsPage } from '#shared/types';
import { demoCategories, demoProducts } from './demoCatalog';

const PAGE_SIZE = 21;

function apiBase(): string {
  return String(useRuntimeConfig().shopsApi || '').replace(/\/+$/, '');
}

export const isDemo = () => !apiBase();

/** Chave de cache que separa o catálogo de demonstração da API real. */
export const cacheKey = (path: string) => `${isDemo() ? 'demo' : 'live'}:${path}`;

function remote<T>(path: string, options: Parameters<typeof $fetch>[1] = {}): Promise<T> {
  return $fetch<T>(`${apiBase()}${path}`, options as any).catch((error: any) => {
    throw createError({ statusCode: 502, statusMessage: error?.message || 'Aqua Shops API indisponível' });
  });
}

export async function listProducts(q: ProductQuery): Promise<ProductsPage> {
  if (!isDemo()) return remote<ProductsPage>('/products', { query: q });

  const term = q.search?.trim().toLowerCase();
  let items = demoProducts.filter(
    p =>
      p.stock > 0 &&
      (!q.category || p.categoryName === q.category || p.categoryId === q.category) &&
      (!q.seller || p.seller.did === q.seller) &&
      (!term || `${p.title} ${p.categoryName} ${p.seller.displayName}`.toLowerCase().includes(term)),
  );

  if (q.sort === 'price_asc') items = [...items].sort((a, b) => a.priceCents - b.priceCents);
  else if (q.sort === 'price_desc') items = [...items].sort((a, b) => b.priceCents - a.priceCents);
  else items = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const size = Math.min(Math.max(Number(q.limit) || PAGE_SIZE, 1), 50);
  const start = Math.max(Number.parseInt(q.cursor || '0', 10) || 0, 0);
  const next = start + size;
  return { items: items.slice(start, next), nextCursor: next < items.length ? String(next) : null };
}

export async function getProduct(id: string): Promise<Product | null> {
  if (!isDemo()) return remote<Product>(`/products/${encodeURIComponent(id)}`);
  return demoProducts.find(p => p.id === id) ?? null;
}

export async function listCategories(): Promise<Category[]> {
  if (!isDemo()) return remote<Category[]>('/categories');
  return demoCategories;
}

export async function createOrder(input: CheckoutInput): Promise<Order> {
  if (!isDemo()) return remote<Order>('/orders', { method: 'POST', body: input });

  // Os preços e o estoque vêm sempre do catálogo, nunca do cliente.
  let totalCents = 0;
  for (const line of input.items) {
    const product = demoProducts.find(p => p.id === line.productId);
    if (!product || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > product.stock) {
      throw createError({ statusCode: 409, statusMessage: 'Estoque insuficiente' });
    }
    totalCents += product.priceCents * line.quantity;
  }
  const number = String(Date.now()).slice(-8);
  return {
    id: `demo-${number}`,
    number,
    totalCents,
    createdAt: new Date().toISOString(),
    paymentMethod: 'pix',
    status: 'paid',
    demo: true,
  };
}

/** Estado atual de um pedido (para a tela do Pix acompanhar o pagamento). */
export async function getOrder(id: string): Promise<Order | null> {
  if (isDemo()) return null;
  return remote<Order>(`/orders/${encodeURIComponent(id)}`).catch((error: any) => {
    if (error?.statusCode === 502 && /404/.test(String(error?.statusMessage))) return null;
    throw error;
  });
}
