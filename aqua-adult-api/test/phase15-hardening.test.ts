import {rm} from 'node:fs/promises'
import {join} from 'node:path'

import {Secp256k1Keypair} from '@atproto/crypto'
import {createServiceJwt} from '@atproto/xrpc-server'
import {beforeAll, beforeEach, describe, expect, it} from 'vitest'

import {redactUrl} from '../src/app.js'
import {checkout, expireSubscriptions} from '../src/economy/index.js'
import {checkAccess} from '../src/entitlements/index.js'
import {createTestApp, did, type TestApp} from './helpers.js'
import {fixtures} from './media-fixtures.js'

const A = did('huserA')
const B = did('huserB')
const CREATOR = did('hcreator')
const OWNER = did('hstudioowner')
const SUPER = did('hsuper')

let t: TestApp
let f: ReturnType<typeof fixtures>
let creatorId: string

beforeAll(() => {
  f = fixtures()
})

beforeEach(async () => {
  t = await createTestApp({superadminDids: [SUPER]})
  creatorId = await t.approvedCreator(CREATOR, 'hard.creator.test')
  for (const d of [A, B, OWNER]) await t.verifiedUser(d)
})

async function paidVideo(kind: 'ppv' | 'purchase' | 'rental' = 'ppv') {
  const up = await t.upload(CREATOR, 'video', 'original', 'video/mp4', f.video)
  const policy = {
    ppv: 'ppv_required',
    purchase: 'purchase_required',
    rental: 'rental_required',
  }[kind]
  const r = await t.call('POST', '/dashboard/creator/videos', CREATOR, {
    title: 'Pago',
    mediaAssetId: up.assetId,
    accessPolicy: policy,
    visibility: 'published',
    offer: {
      kind,
      priceMinor: 990,
      currency: 'BRL',
      accessHours: kind === 'purchase' ? undefined : 24,
    },
  })
  expect(r.status).toBe(200)
  return r.body as {videoId: string; offerId: string}
}

const play = (who: string, id: string) =>
  t.call('POST', `/views/videos/${id}/playback`, who, {})

// ------------------------------------------------------------ 15.2 authentication

describe('15.2 authentication', () => {
  it('rejects anonymous, forged, wrong-audience and expired tokens', async () => {
    const bearer = async (token: string, url = '/me/adult/access') =>
      (
        await t.app.inject({
          method: 'GET',
          url,
          headers: {authorization: `Bearer ${token}`},
        })
      ).statusCode
    expect((await t.call('GET', '/me/adult/access')).status).toBe(401)
    expect((await t.call('GET', '/me/adult/access', 'not-a-did')).status).toBe(
      401,
    )
    const good = await t.serviceToken(A)
    expect(await bearer(good)).toBe(200)
    // Forged: signed by a key that is not A's.
    const stranger = await Secp256k1Keypair.create()
    const forged = await createServiceJwt({
      iss: A,
      aud: t.config.serviceDid,
      lxm: null,
      keypair: stranger,
    })
    expect(await bearer(forged)).toBe(401)
    expect(await bearer(await t.serviceToken(A, 'did:web:someone-else'))).toBe(
      401,
    )
    // Correctly signed by A's own key, but already expired.
    const expired = await t.serviceToken(
      A,
      t.config.serviceDid,
      Math.floor(Date.now() / 1000) - 60,
    )
    expect(await bearer(expired)).toBe(401)
    expect(await bearer('garbage.token.value')).toBe(401)
  })

  it('the dev identity header does nothing when dev auth is off', async () => {
    const strict = await createTestApp({devAuth: false})
    expect((await strict.call('GET', '/me/adult/access', A)).status).toBe(401)
    // Dev-only routes are hidden entirely.
    expect(
      (await strict.call('POST', '/dev/age-verification', A, {})).status,
    ).toBe(404)
  })

  it('identity never comes from bodies or query strings', async () => {
    const {videoId, offerId} = await paidVideo()
    await t.buy(A, offerId)
    // B names A everywhere it can; still B.
    const r = await t.call(
      'POST',
      `/views/videos/${videoId}/playback?did=${A}`,
      B,
      {userDid: A, did: A},
    )
    expect(r.status).toBe(403)
  })
})

