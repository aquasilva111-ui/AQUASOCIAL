import {type Db, type Queryable} from '../db/index.js'
import {
  grantEntitlement,
  resolveResource,
  type ResourceRef,
  revokeEntitlementsBySource,
  sellableKinds,
} from '../entitlements/index.js'
import {audit} from '../lib/audit.js'
import {badRequest, conflict, forbidden, notFound} from '../lib/errors.js'
import {newId} from '../lib/ids.js'
import {
  applyBps,
  assertCurrency,
  assertPrice,
  parseMinor,
  proportional,
} from '../lib/money.js'
import {type PaymentEvent, type PaymentProvider} from './payments/provider.js'

export type SellerType = 'creator' | 'studio'
export type OfferKind = 'ppv' | 'purchase' | 'rental' | 'subscription'

const HOUR = 3600_000

/** Which grant each sale produces. Not everything is "isPaid = true". */
const GRANT_TYPE: Record<OfferKind, string> = {
  purchase: 'purchase',
  ppv: 'ppv',
  rental: 'rental',
  subscription: 'subscription',
}

// ---------------------------------------------------------------- sellers

/**
 * Resolves which seller the caller may act as. Creators act as themselves;
 * studios (FASE 10) register a resolver that checks team roles.
 */
type SellerAuthorizer = (
  db: Queryable,
  did: string,
  sellerId: string,
) => Promise<boolean>
const sellerAuthorizers: Record<SellerType, SellerAuthorizer> = {
  creator: async (db, did, sellerId) => {
    const [row] = await db.query(
      `select 1 from creators where id = $1 and did = $2 and status = 'approved'`,
      [sellerId, did],
    )
    return !!row
  },
  studio: async () => false,
}

export function registerSellerAuthorizer(
  type: SellerType,
  fn: SellerAuthorizer,
) {
  sellerAuthorizers[type] = fn
}

export async function assertSeller(
  db: Queryable,
  did: string,
  sellerType: SellerType,
  sellerId: string,
) {
  const authorizer = sellerAuthorizers[sellerType]
  if (!authorizer || !(await authorizer(db, did, sellerId)))
    throw forbidden('not_seller')
}

export async function getApprovedCreatorForDid(db: Queryable, did: string) {
  const [row] = await db.query(
    `select id, did, status from creators where did = $1`,
    [did],
  )
  if (!row || row.status !== 'approved') throw forbidden('creator_not_approved')
  return row as {id: string; did: string}
}

// ---------------------------------------------------------------- tiers

