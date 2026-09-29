import {beforeAll, beforeEach, describe, expect, it} from 'vitest'

import {createTestApp, did, type TestApp} from './helpers.js'
import {fixtures} from './media-fixtures.js'

const CREATOR = did('dcreator')
const RIVAL = did('drival')
const VIEWER = did('dviewer')
const UNVERIFIED = did('dunverified')
const OWNER = did('downer')
const ADMIN = did('dadmin')
const EDITOR = did('deditor')
const ANALYST = did('danalyst')
const MODERATOR = did('dmoderator')
const OUTSIDER = did('doutsider')

let t: TestApp
let f: ReturnType<typeof fixtures>
let creatorId: string

beforeAll(() => {
  f = fixtures()
})

beforeEach(async () => {
  t = await createTestApp()
  creatorId = await t.approvedCreator(CREATOR, 'dash.creator.test')
  await t.approvedCreator(RIVAL, 'dash.rival.test')
  for (const d of [VIEWER, OWNER, ADMIN, EDITOR, ANALYST, MODERATOR, OUTSIDER])
    await t.verifiedUser(d)
})

async function readyVideo(owner = CREATOR) {
  const up = await t.upload(owner, 'video', 'original', 'video/mp4', f.video)
  expect(up.status).toBe(200)
  return up.assetId!
}

const createVideo = async (body: Record<string, unknown>, who = CREATOR) =>
  t.call('POST', '/dashboard/creator/videos', who, {
    title: 'Clip',
    category: 'solo',
    ...body,
  })

const tier = async (who = CREATOR, priceMinor = 1990) => {
  const r = await t.call('POST', '/creator/tiers', who, {
    name: 'Gold',
    priceMinor,
    currency: 'BRL',
    billingPeriod: 'month',
  })
  expect(r.status).toBe(200)
  return r.body as {tierId: string; offerId: string}
}

/** Credits the seller with settled (older than the hold) balance. */
async function settledBalance(
  sellerType: string,
  sellerId: string,
  amount: number,
) {
  await t.db.query(
    `insert into ledger_entries (seller_type, seller_id, type, amount_minor, currency, reference, created_at)
     values ($1, $2, 'ADJUSTMENT', $3, 'BRL', 'test-settled', now() - interval '30 days')`,
    [sellerType, sellerId, amount],
  )
}

async function studio() {
  const r = await t.call('POST', '/studios', OWNER, {
    name: 'Dash Films',
    handle: 'dash-films',
  })
  expect(r.status).toBe(200)
  const id = r.body.studioId as string
  for (const [member, role] of [
    [ADMIN, 'ADMIN'],
    [EDITOR, 'EDITOR'],
    [ANALYST, 'ANALYST'],
    [MODERATOR, 'MODERATOR'],
  ])
    expect(
      (
        await t.call('POST', `/studios/${id}/members`, OWNER, {
          did: member,
          role,
        })
      ).status,
    ).toBe(200)
  await t.call('POST', `/dev/studios/${id}/verify`, OWNER, {})
  return id
}

