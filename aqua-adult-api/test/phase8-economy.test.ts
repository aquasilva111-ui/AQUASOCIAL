import {beforeEach, describe, expect, it} from 'vitest'

import {InsecureConfigError, loadConfig} from '../src/config.js'
import {expireSubscriptions} from '../src/economy/index.js'
import {MockPaymentProvider} from '../src/economy/payments/mock.js'
import {checkAccess} from '../src/entitlements/index.js'
import {createTestApp, did, type TestApp} from './helpers.js'

const CREATOR = did('creator')
const BUYER = did('buyer')
const OTHER = did('other')

let t: TestApp
let creatorId: string
const postUri = `at://${CREATOR}/app.bsky.feed.post/3kpostppv`

beforeEach(async () => {
  t = await createTestApp()
  creatorId = await t.approvedCreator(CREATOR, 'creator.test')
  await t.verifiedUser(BUYER)
  await t.verifiedUser(OTHER)
})

async function ppvPost(policy = 'ppv_required', uri = postUri) {
  const r = await t.call('POST', '/creator/resources', CREATOR, {
    resourceType: 'post',
    resourceId: uri,
    accessPolicy: policy,
  })
  expect(r.status).toBe(200)
}

async function offer(
  kind: 'ppv' | 'purchase' | 'rental',
  price: number | string = 1990,
  extra = {},
) {
  const r = await t.call('POST', '/creator/offers', CREATOR, {
    resourceType: 'post',
    resourceId: postUri,
    kind,
    priceMinor: price,
    currency: 'BRL',
    accessHours: kind === 'purchase' ? undefined : 48,
    ...extra,
  })
  return r
}

const access = (who: string, uri = postUri) =>
  t.call('POST', '/access/check', who, {resourceType: 'post', resourceId: uri})

describe('auth', () => {
  it('rejects anonymous requests', async () => {
    expect((await t.call('GET', '/me/entitlements')).status).toBe(401)
  })

  it('accepts a service token signed by the user and addressed to this service', async () => {
    const token = await t.serviceToken(BUYER)
    const res = await t.app.inject({
      method: 'GET',
      url: '/me/entitlements',
      headers: {authorization: `Bearer ${token}`},
    })
    expect(res.statusCode).toBe(200)
  })

  it('rejects tokens for another audience and forged signatures', async () => {
    const wrongAud = await t.serviceToken(BUYER, 'did:web:someone-else.test')
    const r1 = await t.app.inject({
      method: 'GET',
      url: '/me/entitlements',
      headers: {authorization: `Bearer ${wrongAud}`},
    })
    expect(r1.statusCode).toBe(401)
    const token = await t.serviceToken(BUYER)
    await t.serviceToken(BUYER) // rotates the registered key: old signature no longer matches
    const r2 = await t.app.inject({
      method: 'GET',
      url: '/me/entitlements',
      headers: {authorization: `Bearer ${token}`},
    })
    expect(r2.statusCode).toBe(401)
  })

  it('ignores the dev header when dev auth is off', async () => {
    const strict = await createTestApp({devAuth: false})
    expect((await strict.call('GET', '/me/entitlements', BUYER)).status).toBe(
      401,
    )
  })
})

describe('production safety', () => {
  it('refuses to start with mock payments or dev auth', () => {
    const base = {
      AQUA_ENV: 'production',
      DATABASE_URL: 'postgres://x',
      AQUA_MEDIA_SIGNING_SECRET: 's',
      AQUA_SERVICE_DID: 'did:web:x',
    }
    expect(() => loadConfig({...base, AQUA_ENABLE_MOCK_PAYMENTS: '1'})).toThrow(
      InsecureConfigError,
    )
    expect(loadConfig({...base, AQUA_DEV_AUTH: '1'}).devAuth).toBe(false)
    expect(() => loadConfig({AQUA_ENV: 'production'})).toThrow(
      InsecureConfigError,
    )
  })

  it('mock provider cannot be constructed in production', () => {
    expect(
      () => new MockPaymentProvider({...t.config, env: 'production'}),
    ).toThrow()
  })
})