export async function createTier(
  db: Queryable,
  did: string,
  input: {
    sellerType: SellerType
    sellerId: string
    name: string
    description?: string
    priceMinor: unknown
    currency: string
    billingPeriod: 'month' | 'year'
    benefits?: string[]
  },
) {
  await assertSeller(db, did, input.sellerType, input.sellerId)
  const currency = assertCurrency(input.currency)
  const price = assertPrice(input.priceMinor, currency)
  const tierId = newId('tier')
  const [anyTier] = await db.query(
    `select 1 from subscription_tiers where owner_type = $1 and owner_id = $2 limit 1`,
    [input.sellerType, input.sellerId],
  )
  // The first tier switches subscriptions on; later the seller controls it.
  if (!anyTier && input.sellerType === 'creator')
    await db.query(
      `update creators set subscriptions_enabled = true where id = $1`,
      [input.sellerId],
    )
  const offerId = newId('offer')
  await db.query(
    `insert into subscription_tiers (id, owner_type, owner_id, name, description, price_minor, currency, billing_period, benefits)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      tierId,
      input.sellerType,
      input.sellerId,
      input.name,
      input.description ?? null,
      price.toString(),
      currency,
      input.billingPeriod,
      JSON.stringify(input.benefits ?? []),
    ],
  )
  await db.query(
    `insert into offers (id, seller_type, seller_id, kind, resource_type, resource_id, tier_id, price_minor, currency)
     values ($1, $2, $3, 'subscription', $2, $3, $4, $5, $6)`,
    [
      offerId,
      input.sellerType,
      input.sellerId,
      tierId,
      price.toString(),
      currency,
    ],
  )
  return {tierId, offerId}
}

/**
 * Tier edits never rewrite history: existing orders keep their snapshot
 * amounts and subscriptions keep their tier. A price change retires the old
 * subscription offer and creates a new one for future checkouts.
 */
export async function updateTier(
  db: Db,
  did: string,
  tierId: string,
  patch: {
    name?: string
    description?: string
    benefits?: string[]
    active?: boolean
    priceMinor?: unknown
  },
) {
  return db.transaction(async tx => {
    const [tier] = await tx.query(
      `select * from subscription_tiers where id = $1`,
      [tierId],
    )
    if (!tier) throw notFound()
    await assertSeller(tx, did, tier.owner_type, tier.owner_id)
    await tx.query(
      `update subscription_tiers set
         name = coalesce($2, name), description = coalesce($3, description),
         benefits = coalesce($4::jsonb, benefits), active = coalesce($5, active)
       where id = $1`,
      [
        tierId,
        patch.name ?? null,
        patch.description ?? null,
        patch.benefits ? JSON.stringify(patch.benefits) : null,
        patch.active ?? null,
      ],
    )
    if (patch.priceMinor !== undefined) {
      const price = assertPrice(patch.priceMinor, tier.currency)
      await tx.query(
        `update offers set active = false where tier_id = $1 and kind = 'subscription'`,
        [tierId],
      )
      await tx.query(
        `update subscription_tiers set price_minor = $2 where id = $1`,
        [tierId, price.toString()],
      )
      await tx.query(
        `insert into offers (id, seller_type, seller_id, kind, resource_type, resource_id, tier_id, price_minor, currency)
         values ($1, $2, $3, 'subscription', $2, $3, $4, $5, $6)`,
        [
          newId('offer'),
          tier.owner_type,
          tier.owner_id,
          tierId,
          price.toString(),
          tier.currency,
        ],
      )
    }
    if (patch.active === false) {
      await tx.query(`update offers set active = false where tier_id = $1`, [
        tierId,
      ])
    }
  })
}

// ---------------------------------------------------------------- offers

export async function createOffer(
  db: Queryable,
  did: string,
  input: {
    sellerType: SellerType
    sellerId: string
    kind: Exclude<OfferKind, 'subscription'>
    resource: ResourceRef
    priceMinor: unknown
    currency: string
    accessHours?: number
  },
) {
  await assertSeller(db, did, input.sellerType, input.sellerId)
  const resource = await resolveResource(db, input.resource)
  if (!resource) throw badRequest('unknown_resource')
  // The seller must own what they sell.
  if (!resource.ownerDids.includes(did)) throw forbidden('not_owner')
  if (resource.status === 'removed' || resource.status === 'quarantined')
    throw forbidden('under_moderation')
  // Only offers whose grant actually unlocks the item are eligible.
  if (!sellableKinds(resource.policy).includes(input.kind))
    throw badRequest('offer_kind_mismatch')
  const currency = assertCurrency(input.currency)
  const price = assertPrice(input.priceMinor, currency)
  if (
    (input.kind === 'rental' || input.kind === 'ppv') &&
    !(input.accessHours! > 0)
  )
    throw badRequest('access_hours_required')
  const id = newId('offer')
  await db.query(
    `insert into offers (id, seller_type, seller_id, kind, resource_type, resource_id, price_minor, currency, access_hours)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      input.sellerType,
      input.sellerId,
      input.kind,
      input.resource.type,
      input.resource.id,
      price.toString(),
      currency,
      input.kind === 'purchase' ? null : input.accessHours,
    ],
  )
  return {offerId: id}
}

/** Switching subscriptions off blocks new checkouts; history stays. */
export async function subscriptionsEnabled(
  db: Queryable,
  sellerType: SellerType,
  sellerId: string,
) {
  const [row] = await db.query(
    sellerType === 'creator'
      ? `select subscriptions_enabled from creators where id = $1`
      : `select subscriptions_enabled from studios where id = $1`,
    [sellerId],
  )
  return !!row?.subscriptions_enabled
}

