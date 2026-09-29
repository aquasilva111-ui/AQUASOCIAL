import {beforeAll, beforeEach, describe, expect, it} from 'vitest'

import {registerScanHook} from '../src/media/engine.js'
import {signPlayback} from '../src/media/signing.js'
import {assertSafeKey} from '../src/media/storage.js'
import {createTestApp, did, type TestApp} from './helpers.js'
import {fixtures} from './media-fixtures.js'

const CREATOR = did('vcreator')
const VIEWER = did('viewer')
const OTHER = did('vother')

let t: TestApp
let f: ReturnType<typeof fixtures>

beforeAll(() => {
  f = fixtures()
})

beforeEach(async () => {
  t = await createTestApp()
  await t.approvedCreator(CREATOR, 'studio.creator.test')
  await t.verifiedUser(VIEWER)
  await t.verifiedUser(OTHER)
})

async function readyVideo() {
  const up = await t.upload(CREATOR, 'video', 'original', 'video/mp4', f.video)
  expect(up.status).toBe(200)
  const [a] = await t.db.query(
    `select status from media_assets where id = $1`,
    [up.assetId],
  )
  expect(a.status).toBe('READY')
  return up.assetId!
}

async function publishVideo(
  policy: string,
  extra: Record<string, unknown> = {},
) {
  const mediaAssetId = await readyVideo()
  const r = await t.call('POST', '/creator/videos', CREATOR, {
    title: 'Clip',
    description: 'd',
    category: 'solo',
    mediaAssetId,
    accessPolicy: policy,
    publish: true,
    ...extra,
  })
  expect(r.status).toBe(200)
  return r.body.videoId as string
}

async function play(who: string, videoId: string) {
  return t.call('POST', `/views/videos/${videoId}/playback`, who, {})
}

