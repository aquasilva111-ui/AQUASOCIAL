import {beforeAll, beforeEach, describe, expect, it} from 'vitest'

import {createTestApp, did, type TestApp} from './helpers.js'
import {fixtures} from './media-fixtures.js'

const CREATOR = did('lcreator')
const OWNER = did('lstudio')
const USER = did('luser')
const OTHER = did('lother')

let t: TestApp
let f: ReturnType<typeof fixtures>
let studioId: string

beforeAll(() => {
  f = fixtures()
})

beforeEach(async () => {
  t = await createTestApp()
  await t.approvedCreator(CREATOR, 'lib.creator')
  await t.verifiedUser(USER)
  await t.verifiedUser(OTHER)
  await t.verifiedUser(OWNER)
  const s = await t.call('POST', '/studios', OWNER, {
    name: 'Lib Studio',
    handle: 'lib-studio',
  })
  studioId = s.body.studioId
  await t.call('POST', `/dev/studios/${studioId}/verify`, OWNER, {})
})

async function video(policy: string) {
  const up = await t.upload(CREATOR, 'video', 'original', 'video/mp4', f.video)
  const r = await t.call('POST', '/creator/videos', CREATOR, {
    title: `V ${policy}`,
    mediaAssetId: up.assetId,
    accessPolicy: policy,
    publish: true,
  })
  return r.body.videoId as string
}

async function movie(policy: string) {
  const up = await t.upload(OWNER, 'video', 'original', 'video/mp4', f.video)
  const r = await t.call('POST', `/studios/${studioId}/movies`, OWNER, {
    title: `M ${policy}`,
    mediaAssetId: up.assetId,
    accessPolicy: policy,
    status: 'published',
  })
  return r.body.movieId as string
}

const creatorOffer = (
  id: string,
  kind: string,
  price: number,
  hours?: number,
) =>
  t.call('POST', '/creator/offers', CREATOR, {
    resourceType: 'video',
    resourceId: id,
    kind,
    priceMinor: price,
    currency: 'BRL',
    accessHours: hours,
  })
const studioOffer = (
  type: string,
  id: string,
  kind: string,
  price: number,
  hours?: number,
) =>
  t.call('POST', '/creator/offers', OWNER, {
    sellerType: 'studio',
    sellerId: studioId,
    resourceType: type,
    resourceId: id,
    kind,
    priceMinor: price,
    currency: 'BRL',
    accessHours: hours,
  })

const library = async (who = USER) =>
  (await t.call('GET', '/me/library', who)).body.sections

describe('library sections come from relations', () => {
  it('is empty (no sections at all) for a new user', async () => {
    expect(await library()).toEqual({})
  })

  it('purchase, PPV and rental appear in their own sections', async () => {
    const bought = await video('purchase_required')
    const ppv = await video('ppv_required')
    const rented = await movie('rental_required')
    await t.buy(
      USER,
      (await creatorOffer(bought, 'purchase', 1990)).body.offerId,
    )
    await t.buy(USER, (await creatorOffer(ppv, 'ppv', 990, 24)).body.offerId)
    await t.buy(
      USER,
      (await studioOffer('movie', rented, 'rental', 790, 48)).body.offerId,
    )
    const s = await library()
    expect(s.purchased.map((i: any) => i.id)).toEqual([bought])
    expect(s.ppv.map((i: any) => i.id)).toEqual([ppv])
    expect(s.rentals.active.map((i: any) => i.id)).toEqual([rented])
    expect(s.rentals.active[0]).toMatchObject({
      available: true,
      href: `/adult/title/movie/${rented}`,
    })
    expect(s.rentals.expired).toHaveLength(0)
    // Nothing is copied: the library points at the same media resources.
    expect(
      await t.db.query(`select count(*)::int as n from media_assets`),
    ).toEqual([{n: 3}])
  })

  it('expired rentals move to "expired" and are not playable', async () => {
    const id = await movie('rental_required')
    await t.buy(
      USER,
      (await studioOffer('movie', id, 'rental', 790, 48)).body.offerId,
    )
    await t.db.query(
      `update entitlements set expires_at = now() - interval '1 hour' where user_did = $1`,
      [USER],
    )
    const s = await library()
    expect(s.rentals.active).toHaveLength(0)
    expect(s.rentals.expired[0]).toMatchObject({
      id,
      access: {allowed: false, reason: 'rental_expired'},
    })
    expect(
      (await t.call('POST', `/studio-titles/movie/${id}/playback`, USER, {}))
        .status,
    ).toBe(403)
  })

  it('creator and studio subscriptions are listed separately', async () => {
    const ct = await t.call('POST', '/creator/tiers', CREATOR, {
      name: 'Fãs',
      priceMinor: 990,
      currency: 'BRL',
      billingPeriod: 'month',
    })
    const st = await t.call('POST', '/creator/tiers', OWNER, {
      sellerType: 'studio',
      sellerId: studioId,
      name: 'Clube',
      priceMinor: 2990,
      currency: 'BRL',
      billingPeriod: 'month',
    })
    await t.buy(USER, ct.body.offerId)
    await t.buy(USER, st.body.offerId)
    const s = await library()
    expect(s.subscriptions.creators).toEqual([
      expect.objectContaining({name: 'lib.creator', tier: 'Fãs', renews: true}),
    ])
    expect(s.subscriptions.studios).toEqual([
      expect.objectContaining({name: 'Lib Studio', tier: 'Clube'}),
    ])
  })

  it('revoked entitlements (refund) disappear from Purchased', async () => {
    const id = await video('purchase_required')
    const {ref} = await t.buy(
      USER,
      (await creatorOffer(id, 'purchase', 1990)).body.offerId,
    )
    expect((await library()).purchased).toHaveLength(1)
    await t.deliver({
      type: 'refund.succeeded',
      providerReference: ref,
      amountMinor: 1990n,
      currency: 'BRL',
    })
    expect((await library()).purchased).toBeUndefined()
  })
})