// ---------------------------------------------------------------- checkout

export async function checkout(
  db: Db,
  provider: PaymentProvider,
  buyerDid: string,
  input: {offerId: string; idempotencyKey: string},
) {
  if (!input.idempotencyKey || input.idempotencyKey.length > 100)
    throw badRequest('idempotency_key_required')

  const prepared = await db.transaction(async tx => {
    const [existing] = await tx.query(
      `select * from orders where buyer_did = $1 and idempotency_key = $2`,
      [buyerDid, input.idempotencyKey],
    )
    if (existing) return {order: existing, created: false}

    const [offer] = await tx.query(
      `select * from offers where id = $1 and active`,
      [input.offerId],
    )
    if (!offer) throw notFound()
    if (
      offer.kind === 'subscription' &&
      !(await subscriptionsEnabled(tx, offer.seller_type, offer.seller_id))
    )
      throw conflict('subscriptions_disabled')
    const [fees] = await tx.query(`select * from fee_config where id = 1`)
    const subtotal = parseMinor(offer.price_minor)
    const tax = applyBps(subtotal, fees.tax_bps)
    const total = subtotal + tax
    const id = newId('ord')
    let subscriptionId: string | null = null
    if (offer.kind === 'subscription') {
      subscriptionId = newId('sub')
      await tx.query(
        `insert into subscriptions (id, subscriber_did, target_type, target_id, tier_id, status)
         values ($1, $2, $3, $4, $5, 'PENDING')`,
        [
          subscriptionId,
          buyerDid,
          offer.seller_type,
          offer.seller_id,
          offer.tier_id,
        ],
      )
    }
    const [order] = await tx.query(
      `insert into orders (id, buyer_did, seller_type, seller_id, type, offer_id, resource_type, resource_id,
                           subtotal_minor, tax_minor, total_minor, currency, status, payment_provider,
                           idempotency_key, subscription_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PENDING', $13, $14, $15)
       returning *`,
      [
        id,
        buyerDid,
        offer.seller_type,
        offer.seller_id,
        offer.kind,
        offer.id,
        offer.resource_type,
        offer.resource_id,
        subtotal.toString(),
        tax.toString(),
        total.toString(),
        offer.currency,
        provider.name,
        input.idempotencyKey,
        subscriptionId,
      ],
    )
    return {order, created: true, offer}
  })

  if (!prepared.created) return publicOrder(prepared.order)

  const order = prepared.order
  const checkoutInput = {
    orderId: order.id,
    amountMinor: parseMinor(order.total_minor),
    currency: order.currency,
    description: 'AQUA purchase',
  }
  const [tier] =
    order.type === 'subscription'
      ? await db.query(
          `select t.billing_period from subscription_tiers t join offers o on o.tier_id = t.id where o.id = $1`,
          [order.offer_id],
        )
      : []
  const result =
    order.type === 'subscription'
      ? await provider.createSubscription({
          ...checkoutInput,
          billingPeriod: tier.billing_period,
        })
      : await provider.createCheckout(checkoutInput)

  const [updated] = await db.query(
    `update orders set status = 'PROCESSING', provider_reference = $2
      where id = $1 and status = 'PENDING' returning *`,
    [order.id, result.providerReference],
  )
  if (order.subscription_id) {
    await db.query(
      `update subscriptions set provider_reference = $2 where id = $1`,
      [order.subscription_id, result.providerReference],
    )
  }
  return {...publicOrder(updated), checkoutUrl: result.checkoutUrl}
}

export function publicOrder(o: any) {
  return {
    id: o.id,
    type: o.type,
    status: o.status,
    resourceType: o.resource_type,
    resourceId: o.resource_id,
    subtotalMinor: String(o.subtotal_minor),
    taxMinor: String(o.tax_minor),
    totalMinor: String(o.total_minor),
    refundedMinor: String(o.refunded_minor),
    currency: o.currency,
    createdAt: new Date(o.created_at).toISOString(),
    confirmedAt: o.confirmed_at ? new Date(o.confirmed_at).toISOString() : null,
  }
}

// ---------------------------------------------------------------- webhooks