describe('upload pipeline', () => {
  it('uploads, processes to adaptive HLS and never exposes storage keys', async () => {
    const up = await t.upload(
      CREATOR,
      'video',
      'original',
      'video/mp4',
      f.video,
    )
    expect(up.body).toEqual({assetId: up.assetId, status: 'QUEUED'})
    const asset = await t.call('GET', `/media/assets/${up.assetId}`, CREATOR)
    expect(asset.body).toMatchObject({
      status: 'READY',
      kind: 'video',
      width: 640,
      height: 360,
    })
    expect(asset.body.variants).toContain('hls')
    expect(JSON.stringify(asset.body)).not.toMatch(/storage_key|assets\//)
    expect(
      (await t.call('GET', `/media/assets/${up.assetId}`, OTHER)).status,
    ).toBe(404)
  })

  it('only approved creators get upload authorizations', async () => {
    const r = await t.call('POST', '/media/uploads', VIEWER, {
      kind: 'video',
      mimeType: 'video/mp4',
      sizeBytes: 100,
    })
    expect(r.status).toBe(403)
  })

  it('validates real content, size and single-use tokens', async () => {
    const fake = await t.upload(
      CREATOR,
      'video',
      'original',
      'video/mp4',
      Buffer.from('not a video at all, just text'),
    )
    expect(fake.status).toBe(400)
    expect(fake.body.error).toBe('invalid_file')
    const [a] = await t.db.query(
      `select status from media_assets where id = $1`,
      [fake.assetId],
    )
    expect(a.status).toBe('FAILED')

    const tooBig = await t.upload(
      CREATOR,
      'video',
      'original',
      'video/mp4',
      f.video,
      1000,
    )
    expect(tooBig.body.error).toBe('too_large')

    const ok = await t.upload(
      CREATOR,
      'video',
      'original',
      'video/mp4',
      f.video,
    )
    const reuse = await t.app.inject({
      method: 'PUT',
      url: ok.uploadUrl!,
      headers: {'content-type': 'application/octet-stream'},
      payload: f.video,
    })
    expect(reuse.statusCode).toBe(404)

    expect(
      (
        await t.call('POST', '/media/uploads', CREATOR, {
          kind: 'video',
          mimeType: 'application/x-msdownload',
          sizeBytes: 10,
        })
      ).status,
    ).toBe(400)
    expect(() => assertSafeKey('assets/../../etc/passwd')).toThrow()
  })

  it('marks undecodable media as FAILED', async () => {
    const corrupt = Buffer.concat([
      f.video.subarray(0, 32),
      Buffer.alloc(4096, 7),
    ])
    const up = await t.upload(
      CREATOR,
      'video',
      'original',
      'video/mp4',
      corrupt,
    )
    const [a] = await t.db.query(
      `select status from media_assets where id = $1`,
      [up.assetId],
    )
    expect(a.status).toBe('FAILED')
  })

  it('scan hooks can quarantine before anything is served', async () => {
    const unregister = registerScanHook(async asset =>
      asset.kind === 'image' ? 'quarantine' : 'ok',
    )
    const up = await t.upload(CREATOR, 'image', 'poster', 'image/png', f.poster)
    unregister()
    const [a] = await t.db.query(
      `select status from media_assets where id = $1`,
      [up.assetId],
    )
    expect(a.status).toBe('QUARANTINED')
  })
})

describe('publishing', () => {
  it('requires ready media and an explicit access policy', async () => {
    const mediaAssetId = await readyVideo()
    const noPolicy = await t.call('POST', '/creator/videos', CREATOR, {
      title: 'x',
      mediaAssetId,
      publish: true,
    })
    expect(noPolicy.status).toBe(400)
    const pending = await t.upload(
      CREATOR,
      'video',
      'original',
      'video/mp4',
      Buffer.from('bad'),
    )
    const notReady = await t.call('POST', '/creator/videos', CREATOR, {
      title: 'x',
      mediaAssetId: pending.assetId,
      accessPolicy: 'free',
      publish: true,
    })
    expect(notReady.status).toBe(409)
    const stolen = await t.call('POST', '/creator/videos', did('thief'), {
      title: 'x',
      mediaAssetId,
      accessPolicy: 'free',
    })
    expect(stolen.status).toBe(403)
  })
})

describe('playback authorization', () => {
  it('free video plays through signed HLS (master, rendition, segment)', async () => {
    const id = await publishVideo('free')
    const p = await play(VIEWER, id)
    expect(p.status).toBe(200)
    const master = await t.fetch(p.body.url)
    expect(master.status).toBe(200)
    expect(master.headers['content-type']).toContain('mpegurl')
    expect(master.body).toContain('#EXT-X-STREAM-INF')
    expect(master.headers['cache-control']).toMatch(/private/)
    const base = p.body.url.replace(/master\.m3u8$/, '')
    const rendition = await t.fetch(`${base}360p/index.m3u8`)
    expect(rendition.status).toBe(200)
    const seg = rendition.body
      .split('\n')
      .find((l: string) => l.endsWith('.ts'))
    const segment = await t.fetch(`${base}360p/${seg}`)
    expect(segment.status).toBe(200)
    expect(segment.headers['content-type']).toBe('video/mp2t')
    expect(segment.raw.length).toBeGreaterThan(1000)
  })

  it('PPV video: preview only; full asset unreachable without entitlement', async () => {
    const preview = await t.upload(
      CREATOR,
      'video',
      'preview',
      'video/mp4',
      f.preview,
    )
    const id = await publishVideo('ppv_required', {
      previewAssetId: preview.assetId,
    })
    expect((await play(VIEWER, id)).body).toEqual({error: 'purchase_required'})
    const pv = await t.call('POST', `/views/videos/${id}/preview`, VIEWER, {})
    expect(pv.status).toBe(200)
    // the preview token only opens the preview asset
    const [v] = await t.db.query(
      `select media_asset_id from videos where id = $1`,
      [id],
    )
    expect(pv.body.url).not.toContain(v.media_asset_id)
    const forged = signPlayback(
      {
        assetId: v.media_asset_id,
        variant: 'hls',
        entitlementId: '',
        exp: 9999999999,
      },
      'wrong-secret',
    )
    expect((await t.fetch(`/stream/${forged}/master.m3u8`)).status).toBe(403)
    const tokenPart = pv.body.url.split('/')[2]
    const [payload, sig] = tokenPart.split('.')
    const swapped = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload, 'base64url').toString()),
        assetId: v.media_asset_id,
      }),
    ).toString('base64url')
    expect(
      (await t.fetch(`/stream/${swapped}.${sig}/master.m3u8`)).status,
    ).toBe(403)
    expect(
      (
        await t.fetch(
          `/stream/${tokenPart}/../../${v.media_asset_id}/hls/master.m3u8`,
        )
      ).status,
    ).not.toBe(200)
  })

  it('expired authorizations are refused', async () => {
    const id = await publishVideo('free')
    const [v] = await t.db.query(
      `select media_asset_id from videos where id = $1`,
      [id],
    )
    const expired = signPlayback(
      {
        assetId: v.media_asset_id,
        variant: 'hls',
        entitlementId: '',
        exp: Math.floor(Date.now() / 1000) - 1,
      },
      t.config.mediaSigningSecret,
    )
    expect((await t.fetch(`/stream/${expired}/master.m3u8`)).status).toBe(403)
  })

  it('revoking the entitlement stops an existing playback URL at the playlist', async () => {
    const id = await publishVideo('ppv_required')
    const {body: o} = await t.call('POST', '/creator/offers', CREATOR, {
      resourceType: 'video',
      resourceId: id,
      kind: 'ppv',
      priceMinor: 990,
      currency: 'BRL',
      accessHours: 24,
    })
    const {ref} = await t.buy(VIEWER, o.offerId)
    const p = await play(VIEWER, id)
    expect((await t.fetch(p.body.url)).status).toBe(200)
    await t.deliver({
      type: 'refund.succeeded',
      providerReference: ref,
      amountMinor: 990n,
      currency: 'BRL',
    })
    expect((await t.fetch(p.body.url)).status).toBe(403)
    expect((await play(VIEWER, id)).status).toBe(403)
  })

  it('quarantined or removed media stops distribution everywhere', async () => {
    const id = await publishVideo('free')
    const p = await play(VIEWER, id)
    const [v] = await t.db.query(
      `select media_asset_id from videos where id = $1`,
      [id],
    )
    await t.app.aquaMedia.setStatus(v.media_asset_id, 'QUARANTINED')
    expect((await t.fetch(p.body.url)).status).toBe(403)
    expect((await play(VIEWER, id)).status).toBe(403)
    expect(
      (await t.call('GET', '/views/feed', VIEWER)).body.videos,
    ).toHaveLength(0)
    expect((await t.call('GET', `/views/videos/${id}`, VIEWER)).status).toBe(
      404,
    )
    await t.app.aquaMedia.setStatus(v.media_asset_id, 'READY')
    await t.db.query(`update videos set status = 'removed' where id = $1`, [id])
    expect((await play(VIEWER, id)).body).toEqual({error: 'content_removed'})
    expect(
      (
        await t.call('PATCH', `/creator/videos/${id}`, CREATOR, {
          status: 'published',
        })
      ).status,
    ).toBe(403)
  })

  it('unverified users cannot even list the catalog', async () => {
    await publishVideo('free')
    expect((await t.call('GET', '/views/feed', did('minor'))).status).toBe(403)
  })
})

