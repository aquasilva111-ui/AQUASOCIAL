import {beforeAll, beforeEach, describe, expect, it} from 'vitest'

import {checkAccess} from '../src/entitlements/index.js'
import {createTestApp, did, type TestApp} from './helpers.js'
import {fixtures} from './media-fixtures.js'

const OWNER = did('sowner')
const ADMIN = did('sadmin')
const EDITOR = did('seditor')
const ANALYST = did('sanalyst')
const VIEWER = did('sviewer')
const STRANGER = did('sstranger')

let t: TestApp
let studioId: string
let f: ReturnType<typeof fixtures>

beforeAll(() => {
  f = fixtures()
})

beforeEach(async () => {
  t = await createTestApp()
  for (const d of [OWNER, ADMIN, EDITOR, ANALYST, VIEWER, STRANGER])
    await t.verifiedUser(d)
  const r = await t.call('POST', '/studios', OWNER, {
    name: 'Aqua Films',
    handle: 'aqua-films',
  })
  expect(r.status).toBe(200)
  studioId = r.body.studioId
  await t.call('POST', `/studios/${studioId}/members`, OWNER, {
    did: ADMIN,
    role: 'ADMIN',
  })
  await t.call('POST', `/studios/${studioId}/members`, OWNER, {
    did: EDITOR,
    role: 'EDITOR',
  })
  await t.call('POST', `/studios/${studioId}/members`, OWNER, {
    did: ANALYST,
    role: 'ANALYST',
  })
})

const verify = () =>
  t.call('POST', `/dev/studios/${studioId}/verify`, OWNER, {})

async function video(by = EDITOR) {
  const up = await t.upload(by, 'video', 'original', 'video/mp4', f.video)
  expect(up.status).toBe(200)
  return up.assetId!
}

async function movie(policy: string, extra: Record<string, unknown> = {}) {
  await verify()
  const r = await t.call('POST', `/studios/${studioId}/movies`, EDITOR, {
    title: 'O Filme',
    mediaAssetId: await video(),
    accessPolicy: policy,
    status: 'published',
    ...extra,
  })
  expect(r.status).toBe(200)
  return r.body.movieId as string
}

const offer = (
  resourceType: string,
  resourceId: string,
  kind: string,
  priceMinor: number,
  accessHours?: number,
  by = OWNER,
) =>
  t.call('POST', '/creator/offers', by, {
    sellerType: 'studio',
    sellerId: studioId,
    resourceType,
    resourceId,
    kind,
    priceMinor,
    currency: 'BRL',
    accessHours,
  })

const play = (type: string, id: string, who = VIEWER) =>
  t.call('POST', `/studio-titles/${type}/${id}/playback`, who, {})

describe('studio creation and page', () => {
  it('creates a studio with a unique handle; page appears once verified', async () => {
    expect(
      (
        await t.call('POST', '/studios', STRANGER, {
          name: 'x',
          handle: 'aqua-films',
        })
      ).status,
    ).toBe(409)
    expect(
      (await t.call('GET', '/studios/by-handle/aqua-films', VIEWER)).status,
    ).toBe(404)
    await movie('free')
    const page = await t.call('GET', '/studios/by-handle/aqua-films', VIEWER)
    expect(page.status).toBe(200)
    expect(page.body.studio.name).toBe('Aqua Films')
    expect(page.body.movies).toHaveLength(1)
    const home = await t.call('GET', '/studios', VIEWER)
    expect(home.body.newReleases.map((m: any) => m.title)).toEqual(['O Filme'])
  })

  it('unverified studios cannot publish or sell', async () => {
    const r = await t.call('POST', `/studios/${studioId}/movies`, EDITOR, {
      title: 'x',
      mediaAssetId: await video(),
      accessPolicy: 'free',
      status: 'published',
    })
    expect(r.body).toEqual({error: 'studio_not_verified'})
    const draft = await t.call('POST', `/studios/${studioId}/movies`, EDITOR, {
      title: 'x',
      mediaAssetId: await video(),
      accessPolicy: 'purchase_required',
    })
    expect(
      (await offer('movie', draft.body.movieId, 'purchase', 1000)).status,
    ).toBe(403)
  })
})