/**
 * Applies one verified provider event. Idempotent: the (provider, event id)
 * insert happens first in the same transaction, so a duplicate delivery
 * changes nothing — no second order, entitlement or ledger entry.
 */
export async function applyPaymentEvent(
  db: Db,
  providerName: string,
  event: PaymentEvent,
  now = new Date(),
): Promise<'applied' | 'duplicate' | 'ignored'> {
  return db.transaction(async tx => {
    const inserted = await tx.query(
      `insert into payment_events (provider, provider_event_id, type)
       values ($1, $2, $3) on conflict (provider, provider_event_id) do nothing returning id`,
      [providerName, event.id, event.type],
    )
    if (!inserted.length) return 'duplicate'

    if (event.type.startsWith('subscription.')) {
      return applySubscriptionEvent(tx, providerName, event, now)
    }

    const [order] = await tx.query(
      `select * from orders where provider_reference = $1 and payment_provider = $2 for update`,
      [event.providerReference, providerName],
    )
    if (!order) return 'ignored'

    switch (event.type) {
      case 'payment.succeeded':
        return confirmOrder(tx, order, event, now)
      case 'payment.failed':
        if (order.status !== 'PENDING' && order.status !== 'PROCESSING')
          return 'ignored'
        await tx.query(`update orders set status = 'FAILED' where id = $1`, [
          order.id,
        ])
        if (order.subscription_id)
          await tx.query(
            `update subscriptions set status = 'EXPIRED' where id = $1 and status = 'PENDING'`,
            [order.subscription_id],
          )
        return 'applied'
      case 'refund.succeeded':
        return refundOrder(tx, order, event, now)
      case 'dispute.created':
        return disputeOrder(tx, order, event)
      case 'dispute.won':
        return resolveDisputeWon(tx, order, event, now)
      case 'chargeback.created':
        return chargebackOrder(tx, order, event)
      default:
        return 'ignored'
    }
  })
}

async function confirmOrder(
  tx: Queryable,
  order: any,
  event: PaymentEvent,
  now: Date,
) {
  if (order.status !== 'PENDING' && order.status !== 'PROCESSING')
    return 'ignored'
  // The provider must have charged exactly what the order says.
  if (
    event.amountMinor === undefined ||
    event.amountMinor !== parseMinor(order.total_minor) ||
    event.currency !== order.currency
  ) {
    await audit(tx, {
      actor: null,
      action: 'order.amount_mismatch',
      resourceType: 'order',
      resourceId: order.id,
      result: 'denied',
    })
    return 'ignored'
  }
  await tx.query(
    `update orders set status = 'PAID', confirmed_at = $2 where id = $1`,
    [order.id, now],
  )
  await grantForOrder(tx, order, now)
  await recordSale(tx, order)
  return 'applied'
}

async function grantForOrder(tx: Queryable, order: any, now: Date) {
  const [offer] = await tx.query(`select * from offers where id = $1`, [
    order.offer_id,
  ])
  if (order.type === 'subscription') {
    const [tier] = await tx.query(
      `select * from subscription_tiers where id = $1`,
      [offer.tier_id],
    )
    const [sub] = await tx.query(`select * from subscriptions where id = $1`, [
      order.subscription_id,
    ])
    const start =
      sub.current_period_end && new Date(sub.current_period_end) > now
        ? new Date(sub.current_period_end)
        : now
    const end = addPeriod(start, tier.billing_period)
    await tx.query(
      `update subscriptions set status = 'ACTIVE', started_at = coalesce(started_at, $2),
         current_period_start = $3, current_period_end = $4
       where id = $1`,
      [sub.id, now, start, end],
    )
    await grantEntitlement(tx, {
      userDid: order.buyer_did,
      resource: {type: sub.target_type, id: sub.target_id},
      type: 'subscription',
      tierId: sub.tier_id,
      sourceType: 'order',
      sourceId: order.id,
      startsAt: now,
      expiresAt: end,
    })
    return
  }
  const hours = offer.access_hours as number | null
  await grantEntitlement(tx, {
    userDid: order.buyer_did,
    resource: {type: order.resource_type, id: order.resource_id},
    type: GRANT_TYPE[order.type as OfferKind],
    sourceType: 'order',
    sourceId: order.id,
    startsAt: now,
    // purchase = permanent; ppv/rental = temporary window
    expiresAt:
      order.type === 'purchase'
        ? null
        : new Date(now.getTime() + hours! * HOUR),
  })
}