describe('watch history, continue watching, views', () => {
  it('records private progress/history; counts a view once per window', async () => {
    const id = await publishVideo('free')
    for (const pos of [1000, 1600, 2500]) {
      expect(
        (
          await t.call('POST', `/views/videos/${id}/progress`, VIEWER, {
            positionMs: pos,
            durationMs: 3000,
          })
        ).status,
      ).toBe(200)
    }
    const [v] = await t.db.query(
      `select view_count from videos where id = $1`,
      [id],
    )
    expect(String(v.view_count)).toBe('1')
    const cont = await t.call('GET', '/views/feed?section=continue', VIEWER)
    expect(cont.body.videos.map((x: any) => x.id)).toEqual([id])
    const hist = await t.call('GET', '/me/adult/history', VIEWER)
    expect(hist.body.history).toHaveLength(1)
    expect(
      (await t.call('GET', '/me/adult/history', OTHER)).body.history,
    ).toHaveLength(0)
    expect(
      (
        await t.call(
          'DELETE',
          `/me/adult/history/${hist.body.history[0].id}`,
          OTHER,
        )
      ).status,
    ).toBe(200)
    expect(
      (await t.call('GET', '/me/adult/history', VIEWER)).body.history,
    ).toHaveLength(1)
  })

  it('progress requires access; clearing history keeps orders and ledger', async () => {
    const id = await publishVideo('ppv_required')
    expect(
      (
        await t.call('POST', `/views/videos/${id}/progress`, VIEWER, {
          positionMs: 1000,
        })
      ).status,
    ).toBe(403)
    const {body: o} = await t.call('POST', '/creator/offers', CREATOR, {
      resourceType: 'video',
      resourceId: id,
      kind: 'purchase',
      priceMinor: 1990,
      currency: 'BRL',
    })
    await t.buy(VIEWER, o.offerId)
    await t.call('POST', `/views/videos/${id}/progress`, VIEWER, {
      positionMs: 1000,
      durationMs: 3000,
    })
    expect((await t.call('DELETE', '/me/adult/history', VIEWER)).status).toBe(
      200,
    )
    expect(
      (await t.call('GET', '/me/adult/history', VIEWER)).body.history,
    ).toHaveLength(0)
    expect(await t.db.query(`select * from orders`)).toHaveLength(1)
    expect(
      (await t.db.query(`select * from ledger_entries`)).length,
    ).toBeGreaterThan(0)
  })
})