describe('RBAC (least privilege, server-side)', () => {
  it('editors edit but cannot sell or manage the team; analysts only read revenue', async () => {
    const id = await movie('purchase_required')
    expect(
      (await offer('movie', id, 'purchase', 1000, undefined, EDITOR)).status,
    ).toBe(403)
    expect(
      (
        await t.call('POST', `/studios/${studioId}/members`, EDITOR, {
          did: STRANGER,
          role: 'EDITOR',
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await t.call('PATCH', `/studio-titles/movie/${id}`, ANALYST, {
          title: 'hack',
        })
      ).status,
    ).toBe(403)
    expect(
      (await t.call('GET', `/studios/${studioId}/revenue`, ANALYST)).status,
    ).toBe(200)
    expect(
      (await t.call('GET', `/studios/${studioId}/revenue`, EDITOR)).status,
    ).toBe(403)
    expect(
      (await offer('movie', id, 'purchase', 1000, undefined, ADMIN)).status,
    ).toBe(200)
  })

  it('admins cannot appoint admins or remove the owner; strangers get nothing', async () => {
    expect(
      (
        await t.call('POST', `/studios/${studioId}/members`, ADMIN, {
          did: STRANGER,
          role: 'ADMIN',
        })
      ).status,
    ).toBe(403)
    expect(
      (await t.call('DELETE', `/studios/${studioId}/members/${OWNER}`, ADMIN))
        .status,
    ).toBe(403)
    expect(
      (
        await t.call('POST', `/studios/${studioId}/movies`, STRANGER, {
          title: 'x',
          mediaAssetId: 'ast_x',
          accessPolicy: 'free',
        })
      ).status,
    ).toBe(403)
    expect(
      (await t.call('POST', `/dev/studios/${studioId}/verify`, STRANGER, {}))
        .status,
    ).toBe(403)
  })

  it("titles cannot use someone else's media", async () => {
    await verify()
    const foreign = await t.upload(
      OWNER,
      'video',
      'original',
      'video/mp4',
      f.video,
    )
    const r = await t.call('POST', `/studios/${studioId}/movies`, EDITOR, {
      title: 'x',
      mediaAssetId: foreign.assetId,
      accessPolicy: 'free',
    })
    expect(r.status).toBe(400)
  })
})

describe('access models', () => {
  it('free movie plays through the shared Media Engine', async () => {
    const id = await movie('free')
    const p = await play('movie', id)
    expect(p.status).toBe(200)
    expect((await t.fetch(p.body.url)).status).toBe(200)
  })

  it('studio subscription (independent from creator subscriptions)', async () => {
    const id = await movie('subscriber_only')
    const tier = await t.call('POST', '/creator/tiers', OWNER, {
      sellerType: 'studio',
      sellerId: studioId,
      name: 'Clube Aqua Films',
      priceMinor: 3990,
      currency: 'BRL',
      billingPeriod: 'month',
    })
    expect(tier.status).toBe(200)
    expect((await play('movie', id)).status).toBe(403)
    await t.buy(VIEWER, tier.body.offerId)
    expect((await play('movie', id)).status).toBe(200)
    const [sub] = await t.db.query(`select target_type from subscriptions`)
    expect(sub.target_type).toBe('studio')
    const rev = await t.call('GET', `/studios/${studioId}/revenue`, OWNER)
    expect(rev.body.balances.BRL.gross).toBe('3990')
  })

  it('PPV and purchase', async () => {
    const id = await movie('ppv_required')
    const {body: o} = await offer('movie', id, 'ppv', 1490, 24)
    await t.buy(VIEWER, o.offerId)
    expect((await play('movie', id)).status).toBe(200)
    const id2 = await movie('purchase_required')
    const {body: o2} = await offer('movie', id2, 'purchase', 4990)
    expect((await play('movie', id2)).body).toEqual({
      error: 'purchase_required',
    })
    await t.buy(VIEWER, o2.offerId)
    const d = await checkAccess(
      t.db,
      VIEWER,
      {type: 'movie', id: id2},
      new Date(Date.now() + 5 * 365 * 24 * 3600_000),
    )
    expect(d.decision).toMatchObject({
      allowed: true,
      entitlementType: 'purchase',
    })
  })

  it('removed production is unreachable, including by old URLs', async () => {
    const id = await movie('free')
    const p = await play('movie', id)
    await t.db.query(`update movies set status = 'removed' where id = $1`, [id])
    expect((await play('movie', id)).body).toEqual({error: 'content_removed'})
    expect(
      (await t.call('GET', `/studio-titles/movie/${id}`, VIEWER)).status,
    ).toBe(404)
    expect(
      (
        await t.call('PATCH', `/studio-titles/movie/${id}`, OWNER, {
          status: 'published',
        })
      ).status,
    ).toBe(403)
    const [m] = await t.db.query(
      `select media_asset_id from movies where id = $1`,
      [id],
    )
    await t.app.aquaMedia.setStatus(m.media_asset_id, 'REMOVED')
    expect((await t.fetch(p.body.url)).status).toBe(403)
  })

  it('availability windows and region restrictions fail closed', async () => {
    const future = await movie('free', {
      availabilityStart: new Date(Date.now() + 86400_000).toISOString(),
    })
    expect((await play('movie', future)).body).toEqual({
      error: 'content_unavailable',
    })
    const regional = await movie('free', {allowedRegions: ['BR']})
    // No trusted viewer region yet -> denied rather than guessed.
    expect((await play('movie', regional)).body).toEqual({
      error: 'region_restricted',
    })
  })
})

describe('series, seasons, episodes, collections', () => {
  async function series(policy = 'ppv_required') {
    await verify()
    const s = await t.call('POST', `/studios/${studioId}/series`, EDITOR, {
      title: 'A Série',
      accessPolicy: policy,
      status: 'published',
    })
    const se = await t.call(
      'POST',
      `/series/${s.body.seriesId}/seasons`,
      EDITOR,
      {number: 1, status: 'published'},
    )
    const eps: string[] = []
    for (const n of [1, 2]) {
      const e = await t.call(
        'POST',
        `/seasons/${se.body.seasonId}/episodes`,
        EDITOR,
        {
          number: n,
          title: `Ep ${n}`,
          mediaAssetId: await video(),
          status: 'published',
        },
      )
      expect(e.status).toBe(200)
      eps.push(e.body.episodeId)
    }
    return {
      seriesId: s.body.seriesId as string,
      seasonId: se.body.seasonId as string,
      eps,
    }
  }

  it('episodes inherit policy; buying a season opens its episodes', async () => {
    const {seriesId, seasonId, eps} = await series('ppv_required')
    expect((await play('episode', eps[0])).body).toEqual({
      error: 'purchase_required',
    })
    const {body: o} = await offer('season', seasonId, 'purchase', 2990)
    await t.buy(VIEWER, o.offerId)
    expect((await play('episode', eps[0])).status).toBe(200)
    expect((await play('episode', eps[1])).status).toBe(200)
    const detail = await t.call(
      'GET',
      `/studio-titles/series/${seriesId}`,
      VIEWER,
    )
    expect(
      detail.body.seasons[0].episodes.every((e: any) => e.access.allowed),
    ).toBe(true)
  })

  it('a removed series takes every episode down', async () => {
    const {seriesId, eps} = await series('free')
    expect((await play('episode', eps[0])).status).toBe(200)
    await t.db.query(`update series set status = 'removed' where id = $1`, [
      seriesId,
    ])
    expect((await play('episode', eps[0])).body).toEqual({
      error: 'content_removed',
    })
  })

  it('collection purchase covers bundled titles only', async () => {
    const a = await movie('purchase_required')
    const b = await movie('purchase_required')
    const col = await t.call(
      'POST',
      `/studios/${studioId}/collections`,
      EDITOR,
      {
        title: 'Pacote',
        accessPolicy: 'purchase_required',
        status: 'published',
        items: [{type: 'movie', id: a}],
      },
    )
    expect(col.status).toBe(200)
    const {body: o} = await offer(
      'collection',
      col.body.collectionId,
      'purchase',
      5990,
    )
    await t.buy(VIEWER, o.offerId)
    expect((await play('movie', a)).status).toBe(200)
    expect((await play('movie', b)).status).toBe(403)
  })

  it('credits show only what was published; no identity inference', async () => {
    const id = await movie('free')
    await t.call('POST', '/studio-credits', EDITOR, {
      itemType: 'movie',
      itemId: id,
      role: 'Direção',
      displayName: 'A. Diretora',
      entityType: 'external',
      entityDid: 'did:plc:shouldnotbestored',
    })
    const d = await t.call('GET', `/studio-titles/movie/${id}`, VIEWER)
    expect(d.body.credits).toEqual([
      {role: 'Direção', display_name: 'A. Diretora'},
    ])
    const [row] = await t.db.query(`select entity_did from production_credits`)
    expect(row.entity_did).toBeNull()
  })
})

describe('isolation', () => {
  it('studio search and history stay inside the adult context', async () => {
    const id = await movie('free')
    expect(
      (await t.call('GET', '/studios/search?q=Filme', did('unverified')))
        .status,
    ).toBe(403)
    const res = await t.call('GET', '/studios/search?q=Filme', VIEWER)
    expect(res.body.movies.map((m: any) => m.id)).toEqual([id])
    await t.call('POST', `/studio-titles/movie/${id}/progress`, VIEWER, {
      positionMs: 1500,
      durationMs: 3000,
    })
    const home = await t.call('GET', '/studios', VIEWER)
    expect(home.body.continueWatching[0]).toMatchObject({
      resource_type: 'movie',
      resource_id: id,
    })
    expect(
      (await t.call('GET', '/studios', STRANGER)).body.continueWatching,
    ).toHaveLength(0)
  })
})

describe('E2E: studio movie rental', () => {
  it('rental -> temporary entitlement -> playback -> expiry -> denied', async () => {
    const id = await movie('rental_required')
    const {body: o} = await offer('movie', id, 'rental', 990, 48)
    expect((await play('movie', id)).body).toEqual({error: 'rental_expired'})
    await t.buy(VIEWER, o.offerId)
    const p = await play('movie', id)
    expect(p.status).toBe(200)
    expect((await t.fetch(p.body.url)).status).toBe(200)
    const [ent] = await t.db.query(
      `select type, starts_at, expires_at from entitlements where user_did = $1`,
      [VIEWER],
    )
    expect(ent.type).toBe('rental')
    expect(
      new Date(ent.expires_at).getTime() - new Date(ent.starts_at).getTime(),
    ).toBe(48 * 3600_000)
    const after = await checkAccess(
      t.db,
      VIEWER,
      {type: 'movie', id},
      new Date(Date.now() + 49 * 3600_000),
    )
    expect(after.decision).toEqual({allowed: false, reason: 'rental_expired'})
    // Simulate the clock passing: the grant expires, playback is refused.
    await t.db.query(
      `update entitlements set expires_at = now() - interval '1 second' where user_did = $1`,
      [VIEWER],
    )
    expect((await play('movie', id)).body).toEqual({error: 'rental_expired'})
    expect((await t.fetch(p.body.url)).status).toBe(403)
  })
})