function addPeriod(from: Date, period: 'month' | 'year') {
  const d = new Date(from)
  if (period === 'year') d.setUTCFullYear(d.getUTCFullYear() + 1)
  else d.setUTCMonth(d.getUTCMonth() + 1)
  return d
}

async function ledger(
  tx: Queryable,
  order: any,
  type: string,
  amount: bigint,
  reference: string,
) {
  if (amount === 0n) return
  await tx.query(
    `insert into ledger_entries (seller_type, seller_id, order_id, type, amount_minor, currency, reference)
     values ($1, $2, $3, $4, $5, $6, $7) on conflict (order_id, type, reference) do nothing`,
    [
      order.seller_type,
      order.seller_id,
      order.id,
      type,
      amount.toString(),
      order.currency,
      reference,
    ],
  )
}

async function feeAmounts(tx: Queryable, subtotal: bigint) {
  const [fees] = await tx.query(`select * from fee_config where id = 1`)
  return {
    platform: applyBps(subtotal, fees.platform_fee_bps),
    processing: applyBps(subtotal, fees.processing_fee_bps),
  }
}

async function recordSale(tx: Queryable, order: any) {
  const subtotal = parseMinor(order.subtotal_minor)
  const fees = await feeAmounts(tx, subtotal)
  await tx.query(`update orders set fees_minor = $2 where id = $1`, [
    order.id,
    (fees.platform + fees.processing).toString(),
  ])
  await ledger(tx, order, 'SALE', subtotal, 'sale')
  await ledger(tx, order, 'PLATFORM_FEE', -fees.platform, 'sale')
  await ledger(tx, order, 'PROCESSING_FEE', -fees.processing, 'sale')
}

async function refundOrder(
  tx: Queryable,
  order: any,
  event: PaymentEvent,
  now: Date,
) {
  if (!['PAID', 'PARTIALLY_REFUNDED'].includes(order.status)) return 'ignored'
  const total = parseMinor(order.total_minor)
  const alreadyRefunded = parseMinor(order.refunded_minor)
  const amount = event.amountMinor ?? total - alreadyRefunded
  if (
    amount <= 0n ||
    alreadyRefunded + amount > total ||
    (event.currency && event.currency !== order.currency)
  ) {
    await audit(tx, {
      actor: null,
      action: 'order.refund_rejected',
      resourceType: 'order',
      resourceId: order.id,
      result: 'denied',
    })
    return 'ignored'
  }
  const refunded = alreadyRefunded + amount
  const full = refunded === total
  await tx.query(
    `update orders set refunded_minor = $2, status = $3, refunded_at = $4 where id = $1`,
    [
      order.id,
      refunded.toString(),
      full ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      now,
    ],
  )
  const subtotal = parseMinor(order.subtotal_minor)
  const subtotalShare = proportional(amount, total, subtotal)
  const fees = await feeAmounts(tx, subtotal)
  await ledger(tx, order, 'REFUND', -subtotalShare, `refund:${event.id}`)
  // The platform returns its proportional fee on refunds.
  await ledger(
    tx,
    order,
    'ADJUSTMENT',
    proportional(amount, total, fees.platform),
    `refund:${event.id}:platform_fee`,
  )
  if (full) {
    // Partial refunds keep access; a full refund revokes what the order granted.
    await revokeEntitlementsBySource(tx, 'order', order.id, 'refunded')
    if (order.subscription_id)
      await tx.query(
        `update subscriptions set status = 'REFUNDED' where id = $1`,
        [order.subscription_id],
      )
  }
  return 'applied'
}