describe('dashboard access', () => {
  it('viewers, unverified users and anonymous callers never get a dashboard', async () => {
    expect((await t.call('GET', '/dashboard/creator')).status).toBe(401)
    const unverified = await t.call('GET', '/dashboard/creator', UNVERIFIED)
    expect(unverified.status).toBe(403)
    expect(unverified.body.error).toBe('adult_declaration_required')
    const viewer = await t.call('GET', '/dashboard/creator', VIEWER)
    expect(viewer.status).toBe(403)
    expect(viewer.body.error).toBe('creator_not_approved')
    for (const path of [
      '/content',
      '/media',
      '/analytics',
      '/revenue',
      '/payouts',
      '/offers',
      '/safety',
    ])
      expect(
        (await t.call('GET', `/dashboard/creator${path}`, VIEWER)).status,
      ).toBe(403)
    expect(
      (await createVideo({mediaAssetId: 'x', accessPolicy: 'free'}, VIEWER))
        .status,
    ).toBe(403)
  })

  it('a fresh creator sees zeros and empty states, never invented numbers', async () => {
    const home = await t.call('GET', '/dashboard/creator', CREATOR)
    expect(home.status).toBe(200)
    expect(home.body.seller).toMatchObject({
      type: 'creator',
      role: 'CREATOR',
      creatorId,
    })
    expect(home.body.content).toEqual({videos: {}, posts: {}, collections: 0})
    expect(home.body.media).toEqual({
      uploading: 0,
      processing: 0,
      ready: 0,
      failed: 0,
      quarantined: 0,
      removed: 0,
    })
    expect(home.body.subscriptions).toMatchObject({
      enabled: false,
      activeSubscribers: 0,
      activeTiers: 0,
    })
    expect(home.body.offers).toEqual({
      activeOffers: {ppv: 0, purchase: 0, rental: 0},
      paidOrders: 0,
    })
    expect(home.body.revenue).toEqual({})
    expect(home.body.safety).toEqual({
      contentUnderModeration: 0,
      liveReportsLast30Days: 0,
    })
    const analytics = await t.call(
      'GET',
      '/dashboard/creator/analytics',
      CREATOR,
    )
    expect(analytics.body).toMatchObject({
      views: 0,
      uniqueViewers: 0,
      subscribers: 0,
      subscriptionConversionBps: null,
      ppvPurchases: 0,
      refunds: 0,
      chargebacks: 0,
      revenue: {},
    })
  })
})