describe('access basics', () => {
  it('denies users without server-side age verification', async () => {
    await ppvPost('free')
    const r = await access(did('unverified'))
    expect(r.body).toEqual({
      allowed: false,
      reason: 'age_verification_required',
    })
  })

  it('allows free content to verified users and denies PPV without a grant', async () => {
    await ppvPost('free')
    expect((await access(BUYER)).body.allowed).toBe(true)
    await ppvPost('ppv_required')
    expect((await access(BUYER)).body).toEqual({
      allowed: false,
      reason: 'purchase_required',
    })
  })

  it('creators always reach their own content', async () => {
    await ppvPost('ppv_required')
    expect((await access(CREATOR)).body).toMatchObject({
      allowed: true,
      via: 'owner',
    })
  })

  it('unknown resources are denied', async () => {
    expect(
      (await access(BUYER, 'at://nope/app.bsky.feed.post/x')).body,
    ).toEqual({allowed: false, reason: 'content_unavailable'})
  })
})

describe('PPV, purchase and rental', () => {
  it('PPV: order -> signed webhook -> temporary entitlement -> access, with ledger', async () => {
    await t.setFees(2000) // 20% platform fee (configurable, not hardcoded)
    await ppvPost()
    const {body: o} = await offer('ppv')
    const {order, result} = await t.buy(BUYER, o.offerId)
    expect(order.status).toBe('PROCESSING')
    expect(result).toEqual({result: 'applied'})
    const decision = (await access(BUYER)).body
    expect(decision).toMatchObject({allowed: true, entitlementType: 'ppv'})
    const hours =
      (new Date(decision.expiresAt).getTime() - Date.now()) / 3600_000
    expect(hours).toBeGreaterThan(47.9)
    expect(hours).toBeLessThanOrEqual(48)
    const ledger = (await t.call('GET', '/creator/ledger', CREATOR)).body
      .balances.BRL
    expect(ledger).toMatchObject({
      gross: '1990',
      platformFees: '-398',
      net: '1592',
    })
  })

  it('checkout is idempotent per buyer + key', async () => {
    await ppvPost()
    const {body: o} = await offer('ppv')
    const a = await t.call('POST', '/checkout', BUYER, {
      offerId: o.offerId,
      idempotencyKey: 'same-key-123',
    })
    const b = await t.call('POST', '/checkout', BUYER, {
      offerId: o.offerId,
      idempotencyKey: 'same-key-123',
    })
    expect(a.body.id).toBe(b.body.id)
    const orders = await t.db.query(`select count(*)::int as n from orders`)
    expect(orders[0].n).toBe(1)
  })

  it('duplicate webhook deliveries change nothing', async () => {
    await ppvPost()
    const {body: o} = await offer('ppv')
    const {ref} = await t.buy(BUYER, o.offerId)
    const event = {
      id: 'evt_fixed',
      type: 'refund.succeeded' as const,
      providerReference: ref,
      amountMinor: 500n,
      currency: 'BRL',
    }
    const first = await t.deliver(event)
    const second = await t.deliver(event)
    expect(first.json().result).toBe('applied')
    expect(second.json().result).toBe('duplicate')
    const [row] = await t.db.query(`select refunded_minor, status from orders`)
    expect(String(row.refunded_minor)).toBe('500')
    const refunds = await t.db.query(
      `select * from ledger_entries where type = 'REFUND'`,
    )
    expect(refunds).toHaveLength(1)
    const ents = await t.db.query(`select * from entitlements`)
    expect(ents).toHaveLength(1)
  })

  it('rejects unsigned, tampered and stale webhooks', async () => {
    await ppvPost()
    const {body: o} = await offer('ppv')
    const checkout = await t.call('POST', '/checkout', BUYER, {
      offerId: o.offerId,
      idempotencyKey: 'k-tamper-1',
    })
    const ref = checkout.body.checkoutUrl.split('/').pop()
    const signed = (
      t.app.aquaProviders.get('mock') as MockPaymentProvider
    ).signEvent({
      type: 'payment.succeeded',
      providerReference: ref,
      amountMinor: 1990n,
      currency: 'BRL',
    })
    const tampered = signed.rawBody.replace('1990', '1')
    const bad = await t.app.inject({
      method: 'POST',
      url: '/webhooks/payments/mock',
      headers: {...signed.headers, 'content-type': 'application/json'},
      payload: tampered,
    })
    expect(bad.statusCode).toBe(400)
    const unsigned = await t.app.inject({
      method: 'POST',
      url: '/webhooks/payments/mock',
      headers: {'content-type': 'application/json'},
      payload: signed.rawBody,
    })
    expect(unsigned.statusCode).toBe(400)
    const stale = await t.deliver({
      type: 'payment.succeeded',
      providerReference: ref,
      amountMinor: 1990n,
      currency: 'BRL',
      timestamp: Math.floor(Date.now() / 1000) - 3600,
    })
    expect(stale.statusCode).toBe(400)
    expect((await access(BUYER)).body.allowed).toBe(false)
  })

  it('never grants on an amount/currency mismatch or a failed payment', async () => {
    await ppvPost()
    const {body: o} = await offer('ppv')
    const c = await t.call('POST', '/checkout', BUYER, {
      offerId: o.offerId,
      idempotencyKey: 'k-mismatch-1',
    })
    const ref = c.body.checkoutUrl.split('/').pop()
    const r = await t.deliver({
      type: 'payment.succeeded',
      providerReference: ref,
      amountMinor: 1n,
      currency: 'BRL',
    })
    expect(r.json().result).toBe('ignored')
    expect((await access(BUYER)).body.allowed).toBe(false)
    const failed = await t.buy(OTHER, o.offerId, 'fail')
    expect(failed.result.result).toBe('applied')
    const [order] = await t.db.query(
      `select status from orders where buyer_did = $1`,
      [OTHER],
    )
    expect(order.status).toBe('FAILED')
    expect((await access(OTHER)).body.allowed).toBe(false)
  })

  it('purchase is permanent; rental expires', async () => {
    await ppvPost('purchase_required')
    const {body: p} = await offer('purchase')
    await t.buy(BUYER, p.offerId)
    const bought = (await access(BUYER)).body
    expect(bought).toMatchObject({allowed: true, entitlementType: 'purchase'})
    expect(bought.expiresAt).toBeUndefined()

    await ppvPost('rental_required')
    const {body: r} = await offer('rental', 990)
    await t.buy(OTHER, r.offerId)
    const now = await checkAccess(t.db, OTHER, {type: 'post', id: postUri})
    expect(now.decision).toMatchObject({
      allowed: true,
      entitlementType: 'rental',
    })
    const later = await checkAccess(
      t.db,
      OTHER,
      {type: 'post', id: postUri},
      new Date(Date.now() + 49 * 3600_000),
    )
    expect(later.decision).toEqual({allowed: false, reason: 'rental_expired'})
  })
})