async function disputeOrder(tx: Queryable, order: any, event: PaymentEvent) {
  if (!['PAID', 'PARTIALLY_REFUNDED'].includes(order.status)) return 'ignored'
  await tx.query(`update orders set status = 'DISPUTED' where id = $1`, [
    order.id,
  ])
  await revokeEntitlementsBySource(tx, 'order', order.id, 'disputed')
  if (order.subscription_id)
    await tx.query(
      `update subscriptions set status = 'DISPUTED' where id = $1`,
      [order.subscription_id],
    )
  const held = await remainingNet(tx, order)
  await ledger(tx, order, 'RESERVE', -held, `dispute:${event.id}`)
  return 'applied'
}

async function resolveDisputeWon(
  tx: Queryable,
  order: any,
  event: PaymentEvent,
  now: Date,
) {
  if (order.status !== 'DISPUTED') return 'ignored'
  const [reserve] = await tx.query(
    `select coalesce(sum(amount_minor), 0) as total from ledger_entries where order_id = $1 and type in ('RESERVE', 'RESERVE_RELEASE')`,
    [order.id],
  )
  await tx.query(`update orders set status = 'PAID' where id = $1`, [order.id])
  await ledger(
    tx,
    order,
    'RESERVE_RELEASE',
    -parseMinor(reserve.total),
    `dispute_won:${event.id}`,
  )
  await grantForOrder(tx, order, now)
  return 'applied'
}

async function chargebackOrder(tx: Queryable, order: any, event: PaymentEvent) {
  if (!['PAID', 'PARTIALLY_REFUNDED', 'DISPUTED'].includes(order.status))
    return 'ignored'
  const [reserve] = await tx.query(
    `select coalesce(sum(amount_minor), 0) as total from ledger_entries where order_id = $1 and type in ('RESERVE', 'RESERVE_RELEASE')`,
    [order.id],
  )
  const subtotal = parseMinor(order.subtotal_minor)
  const refundedShare = proportional(
    parseMinor(order.refunded_minor),
    parseMinor(order.total_minor),
    subtotal,
  )
  await tx.query(`update orders set status = 'CHARGEBACK' where id = $1`, [
    order.id,
  ])
  await revokeEntitlementsBySource(tx, 'order', order.id, 'chargeback')
  if (order.subscription_id)
    await tx.query(
      `update subscriptions set status = 'DISPUTED' where id = $1`,
      [order.subscription_id],
    )
  await ledger(
    tx,
    order,
    'RESERVE_RELEASE',
    -parseMinor(reserve.total),
    `chargeback:${event.id}`,
  )
  await ledger(
    tx,
    order,
    'CHARGEBACK',
    -(subtotal - refundedShare),
    `chargeback:${event.id}`,
  )
  return 'applied'
}

async function remainingNet(tx: Queryable, order: any) {
  const [row] = await tx.query(
    `select coalesce(sum(amount_minor), 0) as total from ledger_entries where order_id = $1`,
    [order.id],
  )
  const net = parseMinor(row.total)
  return net > 0n ? net : 0n
}

async function applySubscriptionEvent(
  tx: Queryable,
  providerName: string,
  event: PaymentEvent,
  now: Date,
): Promise<'applied' | 'ignored'> {
  const [sub] = await tx.query(
    `select * from subscriptions where provider_reference = $1 for update`,
    [event.providerReference],
  )
  if (!sub) return 'ignored'
  switch (event.type) {
    case 'subscription.renewed': {
      if (!['ACTIVE', 'PAST_DUE'].includes(sub.status)) return 'ignored'
      const [tier] = await tx.query(
        `select * from subscription_tiers where id = $1`,
        [sub.tier_id],
      )
      const [offer] = await tx.query(
        `select * from offers where tier_id = $1 and kind = 'subscription' order by active desc, created_at desc limit 1`,
        [sub.tier_id],
      )
      if (event.amountMinor === undefined || event.currency !== tier.currency)
        return 'ignored'
      const [order] = await tx.query(
        `insert into orders (id, buyer_did, seller_type, seller_id, type, offer_id, subtotal_minor, tax_minor,
                             total_minor, currency, status, payment_provider, idempotency_key, subscription_id,
                             confirmed_at, resource_type, resource_id)
         values ($1, $2, $3, $4, 'subscription', $5, $6, 0, $6, $7, 'PAID', $8, $9, $10, $11, $3, $4)
         returning *`,
        [
          newId('ord'),
          sub.subscriber_did,
          sub.target_type,
          sub.target_id,
          offer.id,
          event.amountMinor.toString(),
          tier.currency,
          providerName,
          `renewal:${event.id}`,
          sub.id,
          now,
        ],
      )
      await grantForOrder(tx, order, now)
      await recordSale(tx, order)
      return 'applied'
    }
    case 'subscription.payment_failed':
      await tx.query(
        `update subscriptions set status = 'PAST_DUE' where id = $1 and status = 'ACTIVE'`,
        [sub.id],
      )
      return 'applied'
    case 'subscription.cancelled':
      // Access runs to the end of the paid period; entitlement expires then.
      await tx.query(
        `update subscriptions set status = 'CANCELLED', cancelled_at = $2 where id = $1
           and status in ('ACTIVE', 'PAST_DUE', 'PENDING')`,
        [sub.id, now],
      )
      return 'applied'
    default:
      return 'ignored'
  }
}