describe('E2E: creator publishes PPV video', () => {
  it('preview -> denied -> order -> mock payment -> entitlement -> playback -> history', async () => {
    const preview = await t.upload(
      CREATOR,
      'video',
      'preview',
      'video/mp4',
      f.preview,
    )
    const poster = await t.upload(
      CREATOR,
      'image',
      'poster',
      'image/png',
      f.poster,
    )
    const id = await publishVideo('ppv_required', {
      previewAssetId: preview.assetId,
      posterAssetId: poster.assetId,
    })
    const {body: o} = await t.call('POST', '/creator/offers', CREATOR, {
      resourceType: 'video',
      resourceId: id,
      kind: 'ppv',
      priceMinor: 2990,
      currency: 'BRL',
      accessHours: 48,
    })

    const feed = await t.call('GET', '/views/feed', VIEWER)
    const item = feed.body.videos.find((v: any) => v.id === id)
    expect(item).toMatchObject({hasPreview: true, accessPolicy: 'ppv_required'})
    expect((await t.fetch(item.posterUrl)).status).toBe(200)

    const detail = await t.call('GET', `/views/videos/${id}`, VIEWER)
    expect(detail.body.access).toEqual({
      allowed: false,
      reason: 'purchase_required',
    })
    expect(detail.body.offers[0]).toMatchObject({
      kind: 'ppv',
      priceMinor: '2990',
    })
    expect((await play(VIEWER, id)).status).toBe(403)

    const {result} = await t.buy(VIEWER, o.offerId)
    expect(result.result).toBe('applied')
    const p = await play(VIEWER, id)
    expect(p.status).toBe(200)
    expect((await t.fetch(p.body.url)).status).toBe(200)
    await t.call('POST', `/views/videos/${id}/progress`, VIEWER, {
      positionMs: 2000,
      durationMs: 3000,
    })
    const [row] = await t.db.query(
      `select * from adult_watch_progress where user_did = $1`,
      [VIEWER],
    )
    expect(row).toMatchObject({
      resource_type: 'video',
      resource_id: id,
      position_ms: 2000,
    })
    expect(
      (
        await t.call('GET', '/views/feed?section=purchased', VIEWER)
      ).body.videos.map((v: any) => v.id),
    ).toEqual([id])
  })
})