describe('content creation', () => {
  it('refuses a paid policy without a price — content never falls back to free', async () => {
    const mediaAssetId = await readyVideo()
    for (const accessPolicy of [
      'ppv_required',
      'purchase_required',
      'rental_required',
    ]) {
      const r = await createVideo({
        mediaAssetId,
        accessPolicy,
        visibility: 'published',
      })
      expect(r.status).toBe(400)
      expect(r.body.error).toBe('offer_required')
    }
    const missing = await createVideo({mediaAssetId, visibility: 'published'})
    expect(missing.status).toBe(400)
    const [count] = await t.db.query(`select count(*)::int as n from videos`)
    expect(count.n).toBe(0)
  })

  it('creates the video and its PPV offer atomically and validates them', async () => {
    const mediaAssetId = await readyVideo()
    const bad = [
      [
        {kind: 'rental', priceMinor: 500, currency: 'BRL', accessHours: 24},
        'offer_kind_mismatch',
      ],
      [
        {kind: 'ppv', priceMinor: 500, currency: 'XYZ', accessHours: 48},
        'invalid_amount',
      ],
      [
        {kind: 'ppv', priceMinor: 0, currency: 'BRL', accessHours: 48},
        'invalid_amount',
      ],
      [
        {kind: 'ppv', priceMinor: 19.9, currency: 'BRL', accessHours: 48},
        'invalid_amount',
      ],
      [
        {
          kind: 'ppv',
          priceMinor: 1_000_000_000,
          currency: 'BRL',
          accessHours: 48,
        },
        'invalid_amount',
      ],
      [
        {kind: 'ppv', priceMinor: 500, currency: 'BRL'},
        'access_hours_required',
      ],
    ] as const
    for (const [offer, error] of bad) {
      const r = await createVideo({
        mediaAssetId,
        accessPolicy: 'ppv_required',
        visibility: 'published',
        offer,
      })
      expect(r.status, JSON.stringify(offer)).toBe(400)
      expect(r.body.error).toBe(error)
    }
    // A failed offer rolled the whole video back.
    expect((await t.db.query(`select id from videos`)).length).toBe(0)

    const free = await createVideo({
      mediaAssetId,
      accessPolicy: 'free',
      offer: {kind: 'ppv', priceMinor: 500, currency: 'BRL', accessHours: 48},
    })
    expect(free.body.error).toBe('offer_not_applicable')

    const ok = await createVideo({
      mediaAssetId,
      accessPolicy: 'ppv_required',
      visibility: 'published',
      description: 'meta',
      offer: {kind: 'ppv', priceMinor: 990, currency: 'BRL', accessHours: 48},
    })
    expect(ok.status).toBe(200)
    expect(ok.body.offerId).toBeTruthy()
    expect(
      (
        await t.call(
          'POST',
          `/views/videos/${ok.body.videoId}/playback`,
          VIEWER,
          {},
        )
      ).status,
    ).toBe(403)
    await t.buy(VIEWER, ok.body.offerId)
    expect(
      (
        await t.call(
          'POST',
          `/views/videos/${ok.body.videoId}/playback`,
          VIEWER,
          {},
        )
      ).status,
    ).toBe(200)
  })

  it('tier_required needs one of the creator’s own tiers', async () => {
    const mediaAssetId = await readyVideo()
    const mine = await tier(CREATOR)
    const theirs = await tier(RIVAL)
    for (const requiredTierId of [undefined, theirs.tierId]) {
      const r = await createVideo({
        mediaAssetId,
        accessPolicy: 'tier_required',
        requiredTierId,
      })
      expect(r.status).toBe(400)
      expect(r.body.error).toBe('invalid_tier')
    }
    const ok = await createVideo({
      mediaAssetId,
      accessPolicy: 'tier_required',
      requiredTierId: mine.tierId,
      visibility: 'published',
    })
    expect(ok.status).toBe(200)
    // Switching to a foreign tier later is refused too.
    const patch = await t.call(
      'PATCH',
      `/creator/videos/${ok.body.videoId}`,
      CREATOR,
      {
        requiredTierId: theirs.tierId,
      },
    )
    expect(patch.body.error).toBe('invalid_tier')
  })

  it('schedules publication: hidden until its time, then live', async () => {
    const mediaAssetId = await readyVideo()
    const past = await createVideo({
      mediaAssetId,
      accessPolicy: 'free',
      visibility: 'scheduled',
      publishAt: new Date(Date.now() - 60_000).toISOString(),
    })
    expect(past.body.error).toBe('publish_at_in_past')
    const noTime = await createVideo({
      mediaAssetId,
      accessPolicy: 'free',
      visibility: 'scheduled',
    })
    expect(noTime.body.error).toBe('publish_at_required')

    const r = await createVideo({
      mediaAssetId,
      accessPolicy: 'free',
      visibility: 'scheduled',
      publishAt: new Date(Date.now() + 3600_000).toISOString(),
    })
    expect(r.status).toBe(200)
    const id = r.body.videoId
    const feed = async () =>
      (await t.call('GET', '/views/feed', VIEWER)).body.videos.map(
        (v: any) => v.id,
      )
    expect(await feed()).toEqual([])
    expect((await t.call('GET', `/views/videos/${id}`, VIEWER)).status).toBe(
      404,
    )
    expect(
      (await t.call('POST', `/views/videos/${id}/playback`, VIEWER, {})).status,
    ).toBe(403)
    expect(
      (await t.call('POST', `/views/videos/${id}/playback`, CREATOR, {}))
        .status,
    ).toBe(200)
    const scheduled = await t.call(
      'GET',
      '/dashboard/creator/content?section=scheduled',
      CREATOR,
    )
    expect(scheduled.body.videos.map((v: any) => v.id)).toEqual([id])

    // Time passes.
    await t.db.query(
      `update videos set scheduled_at = now() - interval '1 minute', published_at = now() - interval '1 minute' where id = $1`,
      [id],
    )
    expect(await feed()).toEqual([id])
    expect(
      (await t.call('POST', `/views/videos/${id}/playback`, VIEWER, {})).status,
    ).toBe(200)
  })

  it('archives and drafts leave discovery; moderation states stay locked', async () => {
    const mediaAssetId = await readyVideo()
    const {body} = await createVideo({
      mediaAssetId,
      accessPolicy: 'free',
      visibility: 'published',
    })
    const id = body.videoId
    expect(
      (
        await t.call('PATCH', `/creator/videos/${id}`, CREATOR, {
          status: 'archived',
        })
      ).status,
    ).toBe(200)
    expect((await t.call('GET', '/views/feed', VIEWER)).body.videos).toEqual([])
    expect(
      (await t.call('POST', `/views/videos/${id}/playback`, VIEWER, {})).status,
    ).toBe(403)
    const archived = await t.call(
      'GET',
      '/dashboard/creator/content?section=archived',
      CREATOR,
    )
    expect(archived.body.videos).toHaveLength(1)
    expect(archived.body.videos[0].archivedAt).toBeTruthy()
    expect(
      (
        await t.call('PATCH', `/creator/videos/${id}`, CREATOR, {
          status: 'published',
        })
      ).status,
    ).toBe(200)
    expect(
      (await t.call('GET', '/views/feed', VIEWER)).body.videos,
    ).toHaveLength(1)
    // Another creator cannot touch it.
    expect(
      (
        await t.call('PATCH', `/creator/videos/${id}`, RIVAL, {
          status: 'archived',
        })
      ).status,
    ).toBe(404)
    await t.db.query(`update videos set status = 'quarantined' where id = $1`, [
      id,
    ])
    expect(
      (
        await t.call('PATCH', `/creator/videos/${id}`, CREATOR, {
          status: 'published',
        })
      ).body.error,
    ).toBe('under_moderation')
    const safety = await t.call('GET', '/dashboard/creator/safety', CREATOR)
    expect(safety.body.contentUnderModeration).toBe(1)
    expect(safety.body.underModeration[0]).toMatchObject({
      type: 'video',
      id,
      status: 'quarantined',
    })
  })
})