describe('money', () => {
  it('only accepts integer minor units and supported currencies', async () => {
    await ppvPost()
    expect((await offer('ppv', '19.90')).status).toBe(400)
    expect((await offer('ppv', 19.9)).status).toBe(400)
    expect((await offer('ppv', 0)).status).toBe(400)
    expect((await offer('ppv', 1990, {currency: 'XXX'})).status).toBe(400)
    expect((await offer('ppv', '1990')).status).toBe(200)
  })

  it('computes fees and tax with integer rounding', async () => {
    await t.setFees(1250, 330, 1000) // 12.5% platform, 3.3% processing, 10% tax
    await ppvPost()
    const {body: o} = await offer('ppv', 1999)
    const {order} = await t.buy(BUYER, o.offerId)
    expect(order).toMatchObject({
      subtotalMinor: '1999',
      taxMinor: '200',
      totalMinor: '2199',
    })
    const b = (await t.call('GET', '/creator/ledger', CREATOR)).body.balances
      .BRL
    // 1999*0.125 = 249.875 -> 250 ; 1999*0.033 = 65.967 -> 66
    expect(b).toMatchObject({
      gross: '1999',
      platformFees: '-250',
      processingFees: '-66',
      net: '1683',
    })
  })
})

describe('subscriptions and tiers', () => {
  async function tier(name: string, price = 2990) {
    const r = await t.call('POST', '/creator/tiers', CREATOR, {
      name,
      priceMinor: price,
      currency: 'BRL',
      billingPeriod: 'month',
      benefits: ['Posts exclusivos'],
    })
    expect(r.status).toBe(200)
    return r.body as {tierId: string; offerId: string}
  }

  it('creator names tiers freely; subscription grants subscriber content', async () => {
    const gold = await tier('Círculo Íntimo')
    await ppvPost('subscriber_only')
    expect((await access(BUYER)).body.allowed).toBe(false)
    await t.buy(BUYER, gold.offerId)
    const [sub] = (await t.call('GET', '/me/subscriptions', BUYER)).body
      .subscriptions
    expect(sub.status).toBe('ACTIVE')
    expect((await access(BUYER)).body).toMatchObject({
      allowed: true,
      entitlementType: 'subscription',
    })
    const tiers = (
      await t.call('GET', `/sellers/creator/${creatorId}/tiers`, OTHER)
    ).body.tiers
    expect(tiers.map((x: any) => x.name)).toEqual(['Círculo Íntimo'])
  })

  it('tier_required only opens for the matching tier', async () => {
    const low = await tier('Fã', 990)
    const high = await tier('Backstage', 4990)
    await t.call('POST', '/creator/resources', CREATOR, {
      resourceType: 'post',
      resourceId: postUri,
      accessPolicy: 'tier_required',
      requiredTierId: high.tierId,
    })
    await t.buy(BUYER, low.offerId)
    expect((await access(BUYER)).body).toEqual({
      allowed: false,
      reason: 'wrong_tier',
    })
    await t.buy(OTHER, high.offerId)
    expect((await access(OTHER)).body.allowed).toBe(true)
  })

  it('renewal extends access; failed renewal goes past due; expiry closes access', async () => {
    const plan = await tier('Mensal')
    await ppvPost('subscriber_only')
    await t.buy(BUYER, plan.offerId)
    const [sub] = await t.db.query(`select * from subscriptions`)
    const firstEnd = new Date(sub.current_period_end)
    const renewal = await t.deliver({
      type: 'subscription.renewed',
      providerReference: sub.provider_reference,
      amountMinor: 2990n,
      currency: 'BRL',
    })
    expect(renewal.json().result).toBe('applied')
    const [after] = await t.db.query(`select * from subscriptions`)
    expect(new Date(after.current_period_end).getTime()).toBeGreaterThan(
      firstEnd.getTime(),
    )
    const orders = await t.db.query(
      `select * from orders where subscription_id = $1`,
      [sub.id],
    )
    expect(orders).toHaveLength(2)

    await t.deliver({
      type: 'subscription.payment_failed',
      providerReference: sub.provider_reference,
    })
    expect(
      (await t.db.query(`select status from subscriptions`))[0].status,
    ).toBe('PAST_DUE')

    const beyond = new Date(new Date(after.current_period_end).getTime() + 1000)
    expect(await expireSubscriptions(t.db, beyond)).toBe(1)
    const late = await checkAccess(
      t.db,
      BUYER,
      {type: 'post', id: postUri},
      beyond,
    )
    expect(late.decision.allowed).toBe(false)
  })

  it('cancel keeps access until period end', async () => {
    const plan = await tier('Mensal')
    await ppvPost('subscriber_only')
    await t.buy(BUYER, plan.offerId)
    const [sub] = await t.db.query(`select id from subscriptions`)
    expect(
      (await t.call('POST', `/subscriptions/${sub.id}/cancel`, OTHER)).status,
    ).toBe(404)
    expect(
      (await t.call('POST', `/subscriptions/${sub.id}/cancel`, BUYER)).status,
    ).toBe(200)
    const [row] = await t.db.query(
      `select cancel_at_period_end, status from subscriptions`,
    )
    expect(row).toMatchObject({cancel_at_period_end: true, status: 'ACTIVE'})
    expect((await access(BUYER)).body.allowed).toBe(true)
  })

  it('changing a tier price never rewrites past orders', async () => {
    const plan = await tier('Mensal', 2990)
    await t.buy(BUYER, plan.offerId)
    expect(
      (
        await t.call('PATCH', `/creator/tiers/${plan.tierId}`, CREATOR, {
          priceMinor: 3990,
        })
      ).status,
    ).toBe(200)
    const [order] = await t.db.query(`select total_minor from orders`)
    expect(String(order.total_minor)).toBe('2990')
    const tiers = (
      await t.call('GET', `/sellers/creator/${creatorId}/tiers`, OTHER)
    ).body.tiers
    expect(tiers[0].priceMinor).toBe('3990')
    expect(tiers[0].offerId).not.toBe(plan.offerId)
    expect(
      (
        await t.call('PATCH', `/creator/tiers/${plan.tierId}`, OTHER, {
          name: 'hack',
        })
      ).status,
    ).toBe(403)
  })
})