// ------------------------------------------------------------ 15.3/15.4 IDOR

describe('15.3/15.4 authorization and IDOR', () => {
  it('B cannot reach A’s order, entitlement, library, media or playback grant', async () => {
    const {videoId, offerId} = await paidVideo()
    const {order} = await t.buy(A, offerId)
    await t.call('PUT', `/me/library/saved/video/${videoId}`, A)
    expect((await play(A, videoId)).status).toBe(200)

    expect((await t.call('GET', `/orders/${order.id}`, B)).status).toBe(404)
    expect((await t.call('GET', '/me/orders', B)).body.orders).toEqual([])
    expect(
      (await t.call('GET', '/me/entitlements', B)).body.entitlements,
    ).toEqual([])
    expect((await play(B, videoId)).status).toBe(403)
    const lib = await t.call('GET', '/me/library', B)
    expect(JSON.stringify(lib.body)).not.toContain(videoId)
    // Deleting "A's" saved item from B's session touches only B's rows.
    await t.call('DELETE', `/me/library/saved/video/${videoId}`, B)
    expect(
      JSON.stringify((await t.call('GET', '/me/library', A)).body),
    ).toContain(videoId)
    const [v] = await t.db.query(
      `select media_asset_id from videos where id = $1`,
      [videoId],
    )
    expect(
      (await t.call('GET', `/media/assets/${v.media_asset_id}`, B)).status,
    ).toBe(404)
    expect(
      (await t.call('GET', `/media/assets/${v.media_asset_id}`, CREATOR))
        .status,
    ).toBe(200)

    // A's entitlement id cannot be grafted onto a token: the signature breaks.
    const url = (await play(A, videoId)).body.url as string
    const [token] = url.split('/').slice(2, 3)
    const [payload, sig] = token.split('.')
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
    const tampered = Buffer.from(
      JSON.stringify({...claims, exp: claims.exp + 3600}),
    ).toString('base64url')
    expect(
      (await t.fetch(url.replace(token, `${tampered}.${sig}`))).status,
    ).toBe(403)
  })

  it('creator, studio, offer and payout ids from the client grant nothing', async () => {
    const other = await t.approvedCreator(
      did('hothercreator'),
      'other.creator.test',
    )
    const {offerId} = await paidVideo()
    expect(
      (
        await t.call(
          'PATCH',
          `/dashboard/offers/${offerId}`,
          did('hothercreator'),
          {priceMinor: 1},
        )
      ).status,
    ).toBe(403)
    // A foreign creator id in the body is ignored: the tier is the caller's.
    const tier = await t.call('POST', '/creator/tiers', did('hothercreator'), {
      sellerType: 'creator',
      sellerId: creatorId,
      name: 'x',
      priceMinor: 100,
      currency: 'BRL',
      billingPeriod: 'month',
    })
    const [owner] = await t.db.query(
      `select owner_id from subscription_tiers where id = $1`,
      [tier.body.tierId],
    )
    expect(owner.owner_id).toBe(other)
    const studio = await t.call('POST', '/studios', OWNER, {
      name: 'H Films',
      handle: 'h-films',
    })
    expect(
      (await t.call('GET', `/dashboard/studios/${studio.body.studioId}`, A))
        .status,
    ).toBe(404)
    expect(
      (
        await t.call('POST', `/studios/${studio.body.studioId}/members`, A, {
          did: A,
          role: 'ADMIN',
        })
      ).status,
    ).toBe(403)
    expect(other).toBeTruthy()
  })
})

// ------------------------------------------------------------ 15.5 media security

