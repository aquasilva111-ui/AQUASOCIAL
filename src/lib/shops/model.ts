/**
 * AQUA Shops — lojas dentro da rede social, sobre AQUA Profiles.
 *
 * A Aqua é só infraestrutura: nunca toca no dinheiro. Cada loja conecta o
 * próprio provedor de pagamento e o comprador paga direto a ele. Vendedor e
 * comprador são perfis AQUA (DIDs). Dados públicos ficam no repo do vendedor:
 *
 *   at://<did>/place.aqua.shop.shop/self      uma por vendedor
 *   at://<did>/place.aqua.shop.product/<tid>  um por produto
 *   at://<did>/place.aqua.shop.review/<tid>   no repo do comprador
 *
 * Dados privados (pedidos, endereços, credenciais) ficam no backend da Aqua
 * Shops, nunca no PDS. Estoque e preço de checkout também são validados lá:
 * o preço do record é só vitrine. Um post ou Drop marca um produto com um
 * ProductRef e o feed mostra o card. Dinheiro é sempre em centavos inteiros.
 */

export const SHOP_COLLECTION = 'place.aqua.shop.shop'
export const PRODUCT_COLLECTION = 'place.aqua.shop.product'
export const REVIEW_COLLECTION = 'place.aqua.shop.review'

export type Currency = 'BRL'
export type ShopStatus = 'active' | 'paused'
export type ProductStatus = 'active' | 'draft' | 'archived'
export type ProductCondition = 'new' | 'used'

/**
 * Um pedido por loja. `refunded` só é refletido do provedor da loja: a Aqua
 * não estorna nem decide estorno.
 */
export type OrderStatus =
  | 'awaiting_payment'
  | 'paid'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'

export type Money = {
  /** Centavos inteiros. */
  amount: number
  currency: Currency
}

/** Referência a um blob do PDS (formato do AT Protocol). */
export type BlobRef = {
  $type: 'blob'
  ref: {$link: string}
  mimeType: string
  size: number
}

export type ShopPolicies = {
  shipping?: string
  returns?: string
  privacy?: string
}

export type ShopRecord = {
  $type: typeof SHOP_COLLECTION
  name: string
  description?: string
  status: ShopStatus
  policies?: ShopPolicies
  createdAt: string
}

export type ProductMedia = {
  image: BlobRef
  alt?: string
}

export type ProductVariant = {
  /** Estável dentro do produto (ex.: "p-42"). Pedidos apontam para ele. */
  id: string
  name: string
  sku?: string
  price: Money
  /** Preço "de": se maior que `price`, a variante está em oferta. */
  compareAt?: Money
}

export type ProductRecord = {
  $type: typeof PRODUCT_COLLECTION
  name: string
  description?: string
  status: ProductStatus
  condition: ProductCondition
  categoryId?: string
  media: ProductMedia[]
  variants: ProductVariant[]
  createdAt: string
}

/**
 * Avaliação, gravada no repo do comprador. Só vale para comprador verificado:
 * o indexador descarta a avaliação se o backend não tiver um pedido entregue
 * daquele comprador com aquele produto (ver `canReview`).
 */
export type ReviewRecord = {
  $type: typeof REVIEW_COLLECTION
  /** AT-URI do produto avaliado. */
  subject: string
  /** Nota inteira de 1 a 5. */
  rating: number
  text?: string
  createdAt: string
}

/** Aponta de um post/Drop para um produto da loja de `shopDid`. */
export type ProductRef = {
  shopDid: string
  productId: string
}

export type OrderLine = {
  productId: string
  variantId: string
  title: string
  quantity: number
  unitPrice: Money
}

/** Pedido de uma loja só. Privado: vive no backend, não no PDS. */
export type ShopOrder = {
  id: string
  shopDid: string
  buyerDid: string
  status: OrderStatus
  lines: OrderLine[]
  shipping: Money
  total: Money
  /** Qual provedor da loja cobrou e o id da cobrança lá. */
  payment: {provider: string; chargeId?: string}
  createdAt: string
}

export const brl = (amount: number): Money => {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error('Money must be a non-negative integer number of cents')
  }
  return {amount, currency: 'BRL'}
}

export function formatMoney(m: Money): string {
  const reais = Math.floor(m.amount / 100)
  const cents = String(m.amount % 100).padStart(2, '0')
  const grouped = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `R$ ${grouped},${cents}`
}