// ---------------------------------------------------------------- subscriptions

export async function cancelSubscription(
  db: Queryable,
  provider: PaymentProvider,
  did: string,
  subscriptionId: string,
) {
  const [sub] = await db.query(
    `select * from subscriptions where id = $1 and subscriber_did = $2`,
    [subscriptionId, did],
  )
  if (!sub) throw notFound()
  if (!['ACTIVE', 'PAST_DUE'].includes(sub.status)) throw conflict('not_active')
  await provider.cancelSubscription(sub.provider_reference, {atPeriodEnd: true})
  await db.query(
    `update subscriptions set cancel_at_period_end = true where id = $1`,
    [sub.id],
  )
}

/** Marks subscriptions whose paid period ended as EXPIRED (run periodically). */
export async function expireSubscriptions(db: Queryable, now = new Date()) {
  const rows = await db.query(
    `update subscriptions set status = 'EXPIRED'
      where status in ('ACTIVE', 'PAST_DUE', 'CANCELLED') and current_period_end <= $1
      returning id`,
    [now],
  )
  return rows.length
}

// ---------------------------------------------------------------- ledger

/** Balances come from the ledger, never from summing orders client-side. */
export async function ledgerSummary(
  db: Queryable,
  sellerType: SellerType,
  sellerId: string,
  holdDays = 7,
  now = new Date(),
) {
  const rows = await db.query(
    `select currency, type, sum(amount_minor) as total,
            sum(case when created_at > $3 then amount_minor else 0 end) as recent
       from ledger_entries where seller_type = $1 and seller_id = $2
      group by currency, type`,
    [sellerType, sellerId, new Date(now.getTime() - holdDays * 24 * HOUR)],
  )
  const byCurrency: Record<string, Record<string, bigint>> = {}
  for (const r of rows) {
    const c = (byCurrency[r.currency] ??= {net: 0n, pending: 0n})
    c[r.type] = parseMinor(r.total)
    c.net += parseMinor(r.total)
    if (r.type !== 'PAYOUT') c.pending += parseMinor(r.recent)
  }
  return Object.fromEntries(
    Object.entries(byCurrency).map(([currency, c]) => {
      const pending = c.pending > 0n ? c.pending : 0n
      const available = c.net - pending
      const out = {
        gross: c.SALE ?? 0n,
        platformFees: c.PLATFORM_FEE ?? 0n,
        processingFees: c.PROCESSING_FEE ?? 0n,
        refunds: c.REFUND ?? 0n,
        chargebacks: c.CHARGEBACK ?? 0n,
        adjustments: c.ADJUSTMENT ?? 0n,
        reserve: (c.RESERVE ?? 0n) + (c.RESERVE_RELEASE ?? 0n),
        payouts: c.PAYOUT ?? 0n,
        net: c.net,
        pending,
        available: available > 0n ? available : 0n,
      }
      return [
        currency,
        Object.fromEntries(
          Object.entries(out).map(([k, v]) => [k, v.toString()]),
        ),
      ]
    }),
  )
}