describe('15.5 media security', () => {
  it('expired rental and ended subscription stop playback at the playlist', async () => {
    const {videoId, offerId} = await paidVideo('rental')
    await t.buy(A, offerId)
    const url = (await play(A, videoId)).body.url
    expect((await t.fetch(url)).status).toBe(200)
    await t.db.query(
      `update entitlements set expires_at = now() - interval '1 second' where user_did = $1`,
      [A],
    )
    expect((await t.fetch(url)).status).toBe(403)
    expect((await play(A, videoId)).body.error).toBe('rental_expired')
  })

  it('subscription expiry revokes access; storage outage never serves content', async () => {
    const tier = await t.call('POST', '/creator/tiers', CREATOR, {
      name: 'Gold',
      priceMinor: 1990,
      currency: 'BRL',
      billingPeriod: 'month',
    })
    const up = await t.upload(
      CREATOR,
      'video',
      'original',
      'video/mp4',
      f.video,
    )
    const v = await t.call('POST', '/creator/videos', CREATOR, {
      title: 'Subs',
      mediaAssetId: up.assetId,
      accessPolicy: 'subscriber_only',
      publish: true,
    })
    await t.buy(A, tier.body.offerId)
    expect((await play(A, v.body.videoId)).status).toBe(200)
    await t.db.query(
      `update subscriptions set current_period_end = now() - interval '1 minute'`,
    )
    await t.db.query(
      `update entitlements set expires_at = now() - interval '1 minute' where type = 'subscription'`,
    )
    expect(await expireSubscriptions(t.db)).toBe(1)
    expect((await play(A, v.body.videoId)).status).toBe(403)

    // Storage unavailable: the file is gone → 404, never a stale/other file.
    const free = await t.call('POST', '/creator/videos', CREATOR, {
      title: 'Free',
      mediaAssetId: up.assetId,
      accessPolicy: 'free',
      publish: true,
    })
    const url = (await play(A, free.body.videoId)).body.url
    await rm(join(t.config.mediaDir, 'assets', up.assetId!), {
      recursive: true,
      force: true,
    })
    expect([404, 500]).toContain((await t.fetch(url)).status)
  })
})

// ------------------------------------------------------------ 15.6 cache leakage

describe('15.6 cache leakage', () => {
  it('personalized responses are private, no-store; media is private and short-lived', async () => {
    const {videoId, offerId} = await paidVideo('purchase')
    await t.buy(A, offerId)
    for (const url of [
      '/views/feed',
      '/me/library',
      '/me/orders',
      '/me/adult/access',
      '/dashboard/creator',
      `/views/videos/${videoId}`,
    ]) {
      const who = url.startsWith('/dashboard') ? CREATOR : A
      const r = await t.call('GET', url, who)
      expect(r.raw.headers['cache-control'], url).toBe('private, no-store')
    }
    const media = await t.fetch((await play(A, videoId)).body.url)
    expect(media.headers['cache-control']).toMatch(/^private, max-age=\d+$/)
    expect(
      Number(String(media.headers['cache-control']).split('=')[1]),
    ).toBeLessThanOrEqual(300)
  })
})

// ------------------------------------------------------------ 15.11/15.12 money & races

