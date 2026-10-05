/**
 * AQUA Shops — marketplace on top of AQUA Profiles.
 *
 * Seller and buyer are AQUA Profiles (DIDs), not separate accounts. Orders,
 * stock and payments live in the Aqua Shops backend (never in the PDS); the
 * seller's repo only holds the public storefront record:
 *
 *   at://<did>/place.aqua.shop.shop/self      one per seller
 *
 * A post or Drop can tag a product with a ProductRef, so the social feed
 * renders a product card. Money is always integer cents (BRL by default).
 */

export const SHOP_COLLECTION = 'place.aqua.shop.shop'

export type Currency = 'BRL'
export type ShopStatus = 'active' | 'paused'
export type ProductCondition = 'new' | 'used'
export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'

export type ShopRecord = {
  $type: typeof SHOP_COLLECTION
  name: string
  description?: string
  status: ShopStatus
  createdAt: string
}

/** Pointer from a post/Drop to a product in the Aqua Shops backend. */
export type ProductRef = {
  shopDid: string
  productId: string
}

export type Money = {
  /** Integer cents. */
  amount: number
  currency: Currency
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

export function productPath(ref: ProductRef): string {
  return `/shops/${ref.shopDid}/products/${encodeURIComponent(ref.productId)}`
}

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['paid', 'cancelled'],
  paid: ['shipped', 'refunded', 'cancelled'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/** Platform fee in cents, rounded down so the seller never gets less than owed. */
export function splitPayment(
  total: Money,
  feeBps: number,
): {fee: Money; seller: Money} {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10000) {
    throw new Error('feeBps must be an integer between 0 and 10000')
  }
  const fee = Math.floor((total.amount * feeBps) / 10000)
  return {
    fee: {amount: fee, currency: total.currency},
    seller: {amount: total.amount - fee, currency: total.currency},
  }
}