export function newShopRecord(
  name: string,
  now: Date = new Date(),
): ShopRecord {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Shop name is required')
  return {
    $type: SHOP_COLLECTION,
    name: trimmed.slice(0, 64),
    status: 'active',
    createdAt: now.toISOString(),
  }
}

export function newProductRecord(
  input: {
    name: string
    description?: string
    condition?: ProductCondition
    categoryId?: string
    media?: ProductMedia[]
    variants: ProductVariant[]
  },
  now: Date = new Date(),
): ProductRecord {
  const name = input.name.trim()
  if (!name) throw new Error('Product name is required')
  if (!input.variants.length) {
    throw new Error('A product needs at least one variant')
  }
  const ids = new Set<string>()
  for (const v of input.variants) {
    if (!v.id.trim() || ids.has(v.id)) {
      throw new Error('Variant ids must be unique and non-empty')
    }
    ids.add(v.id)
    brl(v.price.amount) // valida centavos inteiros e não negativos
    if (v.compareAt) brl(v.compareAt.amount)
  }
  const description = input.description?.trim()
  return {
    $type: PRODUCT_COLLECTION,
    name: name.slice(0, 120),
    ...(description ? {description: description.slice(0, 5000)} : {}),
    status: 'active',
    condition: input.condition ?? 'new',
    ...(input.categoryId ? {categoryId: input.categoryId} : {}),
    media: (input.media ?? []).slice(0, 10),
    variants: input.variants,
    createdAt: now.toISOString(),
  }
}

export function productUri(ref: ProductRef): string {
  return `at://${ref.shopDid}/${PRODUCT_COLLECTION}/${ref.productId}`
}

export function newReviewRecord(
  input: {subject: ProductRef; rating: number; text?: string},
  now: Date = new Date(),
): ReviewRecord {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new Error('Rating must be an integer between 1 and 5')
  }
  const text = input.text?.trim()
  return {
    $type: REVIEW_COLLECTION,
    subject: productUri(input.subject),
    rating: input.rating,
    ...(text ? {text: text.slice(0, 2000)} : {}),
    createdAt: now.toISOString(),
  }
}

/** Comprador verificado: o pedido é dele, já foi entregue e inclui o produto. */
export function canReview(
  order: Pick<ShopOrder, 'buyerDid' | 'status' | 'lines' | 'shopDid'>,
  buyerDid: string,
  ref: ProductRef,
): boolean {
  return (
    order.buyerDid === buyerDid &&
    order.shopDid === ref.shopDid &&
    order.status === 'delivered' &&
    order.lines.some(l => l.productId === ref.productId)
  )
}

export function productPath(ref: ProductRef): string {
  return `/shops/${ref.shopDid}/products/${encodeURIComponent(ref.productId)}`
}

/** Quem pode mover o pedido para cada estado. A Aqua nunca move dinheiro. */
export type OrderActor = 'provider' | 'merchant'

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  awaiting_payment: ['paid', 'cancelled'],
  paid: ['shipped', 'refunded', 'cancelled'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
}

const ACTORS: Record<OrderStatus, OrderActor[]> = {
  awaiting_payment: [],
  // Pagamento e estorno só chegam do provedor da loja (webhook ou leitura de status).
  paid: ['provider'],
  refunded: ['provider'],
  // Envio e entrega são do lojista.
  shipped: ['merchant'],
  delivered: ['merchant'],
  cancelled: ['provider', 'merchant'],
}

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  actor: OrderActor,
): boolean {
  return TRANSITIONS[from].includes(to) && ACTORS[to].includes(actor)
}

/**
 * Separa as linhas de um carrinho por loja: um pedido (e uma cobrança, no
 * provedor daquela loja) por loja. Não existe cobrança única da plataforma.
 */
export function groupByShop<T extends {shopDid: string}>(
  lines: T[],
): Map<string, T[]> {
  const byShop = new Map<string, T[]>()
  for (const line of lines) {
    const group = byShop.get(line.shopDid)
    if (group) group.push(line)
    else byShop.set(line.shopDid, [line])
  }
  return byShop
}

/** Soma das linhas, em centavos. O total do checkout é recalculado no backend. */
export function linesTotal(lines: OrderLine[]): Money {
  let amount = 0
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1) {
      throw new Error('Quantity must be a positive integer')
    }
    amount += l.unitPrice.amount * l.quantity
  }
  return brl(amount)
}