describe('15.11/15.12 financial integrity and races', () => {
  it('replayed and concurrent checkouts with one key make one order', async () => {
    const {offerId} = await paidVideo()
    const body = {offerId, idempotencyKey: 'same-key-123456'}
    const [r1, r2, r3] = await Promise.all([
      t.call('POST', '/checkout', A, body),
      t.call('POST', '/checkout', A, body),
      t.call('POST', '/checkout', A, body),
    ])
    const ids = new Set(
      [r1, r2, r3].filter(r => r.status === 200).map(r => r.body.id),
    )
    expect(ids.size).toBe(1)
    const [n] = await t.db.query(
      `select count(*)::int as n from orders where buyer_did = $1`,
      [A],
    )
    expect(n.n).toBe(1)
  })

  it('the same payment event delivered concurrently is applied once', async () => {
    const {offerId} = await paidVideo()
    const order = await t.call('POST', '/checkout', A, {
      offerId,
      idempotencyKey: 'conc-webhook-1',
    })
    const ref = order.body.checkoutUrl.split('/').pop()
    const event = {
      type: 'payment.succeeded' as const,
      providerReference: ref,
      amountMinor: 990n,
      currency: 'BRL',
      id: 'evt-fixed-1',
    }
    const results = await Promise.all([
      t.deliver(event as any),
      t.deliver(event as any),
    ])
    expect(results.every(r => r.statusCode < 500)).toBe(true)
    const sales = await t.db.query(
      `select count(*)::int as n from ledger_entries where type = 'SALE'`,
    )
    expect(sales[0].n).toBe(1)
    const grants = await t.db.query(
      `select count(*)::int as n from entitlements where user_did = $1`,
      [A],
    )
    expect(grants[0].n).toBe(1)
  })

  it('a payment provider failure leaves no entitlement behind', async () => {
    const {offerId, videoId} = await paidVideo()
    const broken = {
      name: 'broken',
      createCheckout: async () => {
        throw new Error('provider down')
      },
    } as any
    await expect(
      checkout(t.db, broken, A, {offerId, idempotencyKey: 'broken-provider-1'}),
    ).rejects.toThrow()
    const [o] = await t.db.query(
      `select status from orders where buyer_did = $1`,
      [A],
    )
    expect(o.status).toBe('PENDING')
    expect((await play(A, videoId)).status).toBe(403)
    const noPayments = await createTestApp({mockPayments: false})
    expect(
      (
        await noPayments.call('POST', '/checkout', A, {
          offerId: 'x',
          idempotencyKey: 'abcdefgh',
        })
      ).status,
    ).toBe(503)
  })

  it('removal during processing is not undone when the worker finishes', async () => {
    const r = await t.call('POST', '/media/uploads', CREATOR, {
      kind: 'video',
      mimeType: 'video/mp4',
      sizeBytes: f.video.length,
    })
    await t.app.inject({
      method: 'PUT',
      url: r.body.uploadUrl,
      headers: {'content-type': 'application/octet-stream'},
      payload: f.video,
    })
    // Moderation pulls it while it is queued/processing.
    await t.db.query(
      `update media_assets set status = 'REMOVED' where id = $1`,
      [r.body.assetId],
    )
    await t.app.aquaMedia.drain()
    const [a] = await t.db.query(
      `select status from media_assets where id = $1`,
      [r.body.assetId],
    )
    expect(a.status).toBe('REMOVED')
  })
})

// ------------------------------------------------------------ 15.13 rate limiting

describe('15.13 rate limiting', () => {
  it('floods get 429; normal use does not', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 32; i++)
      statuses.push((await t.call('POST', '/checkout', A, {})).status)
    expect(statuses.slice(0, 30).every(s => s === 400)).toBe(true)
    expect(statuses.slice(30)).toEqual([429, 429])
    // Other routes are unaffected.
    expect((await t.call('GET', '/me/adult/access', A)).status).toBe(200)
  })
})

// ------------------------------------------------------------ 15.14 input validation / 15.20 logs