describe('media manager', () => {
  it('shows engine states without storage internals', async () => {
    await readyVideo()
    const broken = await t.upload(
      CREATOR,
      'video',
      'original',
      'video/mp4',
      Buffer.from('not a video at all'),
    )
    expect(broken.assetId).toBeTruthy()
    const r = await t.call('GET', '/dashboard/creator/media', CREATOR)
    expect(r.status).toBe(200)
    expect(r.body.summary.ready).toBe(1)
    expect(r.body.summary.failed + r.body.summary.quarantined).toBe(1)
    const text = JSON.stringify(r.body)
    expect(text).not.toMatch(/storage_key|storageKey|storage_prefix|\/media\//)
    expect(
      (await t.call('GET', '/dashboard/creator/media', RIVAL)).body.assets,
    ).toEqual([])
  })
})

describe('subscriptions and pricing', () => {
  it('turning subscriptions off blocks new checkouts but keeps existing subscribers', async () => {
    const plan = await tier(CREATOR)
    await t.buy(VIEWER, plan.offerId)
    const before = await t.call(
      'GET',
      '/dashboard/creator/subscriptions',
      CREATOR,
    )
    expect(before.body).toMatchObject({enabled: true, activeSubscribers: 1})
    expect(before.body.tiers[0]).toMatchObject({
      activeSubscribers: 1,
      allTimeSubscriptions: 1,
    })

    expect(
      (
        await t.call('PATCH', '/dashboard/creator/settings', CREATOR, {
          subscriptionsEnabled: false,
        })
      ).status,
    ).toBe(200)
    const blocked = await t.call('POST', '/checkout', OUTSIDER, {
      offerId: plan.offerId,
      idempotencyKey: 'key-outsider-1',
    })
    expect(blocked.status).toBe(409)
    expect(blocked.body.error).toBe('subscriptions_disabled')
    expect(
      (await t.call('GET', `/sellers/creator/${creatorId}/tiers`, OUTSIDER))
        .body.tiers,
    ).toEqual([])
    const [sub] = await t.db.query(
      `select status from subscriptions where subscriber_did = $1`,
      [VIEWER],
    )
    expect(sub.status).toBe('ACTIVE')

    // Can't switch on without an active tier.
    await t.call('PATCH', `/creator/tiers/${plan.tierId}`, CREATOR, {
      active: false,
    })
    const noTier = await t.call(
      'PATCH',
      '/dashboard/creator/settings',
      CREATOR,
      {subscriptionsEnabled: true},
    )
    expect(noTier.body.error).toBe('no_active_tier')
    // Rivals can't flip someone else's switch: the route is scoped to the caller.
    await t.call('PATCH', '/dashboard/creator/settings', RIVAL, {
      subscriptionsEnabled: false,
    })
    const [c] = await t.db.query(
      `select subscriptions_enabled from creators where id = $1`,
      [creatorId],
    )
    expect(c.subscriptions_enabled).toBe(false)
  })

  it('re-pricing an offer preserves order history; only the seller can do it', async () => {
    const mediaAssetId = await readyVideo()
    const {body} = await createVideo({
      mediaAssetId,
      accessPolicy: 'ppv_required',
      visibility: 'published',
      offer: {kind: 'ppv', priceMinor: 990, currency: 'BRL', accessHours: 24},
    })
    const bought = await t.buy(VIEWER, body.offerId)
    const theft = await t.call(
      'PATCH',
      `/dashboard/offers/${body.offerId}`,
      RIVAL,
      {priceMinor: 1},
    )
    expect(theft.status).toBe(403)
    const badPrice = await t.call(
      'PATCH',
      `/dashboard/offers/${body.offerId}`,
      CREATOR,
      {priceMinor: -5},
    )
    expect(badPrice.status).toBe(400)

    const r = await t.call(
      'PATCH',
      `/dashboard/offers/${body.offerId}`,
      CREATOR,
      {priceMinor: 1490},
    )
    expect(r.status).toBe(200)
    expect(r.body.offerId).not.toBe(body.offerId)
    const [order] = await t.db.query(
      `select offer_id, subtotal_minor from orders where id = $1`,
      [bought.order.id],
    )
    expect(order.offer_id).toBe(body.offerId)
    expect(String(order.subtotal_minor)).toBe('990')
    const offers = await t.call('GET', '/dashboard/creator/offers', CREATOR)
    expect(
      offers.body.offers.map((o: any) => [o.priceMinor, o.active, o.sales]),
    ).toEqual([
      ['1490', true, 0],
      ['990', false, 1],
    ])
    expect(
      (await t.call('GET', `/views/videos/${body.videoId}`, OUTSIDER)).body
        .offers,
    ).toEqual([expect.objectContaining({priceMinor: '1490'})])
    const [audit] = await t.db.query(
      `select count(*)::int as n from audit_events where action = 'dashboard.offer.update' and result = 'denied'`,
    )
    expect(audit.n).toBe(1)
  })

  it('refuses offers that cannot unlock the item', async () => {
    const mediaAssetId = await readyVideo()
    const {body} = await createVideo({
      mediaAssetId,
      accessPolicy: 'free',
      visibility: 'published',
    })
    const r = await t.call('POST', '/creator/offers', CREATOR, {
      resourceType: 'video',
      resourceId: body.videoId,
      kind: 'ppv',
      priceMinor: 500,
      currency: 'BRL',
      accessHours: 24,
    })
    expect(r.status).toBe(400)
    expect(r.body.error).toBe('offer_kind_mismatch')
  })
})

describe('analytics and revenue', () => {
  it('aggregates views, sales and ledger money without exposing buyers', async () => {
    await t.setFees(1000)
    const mediaAssetId = await readyVideo()
    const {body} = await createVideo({
      mediaAssetId,
      accessPolicy: 'ppv_required',
      visibility: 'published',
      offer: {kind: 'ppv', priceMinor: 2000, currency: 'BRL', accessHours: 24},
    })
    await t.buy(VIEWER, body.offerId)
    await t.call('POST', `/views/videos/${body.videoId}/progress`, VIEWER, {
      positionMs: 2500,
      durationMs: 3000,
    })
    const plan = await tier(CREATOR, 1000)
    await t.buy(OUTSIDER, plan.offerId)

    const a = await t.call(
      'GET',
      '/dashboard/creator/analytics?days=7',
      CREATOR,
    )
    expect(a.status).toBe(200)
    expect(a.body).toMatchObject({
      periodDays: 7,
      views: 1,
      uniqueViewers: 1,
      lifetimeViews: '1',
      watchTimeMs: '2500',
      subscribers: 1,
      newSubscriptions: 1,
      subscriptionConversionBps: 10000,
      ppvPurchases: 1,
    })
    expect(a.body.revenue.BRL).toMatchObject({
      gross: '3000',
      platformFees: '-300',
      net: '2700',
    })

    const rev = await t.call('GET', '/dashboard/creator/revenue', CREATOR)
    expect(rev.body.balances.BRL).toMatchObject({
      gross: '3000',
      platformFees: '-300',
      net: '2700',
      pending: '2700',
      available: '0',
      requestable: '0',
    })
    expect(rev.body.entries.length).toBeGreaterThan(0)
    for (const res of [a.body, rev.body])
      for (const who of [VIEWER, OUTSIDER])
        expect(JSON.stringify(res)).not.toContain(who)
    // The rival sees only their own (empty) numbers.
    expect(
      (await t.call('GET', '/dashboard/creator/revenue', RIVAL)).body.balances,
    ).toEqual({})
    expect(
      (await t.call('GET', '/dashboard/creator/analytics', RIVAL)).body.views,
    ).toBe(0)
  })
})

describe('payouts (architecture only)', () => {
  it('records requests against settled ledger balance and never moves money', async () => {
    const request = (amountMinor: number, who = CREATOR) =>
      t.call('POST', '/dashboard/creator/payout-requests', who, {
        amountMinor,
        currency: 'BRL',
      })
    expect((await request(100)).body.error).toBe('payout_account_not_verified')
    const acct = await t.call(
      'POST',
      '/dashboard/creator/payout-account',
      CREATOR,
      {
        bankAccount: '12345-6',
      },
    )
    expect(acct.body.account.status).toBe('PENDING_PROVIDER')
    const [row] = await t.db.query(`select * from payout_accounts`)
    expect(JSON.stringify(row)).not.toContain('12345')
    expect((await request(100)).body.error).toBe('payout_account_not_verified')
    await t.call(
      'POST',
      '/dashboard/creator/dev/payout-account/verify',
      CREATOR,
      {},
    )

    expect((await request(100)).body.error).toBe(
      'insufficient_available_balance',
    )
    await settledBalance('creator', creatorId, 5000)
    const first = await request(3000)
    expect(first.status).toBe(200)
    expect(first.body.status).toBe('REQUESTED')
    expect((await request(2500)).body.error).toBe(
      'insufficient_available_balance',
    )
    const payouts = await t.call('GET', '/dashboard/creator/payouts', CREATOR)
    expect(payouts.body.providerConfigured).toBe(false)
    expect(payouts.body.balances.BRL).toMatchObject({
      requestedPayouts: '3000',
      requestable: '2000',
    })
    expect(payouts.body.payouts).toEqual([])
    // No PAYOUT ledger entry: nothing was transferred.
    expect(
      (await t.db.query(`select 1 from ledger_entries where type = 'PAYOUT'`))
        .length,
    ).toBe(0)

    // Another creator cannot cancel it.
    const cancelUrl = `/dashboard/creator/payout-requests/${first.body.requestId}/cancel`
    expect((await t.call('POST', cancelUrl, RIVAL, {})).status).toBe(404)
    expect((await t.call('POST', cancelUrl, CREATOR, {})).status).toBe(200)
    expect((await request(5000)).status).toBe(200)
  })
})

describe('studio dashboard RBAC', () => {
  it('each role sees only its sections; outsiders learn nothing', async () => {
    const id = await studio()
    const home = async (who: string) =>
      t.call('GET', `/dashboard/studios/${id}`, who)
    expect((await home(OUTSIDER)).status).toBe(404)
    expect((await home(CREATOR)).status).toBe(404)
    expect(
      (await t.call('GET', `/dashboard/studios/std_nope`, OWNER)).status,
    ).toBe(404)

    const owner = (await home(OWNER)).body
    expect(owner.seller.role).toBe('OWNER')
    expect(owner.seller.permissions).toContain('managePayouts')
    expect(owner.content).not.toBeNull()
    expect(owner.revenue).toEqual({})

    const editor = (await home(EDITOR)).body
    expect(editor.content).not.toBeNull()
    expect(editor.revenue).toBeNull()
    expect(editor.safety).toBeNull()

    const analyst = (await home(ANALYST)).body
    expect(analyst.content).toBeNull()
    expect(analyst.revenue).toEqual({})

    const moderator = (await home(MODERATOR)).body
    expect(moderator.safety).not.toBeNull()
    expect(moderator.revenue).toBeNull()

    // Bits: OWNER ADMIN EDITOR ANALYST MODERATOR.
    const matrix: [string, string, number][] = [
      ['GET', '/content', 0b11101],
      ['GET', '/media', 0b11101],
      ['GET', '/live', 0b11101],
      ['GET', '/analytics', 0b11010],
      ['GET', '/revenue', 0b11010],
      ['GET', '/payouts', 0b11010],
      ['GET', '/safety', 0b11001],
      ['GET', '/offers', 0b11000],
      ['GET', '/subscriptions', 0b11000],
      ['GET', '/team', 0b11000],
      ['POST', '/payout-account', 0b10000],
    ]
    const roles = [OWNER, ADMIN, EDITOR, ANALYST, MODERATOR]
    for (const [method, path, mask] of matrix)
      for (const [i, who] of roles.entries()) {
        const allowed = !!(mask & (1 << (4 - i)))
        const r = await t.call(
          method as 'GET',
          `/dashboard/studios/${id}${path}`,
          who,
          method === 'POST' ? {} : undefined,
        )
        expect(r.status, `${path} as role #${i}`).toBe(allowed ? 200 : 403)
      }
    const denied = await t.db.query(
      `select count(*)::int as n from audit_events where action like 'dashboard.%' and result = 'denied'`,
    )
    expect(denied[0].n).toBeGreaterThan(0)
  })

  it('studio pricing, settings and titles are enforced on the server', async () => {
    const id = await studio()
    const studioTier = await t.call('POST', '/creator/tiers', OWNER, {
      sellerType: 'studio',
      sellerId: id,
      name: 'Studio Pass',
      priceMinor: 2990,
      currency: 'BRL',
      billingPeriod: 'month',
    })
    expect(studioTier.status).toBe(200)
    const creatorTier = await tier(CREATOR)
    const mediaAssetId = await readyVideo(EDITOR)

    // A studio title cannot borrow another seller's tier.
    const foreign = await t.call('POST', `/studios/${id}/movies`, EDITOR, {
      title: 'Filme',
      mediaAssetId,
      accessPolicy: 'tier_required',
      requiredTierId: creatorTier.tierId,
    })
    expect(foreign.body.error).toBe('invalid_tier')
    const movie = await t.call('POST', `/studios/${id}/movies`, EDITOR, {
      title: 'Filme',
      mediaAssetId,
      accessPolicy: 'tier_required',
      requiredTierId: studioTier.body.tierId,
      status: 'published',
    })
    expect(movie.status).toBe(200)
    const movieId = movie.body.movieId

    // Releases and availability are edited by title editors, validated server-side.
    const patch = (who: string, body: Record<string, unknown>) =>
      t.call('PATCH', `/studio-titles/movie/${movieId}`, who, body)
    expect(
      (
        await patch(EDITOR, {
          availabilityStart: '2030-01-02T00:00:00.000Z',
          availabilityEnd: '2030-01-01T00:00:00.000Z',
        })
      ).body.error,
    ).toBe('invalid_availability_window')
    expect(
      (
        await patch(EDITOR, {
          releaseDate: '2030-01-01',
          synopsis: 'Nova sinopse',
        })
      ).status,
    ).toBe(200)
    expect((await patch(ANALYST, {title: 'Hack'})).status).toBe(403)
    expect((await patch(MODERATOR, {accessPolicy: 'free'})).status).toBe(403)
    expect(
      (await patch(EDITOR, {requiredTierId: creatorTier.tierId})).body.error,
    ).toBe('invalid_tier')
    const [m] = await t.db.query(
      `select synopsis, release_date, required_tier_id from movies where id = $1`,
      [movieId],
    )
    expect(m.synopsis).toBe('Nova sinopse')
    expect(m.required_tier_id).toBe(studioTier.body.tierId)

    // Selling is OWNER/ADMIN; editors can't flip the subscription switch or re-price.
    const toggle = (who: string) =>
      t.call('PATCH', `/dashboard/studios/${id}/settings`, who, {
        subscriptionsEnabled: false,
      })
    expect((await toggle(EDITOR)).status).toBe(403)
    expect((await toggle(ANALYST)).status).toBe(403)
    expect((await toggle(ADMIN)).status).toBe(200)
    const offer = await t.call('POST', '/creator/offers', OWNER, {
      sellerType: 'studio',
      sellerId: id,
      resourceType: 'movie',
      resourceId: movieId,
      kind: 'purchase',
      priceMinor: 4990,
      currency: 'BRL',
    })
    // The movie is tier_required: a one-off purchase would not unlock it.
    expect(offer.body.error).toBe('offer_kind_mismatch')
    await patch(EDITOR, {accessPolicy: 'purchase_required'})
    const sell = await t.call('POST', '/creator/offers', OWNER, {
      sellerType: 'studio',
      sellerId: id,
      resourceType: 'movie',
      resourceId: movieId,
      kind: 'purchase',
      priceMinor: 4990,
      currency: 'BRL',
    })
    expect(sell.status).toBe(200)
    expect(
      (
        await t.call(
          'PATCH',
          `/dashboard/offers/${sell.body.offerId}`,
          EDITOR,
          {priceMinor: 1},
        )
      ).status,
    ).toBe(403)
    expect(
      (
        await t.call(
          'PATCH',
          `/dashboard/offers/${sell.body.offerId}`,
          CREATOR,
          {active: false},
        )
      ).status,
    ).toBe(403)
    expect(
      (
        await t.call('PATCH', `/dashboard/offers/${sell.body.offerId}`, ADMIN, {
          active: false,
        })
      ).status,
    ).toBe(200)

    const titles = await t.call(
      'GET',
      `/dashboard/studios/${id}/content?section=titles`,
      EDITOR,
    )
    expect(titles.body.movies[0]).toMatchObject({
      id: movieId,
      accessPolicy: 'purchase_required',
      releaseDate: expect.anything(),
    })
    const team = await t.call('GET', `/dashboard/studios/${id}/team`, ADMIN)
    expect(team.body.members.map((member: any) => member.role)).toEqual([
      'OWNER',
      'ADMIN',
      'EDITOR',
      'ANALYST',
      'MODERATOR',
    ])
    expect(team.body.members[1].permissions).not.toContain('managePayouts')
  })

  it('payouts belong to the owner alone', async () => {
    const id = await studio()
    expect(
      (
        await t.call(
          'POST',
          `/dashboard/studios/${id}/payout-account`,
          ADMIN,
          {},
        )
      ).status,
    ).toBe(403)
    expect(
      (
        await t.call(
          'POST',
          `/dashboard/studios/${id}/payout-account`,
          OWNER,
          {},
        )
      ).status,
    ).toBe(200)
    await t.call(
      'POST',
      `/dashboard/studios/${id}/dev/payout-account/verify`,
      OWNER,
      {},
    )
    await settledBalance('studio', id, 10000)
    const req = (who: string) =>
      t.call('POST', `/dashboard/studios/${id}/payout-requests`, who, {
        amountMinor: 1000,
        currency: 'BRL',
      })
    for (const who of [ADMIN, EDITOR, ANALYST, MODERATOR, OUTSIDER])
      expect((await req(who)).status).not.toBe(200)
    expect((await req(OWNER)).status).toBe(200)
    // The analyst can read, not act.
    const view = await t.call(
      'GET',
      `/dashboard/studios/${id}/payouts`,
      ANALYST,
    )
    expect(view.body.requests).toHaveLength(1)
  })

  it('lists the caller’s studios for the studio dashboard entry', async () => {
    const id = await studio()
    const mine = await t.call('GET', '/dashboard/studios', EDITOR)
    expect(mine.body.studios).toEqual([
      expect.objectContaining({
        id,
        role: 'EDITOR',
        permissions: expect.arrayContaining(['editTitles']),
      }),
    ])
    expect(
      (await t.call('GET', '/dashboard/studios', OUTSIDER)).body.studios,
    ).toEqual([])
  })
})