describe('refunds, disputes, chargebacks', () => {
  async function paidPpv() {
    await t.setFees(2000)
    await ppvPost()
    const {body: o} = await offer('ppv')
    return t.buy(BUYER, o.offerId)
  }

  it('partial refund keeps access; full refund revokes it; history is kept', async () => {
    const {ref} = await paidPpv()
    await t.deliver({
      type: 'refund.succeeded',
      providerReference: ref,
      amountMinor: 990n,
      currency: 'BRL',
    })
    expect((await t.db.query(`select status from orders`))[0].status).toBe(
      'PARTIALLY_REFUNDED',
    )
    expect((await access(BUYER)).body.allowed).toBe(true)
    await t.deliver({
      type: 'refund.succeeded',
      providerReference: ref,
      amountMinor: 1000n,
      currency: 'BRL',
    })
    expect((await t.db.query(`select status from orders`))[0].status).toBe(
      'REFUNDED',
    )
    expect((await access(BUYER)).body.allowed).toBe(false)
    const ents = await t.db.query(
      `select revoked_at, revoke_reason from entitlements`,
    )
    expect(ents).toHaveLength(1)
    expect(ents[0].revoke_reason).toBe('refunded')
    const b = (await t.call('GET', '/creator/ledger', CREATOR)).body.balances
      .BRL
    expect(b).toMatchObject({gross: '1990', refunds: '-1990', net: '0'})
  })

  it('over-refunds are rejected', async () => {
    const {ref} = await paidPpv()
    const r = await t.deliver({
      type: 'refund.succeeded',
      providerReference: ref,
      amountMinor: 999999n,
      currency: 'BRL',
    })
    expect(r.json().result).toBe('ignored')
    expect((await t.db.query(`select status from orders`))[0].status).toBe(
      'PAID',
    )
  })

  it('dispute suspends access and holds funds; winning restores both', async () => {
    const {ref} = await paidPpv()
    await t.deliver({type: 'dispute.created', providerReference: ref})
    expect((await access(BUYER)).body.allowed).toBe(false)
    expect(
      (await t.call('GET', '/creator/ledger', CREATOR)).body.balances.BRL.net,
    ).toBe('0')
    await t.deliver({type: 'dispute.won', providerReference: ref})
    expect((await access(BUYER)).body.allowed).toBe(true)
    expect(
      (await t.call('GET', '/creator/ledger', CREATOR)).body.balances.BRL.net,
    ).toBe('1592')
  })

  it('chargeback revokes access and debits the creator', async () => {
    const {ref} = await paidPpv()
    await t.deliver({type: 'chargeback.created', providerReference: ref})
    expect((await t.db.query(`select status from orders`))[0].status).toBe(
      'CHARGEBACK',
    )
    expect((await access(BUYER)).body.allowed).toBe(false)
    const b = (await t.call('GET', '/creator/ledger', CREATOR)).body.balances
      .BRL
    expect(b).toMatchObject({chargebacks: '-1990', net: '-398'})
  })
})