describe('15.14 input validation and 15.20 logs', () => {
  it('stores markup as inert text and rejects malformed input', async () => {
    const up = await t.upload(
      CREATOR,
      'video',
      'original',
      'video/mp4',
      f.video,
    )
    const xss = '<img src=x onerror=alert(1)>'
    const v = await t.call('POST', '/creator/videos', CREATOR, {
      title: xss,
      mediaAssetId: up.assetId,
      accessPolicy: 'free',
      publish: true,
    })
    const detail = await t.call('GET', `/views/videos/${v.body.videoId}`, A)
    expect(detail.raw.headers['content-type']).toMatch(/^application\/json/)
    expect(detail.raw.headers['x-content-type-options']).toBe('nosniff')
    expect(detail.body.video.title).toBe(xss)
    const bad = await t.app.inject({
      method: 'POST',
      url: '/reports',
      headers: {'x-aqua-dev-did': A, 'content-type': 'application/json'},
      payload: '{nope',
    })
    expect(bad.json()).toEqual({error: 'invalid_json'})
    const huge = await t.call('POST', '/reports', A, {
      targetType: 'content',
      resourceId: 'x'.repeat(600),
      reasonCode: 'spam',
    })
    expect(huge.status).toBe(400)
    expect((await t.fetch('/stream/abc/..%2F..%2Fetc%2Fpasswd')).status).toBe(
      403,
    )
  })

  it('log lines never carry signed tokens or stream keys', () => {
    expect(redactUrl('/stream/eyJhIjoxfQ.sig/master.m3u8')).toBe(
      '/stream/[redacted]/master.m3u8',
    )
    expect(redactUrl('/live/ingest/sk_secret/index.m3u8')).toBe(
      '/live/ingest/[redacted]/index.m3u8',
    )
    expect(redactUrl('/media/upload/tok123')).toBe('/media/upload/[redacted]')
    expect(redactUrl('/views/feed')).toBe('/views/feed')
  })
})

// ------------------------------------------------------------ 15.21 failure modes

describe('15.21 failure modes fail closed', () => {
  it('an Entitlements/database outage is a denial, never an allow', async () => {
    const down = {
      query: async () => {
        throw new Error('db down')
      },
    }
    const r = await checkAccess(down as any, A, {type: 'video', id: 'anything'})
    expect(r.decision).toEqual({allowed: false, reason: 'unknown'})
  })

  it('health reports the database; ops health is staff-only and content-free', async () => {
    expect((await t.fetch('/health')).status).toBe(200)
    expect((await t.call('GET', '/admin/health', A)).status).toBe(403)
    const h = await t.call('GET', '/admin/health', SUPER)
    expect(h.body).toMatchObject({
      database: 'ok',
      media: expect.anything(),
      payments: expect.anything(),
    })
    expect(JSON.stringify(h.body)).not.toMatch(/did:|title/)
  })
})

// ------------------------------------------------------------ 15.25–15.27 E2E