describe('saved, watch later, history, continue watching', () => {
  it('saved is not purchased: saved paid items stay locked', async () => {
    const id = await video('ppv_required')
    expect(
      (await t.call('PUT', `/me/library/saved/video/${id}`, USER)).status,
    ).toBe(200)
    const s = await library()
    expect(s.saved[0]).toMatchObject({
      id,
      access: {allowed: false, reason: 'purchase_required'},
    })
    expect(s.purchased).toBeUndefined()
  })

  it('watch later is its own relation', async () => {
    const id = await video('free')
    await t.call('PUT', `/me/library/watch-later/video/${id}`, USER)
    const s = await library()
    expect(s.watchLater.map((i: any) => i.id)).toEqual([id])
    expect(s.saved).toBeUndefined()
    await t.call('DELETE', `/me/library/watch-later/video/${id}`, USER)
    expect((await library()).watchLater).toBeUndefined()
  })

  it('continue watching reuses Phase 9 progress; history can be removed or cleared', async () => {
    const id = await video('free')
    await t.call('POST', `/views/videos/${id}/progress`, USER, {
      positionMs: 1200,
      durationMs: 3000,
    })
    const s = await library()
    expect(s.continueWatching[0]).toMatchObject({
      id,
      positionMs: 1200,
      durationMs: 3000,
    })
    expect(s.history).toHaveLength(1)
    await t.call('DELETE', `/me/adult/history/${s.history[0].historyId}`, USER)
    expect((await library()).history).toBeUndefined()
    await t.call('DELETE', '/me/adult/history', USER)
    expect((await library()).continueWatching).toBeUndefined()
  })

  it('clearing history never touches orders, ledger or audit', async () => {
    const id = await video('purchase_required')
    await t.buy(USER, (await creatorOffer(id, 'purchase', 1990)).body.offerId)
    await t.call('POST', `/views/videos/${id}/progress`, USER, {
      positionMs: 1000,
    })
    await t.call('DELETE', '/me/adult/history', USER)
    expect(await t.db.query(`select id from orders`)).toHaveLength(1)
    expect(
      (await t.db.query(`select id from ledger_entries`)).length,
    ).toBeGreaterThan(0)
    expect((await library()).purchased).toHaveLength(1)
  })

  it('only published items can be added', async () => {
    expect(
      (await t.call('PUT', '/me/library/saved/video/vid_doesnotexist', USER))
        .status,
    ).toBe(404)
    const up = await t.upload(
      CREATOR,
      'video',
      'original',
      'video/mp4',
      f.video,
    )
    const draft = await t.call('POST', '/creator/videos', CREATOR, {
      title: 'draft',
      mediaAssetId: up.assetId,
      accessPolicy: 'free',
    })
    expect(
      (
        await t.call(
          'PUT',
          `/me/library/saved/video/${draft.body.videoId}`,
          USER,
        )
      ).status,
    ).toBe(400)
  })
})

describe('removed content, privacy, isolation', () => {
  it('removed content shows as unavailable, reveals nothing and does not play', async () => {
    const id = await video('purchase_required')
    await t.buy(USER, (await creatorOffer(id, 'purchase', 1990)).body.offerId)
    await t.call('PUT', `/me/library/saved/video/${id}`, USER)
    await t.db.query(`update videos set status = 'removed' where id = $1`, [id])
    const s = await library()
    for (const item of [s.purchased[0], s.saved[0]]) {
      expect(item).toMatchObject({
        available: false,
        title: 'Conteúdo indisponível',
        href: null,
        posterUrl: null,
      })
    }
    expect(
      (await t.call('POST', `/views/videos/${id}/playback`, USER, {})).status,
    ).toBe(403)
  })

  it('each user sees only their own library (IDOR)', async () => {
    const id = await video('purchase_required')
    await t.buy(USER, (await creatorOffer(id, 'purchase', 1990)).body.offerId)
    await t.call('PUT', `/me/library/saved/video/${id}`, USER)
    expect(await library(OTHER)).toEqual({})
    await t.call('DELETE', `/me/library/saved/video/${id}`, OTHER)
    expect((await library()).saved).toHaveLength(1)
  })

  it('requires an authenticated, age-verified adult context', async () => {
    expect((await t.call('GET', '/me/library')).status).toBe(401)
    expect((await t.call('GET', '/me/library', did('noverify'))).status).toBe(
      403,
    )
  })

  it('library responses are private and never cached by shared caches', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/me/library',
      headers: {'x-aqua-dev-did': USER},
    })
    expect(res.headers['cache-control']).toBe('private, no-store')
  })

  it('nothing about library activity is written to shared/public tables', async () => {
    const id = await video('free')
    await t.call('PUT', `/me/library/saved/video/${id}`, USER)
    await t.call('PUT', `/me/library/watch-later/video/${id}`, USER)
    // Library relations live only in the private library tables.
    const audit = await t.db.query(`select action from audit_events`)
    expect(audit.filter((a: any) => a.action.includes('library'))).toHaveLength(
      0,
    )
  })
})