describe('authorization (IDOR)', () => {
  it("other users cannot read someone's order, sell their content or register their posts", async () => {
    await ppvPost()
    const {body: o} = await offer('ppv')
    const {order} = await t.buy(BUYER, o.offerId)
    expect((await t.call('GET', `/orders/${order.id}`, OTHER)).status).toBe(404)
    expect((await t.call('GET', `/orders/${order.id}`, BUYER)).status).toBe(200)
    const otherCreator = did('othercreator')
    await t.approvedCreator(otherCreator)
    const steal = await t.call('POST', '/creator/offers', otherCreator, {
      resourceType: 'post',
      resourceId: postUri,
      kind: 'ppv',
      priceMinor: 100,
      currency: 'BRL',
      accessHours: 1,
    })
    expect(steal.status).toBe(403)
    const hijack = await t.call('POST', '/creator/resources', otherCreator, {
      resourceType: 'post',
      resourceId: postUri,
      accessPolicy: 'free',
    })
    expect(hijack.status).toBe(403)
    expect((await access(OTHER)).body.allowed).toBe(false)
  })

  it('non-creators cannot create tiers or offers', async () => {
    const r = await t.call('POST', '/creator/tiers', BUYER, {
      name: 'x',
      priceMinor: 100,
      currency: 'BRL',
      billingPeriod: 'month',
    })
    expect(r.status).toBe(403)
  })
})

describe('ledger integrity', () => {
  it('ledger, audit and payment events are append-only', async () => {
    await ppvPost()
    const {body: o} = await offer('ppv')
    await t.buy(BUYER, o.offerId)
    await expect(
      t.db.query(`update ledger_entries set amount_minor = 0`),
    ).rejects.toThrow(/append-only/)
    await expect(t.db.query(`delete from payment_events`)).rejects.toThrow(
      /append-only/,
    )
    await expect(t.db.query(`delete from orders`)).rejects.toThrow()
  })
})