describe('15.25 E2E — viewer master flow', () => {
  it('identity → +18 → feed → protected post → buy → play → library → views → studio → rental → live → report → moderation → logout', async () => {
    const V = did('he2eviewer')
    // AQUA identity enters +18 via the self-declaration gate.
    expect((await t.call('GET', '/views/feed', V)).status).toBe(403)
    await t.call('POST', '/me/adult/self-declaration', V, {
      declaration: 'adult',
      policyVersion: '2026-09-29',
    })
    expect((await t.call('GET', '/views/feed', V)).status).toBe(200)

    // Protected AT post (ppv) → dev purchase → entitlement.
    const uri = `at://${CREATOR}/app.bsky.feed.post/e2e1`
    await t.call('POST', '/creator/resources', CREATOR, {
      resourceType: 'post',
      resourceId: uri,
      accessPolicy: 'ppv_required',
    })
    const postOffer = await t.call('POST', '/creator/offers', CREATOR, {
      resourceType: 'post',
      resourceId: uri,
      kind: 'ppv',
      priceMinor: 500,
      currency: 'BRL',
      accessHours: 48,
    })
    const check = () =>
      t.call('POST', '/access/check', V, {
        resourceType: 'post',
        resourceId: uri,
      })
    expect((await check()).body.allowed).toBe(false)
    await t.buy(V, postOffer.body.offerId)
    expect((await check()).body).toMatchObject({allowed: true, via: 'grant'})

    // Views +18 video: buy, play, library.
    const {videoId, offerId} = await paidVideo('purchase')
    await t.buy(V, offerId)
    expect((await play(V, videoId)).status).toBe(200)
    await t.call('POST', `/views/videos/${videoId}/progress`, V, {
      positionMs: 2500,
      durationMs: 3000,
    })
    const lib = await t.call('GET', '/me/library', V)
    expect(JSON.stringify(lib.body)).toContain(videoId)

    // Studio rental.
    const studio = await t.call('POST', '/studios', OWNER, {
      name: 'E2E Films',
      handle: 'e2e-films',
    })
    const sid = studio.body.studioId
    await t.call('POST', `/dev/studios/${sid}/verify`, OWNER, {})
    const media = await t.upload(
      OWNER,
      'video',
      'original',
      'video/mp4',
      f.video,
    )
    const movie = await t.call('POST', `/studios/${sid}/movies`, OWNER, {
      title: 'Filme E2E',
      mediaAssetId: media.assetId,
      accessPolicy: 'rental_required',
      status: 'published',
    })
    const rental = await t.call('POST', '/creator/offers', OWNER, {
      sellerType: 'studio',
      sellerId: sid,
      resourceType: 'movie',
      resourceId: movie.body.movieId,
      kind: 'rental',
      priceMinor: 1490,
      currency: 'BRL',
      accessHours: 48,
    })
    const playMovie = () =>
      t.call(
        'POST',
        `/studio-titles/movie/${movie.body.movieId}/playback`,
        V,
        {},
      )
    expect((await playMovie()).status).toBe(403)
    await t.buy(V, rental.body.offerId)
    expect((await playMovie()).status).toBe(200)

    // Live: listed; report it → case → moderator quarantines → gone.
    const live = await t.call('POST', '/live', CREATOR, {
      title: 'Live E2E',
      accessPolicy: 'free',
    })
    expect((await t.call('GET', '/live', V)).body.upcoming.length).toBe(1)
    const rep = await t.call('POST', '/reports', V, {
      targetType: 'live',
      resourceId: live.body.streamId,
      reasonCode: 'spam',
    })
    expect(rep.status).toBe(200)
    const [{case_id: caseId}] = await t.db.query(
      `select case_id from reports where id = $1`,
      [rep.body.reportId],
    )
    await t.call('POST', '/admin/staff', SUPER, {
      did: did('he2emod'),
      role: 'MODERATOR',
    })
    await t.call('POST', `/admin/cases/${caseId}/actions`, did('he2emod'), {
      action: 'quarantine',
      reason: 'spam live',
    })
    expect((await t.call('GET', '/live', V)).body.upcoming).toEqual([])

    // Isolation at every step: another adult sees none of V's activity.
    const other = did('he2eother')
    await t.verifiedUser(other)
    for (const url of [
      '/me/library',
      '/me/orders',
      '/me/entitlements',
      '/me/reports',
      '/me/adult/history',
    ])
      expect(
        JSON.stringify((await t.call('GET', url, other)).body),
      ).not.toMatch(new RegExp(`${videoId}|${uri}|${movie.body.movieId}`))
    // Logout is client-side (token cache + entry cleared, see app tests);
    // without a token the API answers nothing.
    expect((await t.call('GET', '/me/library')).status).toBe(401)
  })
})

describe('15.26 E2E — creator flow', () => {
  it('identity → onboarding → TEST verification → dashboard → upload → post → policy → publish → subscriber → ledger', async () => {
    const C = did('he2ecreator')
    await t.call('POST', '/admin/staff', SUPER, {
      did: did('he2etns'),
      role: 'TRUST_SAFETY',
    })
    const app = await t.call('POST', '/creator/applications', C, {
      handle: 'e2e.creator',
    })
    await t.call('POST', '/dev/verification/complete', C, {kind: 'identity'})
    await t.call('POST', '/dev/verification/complete', C, {kind: 'age'})
    await t.call('POST', `/creator/applications/${app.body.id}/agreement`, C, {
      version: '2026-09-creator-v1',
    })
    expect(
      (
        await t.call(
          'POST',
          `/admin/creator-applications/${app.body.id}/decision`,
          did('he2etns'),
          {decision: 'approve', reason: 'verified in test env'},
        )
      ).status,
    ).toBe(200)
    expect((await t.call('GET', '/dashboard/creator', C)).status).toBe(200)

    const up = await t.upload(C, 'video', 'original', 'video/mp4', f.video)
    expect(up.status).toBe(200)
    const tier = await t.call('POST', '/creator/tiers', C, {
      name: 'Fãs',
      priceMinor: 1500,
      currency: 'BRL',
      billingPeriod: 'month',
    })
    const uri = `at://${C}/app.bsky.feed.post/e2epost`
    expect(
      (
        await t.call('POST', '/creator/resources', C, {
          resourceType: 'post',
          resourceId: uri,
          accessPolicy: 'subscriber_only',
        })
      ).status,
    ).toBe(200)
    const video = await t.call('POST', '/dashboard/creator/videos', C, {
      title: 'Só assinantes',
      mediaAssetId: up.assetId,
      accessPolicy: 'tier_required',
      requiredTierId: tier.body.tierId,
      visibility: 'published',
    })
    expect(video.status).toBe(200)

    expect((await play(A, video.body.videoId)).status).toBe(403)
    await t.buy(A, tier.body.offerId)
    expect((await play(A, video.body.videoId)).status).toBe(200)
    expect(
      (
        await t.call('POST', '/access/check', A, {
          resourceType: 'post',
          resourceId: uri,
        })
      ).body.allowed,
    ).toBe(true)
    const rev = await t.call('GET', '/dashboard/creator/revenue', C)
    expect(rev.body.balances.BRL.gross).toBe('1500')
    expect(JSON.stringify(rev.body)).not.toContain(A)
  })
})

describe('15.27 E2E — studio flow', () => {
  it('owner → studio → series → season → episode → media → policy → publish → purchase → play → revenue', async () => {
    const studio = await t.call('POST', '/studios', OWNER, {
      name: 'Serie Films',
      handle: 'serie-films',
    })
    const sid = studio.body.studioId
    await t.call('POST', `/dev/studios/${sid}/verify`, OWNER, {})
    const series = await t.call('POST', `/studios/${sid}/series`, OWNER, {
      title: 'Série',
      accessPolicy: 'purchase_required',
      status: 'published',
    })
    const season = await t.call(
      'POST',
      `/series/${series.body.seriesId}/seasons`,
      OWNER,
      {number: 1, status: 'published'},
    )
    const media = await t.upload(
      OWNER,
      'video',
      'original',
      'video/mp4',
      f.video,
    )
    const ep = await t.call(
      'POST',
      `/seasons/${season.body.seasonId}/episodes`,
      OWNER,
      {
        number: 1,
        title: 'Piloto',
        mediaAssetId: media.assetId,
        status: 'published',
      },
    )
    expect(ep.status).toBe(200)
    const offer = await t.call('POST', '/creator/offers', OWNER, {
      sellerType: 'studio',
      sellerId: sid,
      resourceType: 'series',
      resourceId: series.body.seriesId,
      kind: 'purchase',
      priceMinor: 4990,
      currency: 'BRL',
    })
    expect(offer.status).toBe(200)
    const playEp = () =>
      t.call(
        'POST',
        `/studio-titles/episode/${ep.body.episodeId}/playback`,
        A,
        {},
      )
    expect((await playEp()).status).toBe(403)
    await t.buy(A, offer.body.offerId)
    expect((await playEp()).status).toBe(200)
    const rev = await t.call('GET', `/dashboard/studios/${sid}/revenue`, OWNER)
    expect(rev.body.balances.BRL.gross).toBe('4990')
    expect(
      (await t.call('GET', `/dashboard/studios/${sid}/revenue`, A)).status,
    ).toBe(404)
  })
})
