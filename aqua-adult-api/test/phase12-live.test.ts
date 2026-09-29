import {execFile, execFileSync} from 'node:child_process'
import {mkdtempSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {beforeAll, beforeEach, describe, expect, it} from 'vitest'

import {checkAccess} from '../src/entitlements/index.js'
import {createTestApp, did, type TestApp} from './helpers.js'
import {fixtures} from './media-fixtures.js'

const require = createRequire(import.meta.url)
const ffmpeg: string = require('ffmpeg-static')

const HOST = did('livehost')
const VIEWER = did('liveviewer')
const OTHER = did('liveother')
const MOD = did('livemod')

let t: TestApp
let hls: {playlist: string; segments: {name: string; data: Buffer}[]}

/** Real HLS output (as an encoder would push it), generated once. */
beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'aqua-live-'))
  const src = join(dir, 'src.mp4')
  writeFileSync(src, fixtures().video)
  execFileSync(ffmpeg, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    src,
    '-c',
    'copy',
    '-f',
    'hls',
    '-hls_time',
    '1',
    '-hls_playlist_type',
    'event',
    join(dir, 'index.m3u8'),
  ])
  hls = {
    playlist: readFileSync(join(dir, 'index.m3u8'), 'utf8'),
    segments: readdirSync(dir)
      .filter(f => f.endsWith('.ts'))
      .map(name => ({name, data: readFileSync(join(dir, name))})),
  }
})

beforeEach(async () => {
  t = await createTestApp()
  await t.approvedCreator(HOST, 'live.host')
  for (const d of [VIEWER, OTHER, MOD]) await t.verifiedUser(d)
})

async function createLive(
  policy = 'free',
  extra: Record<string, unknown> = {},
) {
  const r = await t.call('POST', '/live', HOST, {
    title: 'Ao vivo',
    accessPolicy: policy,
    ...extra,
  })
  expect(r.status).toBe(200)
  return r.body as {streamId: string; streamKey: string; ingestUrl: string}
}

async function push(key: string, files = hls) {
  for (const seg of files.segments) {
    const r = await t.app.inject({
      method: 'PUT',
      url: `/live/ingest/${key}/${seg.name}`,
      headers: {'content-type': 'video/mp2t'},
      payload: seg.data,
    })
    if (r.statusCode !== 200) return r
  }
  return t.app.inject({
    method: 'PUT',
    url: `/live/ingest/${key}/index.m3u8`,
    headers: {'content-type': 'application/vnd.apple.mpegurl'},
    payload: files.playlist,
  })
}

async function goLive(policy = 'free', extra: Record<string, unknown> = {}) {
  const live = await createLive(policy, extra)
  await t.call('POST', `/live/${live.streamId}/start`, HOST, {})
  expect((await push(live.streamKey)).statusCode).toBe(200)
  return live
}

const play = (id: string, who = VIEWER) =>
  t.call('POST', `/live/${id}/playback`, who, {})

describe('lifecycle', () => {
  it('scheduled -> starting -> live (first segment) -> ended', async () => {
    const live = await createLive('free', {
      scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
    })
    let list = (await t.call('GET', '/live', VIEWER)).body
    expect(list.upcoming.map((s: any) => s.id)).toEqual([live.streamId])
    expect((await play(live.streamId)).status).toBe(403)
    // Ingest is refused before the host starts the stream.
    expect((await push(live.streamKey)).statusCode).toBe(409)
    await t.call('POST', `/live/${live.streamId}/start`, HOST, {})
    await push(live.streamKey)
    list = (await t.call('GET', '/live', VIEWER)).body
    expect(list.live[0]).toMatchObject({
      id: live.streamId,
      status: 'LIVE',
      host: '@live.host',
    })
    const p = await play(live.streamId)
    expect(p.status).toBe(200)
    const playlist = await t.fetch(p.body.url)
    expect(playlist.status).toBe(200)
    expect(playlist.headers['cache-control']).toBe('private, no-store')
    const seg = playlist.body.split('\n').find((l: string) => l.endsWith('.ts'))
    const segment = await t.fetch(p.body.url.replace('index.m3u8', seg))
    expect(segment.status).toBe(200)
    expect(segment.headers['content-type']).toBe('video/mp2t')

    await t.call('POST', `/live/${live.streamId}/end`, HOST, {})
    expect((await t.fetch(p.body.url)).status).toBe(403)
    expect((await play(live.streamId)).status).toBe(403)
    expect((await t.call('GET', '/live', VIEWER)).body.live).toHaveLength(0)
  })

  it('creator disconnect -> INTERRUPTED; reconnect -> LIVE again', async () => {
    const live = await goLive()
    await t.db.query(
      `update live_streams set last_segment_at = now() - interval '1 minute' where id = $1`,
      [live.streamId],
    )
    expect(
      (await t.call('GET', `/live/${live.streamId}`, VIEWER)).body.stream
        .status,
    ).toBe('INTERRUPTED')
    await push(live.streamKey)
    expect(
      (await t.call('GET', `/live/${live.streamId}`, VIEWER)).body.stream
        .status,
    ).toBe('LIVE')
    expect((await play(live.streamId)).status).toBe(200)
  })

  it('a real encoder (ffmpeg HTTP PUT) can stream into the API', async () => {
    const live = await createLive()
    await t.call('POST', `/live/${live.streamId}/start`, HOST, {})
    const address = await t.app.listen({port: 0, host: '127.0.0.1'})
    const src = join(mkdtempSync(join(tmpdir(), 'aqua-enc-')), 'in.mp4')
    writeFileSync(src, fixtures().video)
    await new Promise<void>((resolve, reject) =>
      execFile(
        ffmpeg,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          src,
          '-c',
          'copy',
          '-f',
          'hls',
          '-hls_time',
          '1',
          '-method',
          'PUT',
          `${address}${live.ingestUrl}`,
        ],
        err => (err ? reject(err) : resolve()),
      ),
    )
    await t.app.close()
    const [s] = await t.db.query(
      `select status, last_segment_at from live_streams where id = $1`,
      [live.streamId],
    )
    expect(s.status).toBe('LIVE')
    expect(s.last_segment_at).not.toBeNull()
  })
})

describe('stream keys', () => {
  it('are stored hashed, shown once, rotatable, and never appear in responses', async () => {
    const live = await goLive()
    const [row] = await t.db.query(`select stream_key_hash from live_streams`)
    expect(row.stream_key_hash).not.toContain(live.streamKey)
    expect(row.stream_key_hash).toMatch(/^[0-9a-f]{64}$/)
    const detail = await t.call('GET', `/live/${live.streamId}`, HOST)
    expect(JSON.stringify(detail.body)).not.toContain(live.streamKey)
    const rotated = await t.call(
      'POST',
      `/live/${live.streamId}/rotate-key`,
      HOST,
      {},
    )
    expect((await push(live.streamKey)).statusCode).toBe(403)
    expect((await push(rotated.body.streamKey)).statusCode).toBe(200)
    expect(
      (await t.call('POST', `/live/${live.streamId}/rotate-key`, VIEWER, {}))
        .status,
    ).toBe(403)
    expect((await push('lk_notarealkeyatall1234567890')).statusCode).toBe(403)
  })

  it('rejects unsafe ingest file names', async () => {
    const live = await createLive()
    await t.call('POST', `/live/${live.streamId}/start`, HOST, {})
    const r = await t.app.inject({
      method: 'PUT',
      url: `/live/ingest/${live.streamKey}/..%2F..%2Fescape.ts`,
      payload: 'x',
    })
    expect(r.statusCode).toBe(400)
  })
})

describe('access', () => {
  it('subscriber-only lives open only for subscribers', async () => {
    const tier = await t.call('POST', '/creator/tiers', HOST, {
      name: 'Fã',
      priceMinor: 990,
      currency: 'BRL',
      billingPeriod: 'month',
    })
    const live = await goLive('subscriber_only')
    expect((await play(live.streamId)).body).toEqual({error: 'not_subscribed'})
    await t.buy(VIEWER, tier.body.offerId)
    expect((await play(live.streamId)).status).toBe(200)
  })

  it('PPV live: order -> event entitlement -> access; expired access is denied', async () => {
    const live = await goLive('ppv_required')
    const offer = await t.call('POST', '/creator/offers', HOST, {
      resourceType: 'live',
      resourceId: live.streamId,
      kind: 'ppv',
      priceMinor: 1500,
      currency: 'BRL',
      accessHours: 3,
    })
    expect((await play(live.streamId)).body).toEqual({
      error: 'purchase_required',
    })
    await t.buy(VIEWER, offer.body.offerId)
    const p = await play(live.streamId)
    expect(p.status).toBe(200)
    const later = await checkAccess(
      t.db,
      VIEWER,
      {type: 'live', id: live.streamId},
      new Date(Date.now() + 4 * 3600_000),
    )
    expect(later.decision.allowed).toBe(false)
    await t.db.query(
      `update entitlements set expires_at = now() - interval '1 second'`,
    )
    expect((await t.fetch(p.body.url)).status).toBe(403)
  })

  it('unauthorized access: anonymous, unverified, forged or wrong-stream tokens', async () => {
    const live = await goLive()
    expect(
      (await t.call('POST', `/live/${live.streamId}/playback`)).status,
    ).toBe(401)
    expect((await play(live.streamId, did('noage'))).status).toBe(403)
    const p = await play(live.streamId)
    const tampered = p.body.url.replace(
      /\/live-stream\/([^.]+)\./,
      '/live-stream/$1x.',
    )
    expect((await t.fetch(tampered)).status).toBe(403)
    expect(
      (await t.fetch(p.body.url.replace('index.m3u8', '..%2F..%2Fsecret.ts')))
        .status,
    ).not.toBe(200)
  })

  it('quarantined/removed lives stop distribution and disappear', async () => {
    const live = await goLive()
    const p = await play(live.streamId)
    await t.db.query(
      `update live_streams set status = 'QUARANTINED' where id = $1`,
      [live.streamId],
    )
    expect((await t.fetch(p.body.url)).status).toBe(403)
    expect((await t.call('GET', `/live/${live.streamId}`, VIEWER)).status).toBe(
      404,
    )
    expect((await push(live.streamKey)).statusCode).toBe(409)
  })
})

describe('viewers and chat', () => {
  it('viewer count = distinct authorized users with a recent heartbeat', async () => {
    const live = await goLive()
    await t.call('POST', `/live/${live.streamId}/heartbeat`, VIEWER, {})
    await t.call('POST', `/live/${live.streamId}/heartbeat`, VIEWER, {}) // second tab
    const r = await t.call(
      'POST',
      `/live/${live.streamId}/heartbeat`,
      OTHER,
      {},
    )
    expect(r.body.viewerCount).toBe(2)
    // Segment requests never count.
    const p = await play(live.streamId)
    for (let i = 0; i < 5; i++) await t.fetch(p.body.url)
    expect(
      (await t.call('GET', `/live/${live.streamId}`, VIEWER)).body.viewerCount,
    ).toBe(2)
    // Logged out / gone: sessions age out of the window.
    await t.db.query(
      `update live_viewer_sessions set last_seen = now() - interval '1 minute' where user_did = $1`,
      [OTHER],
    )
    expect(
      (await t.call('GET', `/live/${live.streamId}`, VIEWER)).body.viewerCount,
    ).toBe(1)
    expect(
      (await t.call('POST', `/live/${live.streamId}/heartbeat`)).status,
    ).toBe(401)
  })

  it('chat: plain text, slow mode, mute, moderators, deletion', async () => {
    const live = await goLive()
    const send = (who: string, body: string) =>
      t.call('POST', `/live/${live.streamId}/chat`, who, {body})
    expect((await send(VIEWER, 'oi‮<script>')).status).toBe(200)
    const msgs = (await t.call('GET', `/live/${live.streamId}/chat`, OTHER))
      .body.messages
    expect(msgs[0].body).toBe('oi<script>')
    expect(msgs[0]).not.toHaveProperty('handle')

    await t.call('PATCH', `/live/${live.streamId}/chat-settings`, HOST, {
      slowModeSeconds: 30,
    })
    expect((await send(VIEWER, 'de novo')).status).toBe(429)
    expect((await send(HOST, 'host ignora slow mode')).status).toBe(200)

    expect(
      (
        await t.call('POST', `/live/${live.streamId}/bans`, MOD, {
          did: OTHER,
          kind: 'mute',
        })
      ).status,
    ).toBe(403)
    await t.call('POST', `/live/${live.streamId}/moderators`, HOST, {did: MOD})
    expect(
      (
        await t.call('POST', `/live/${live.streamId}/bans`, MOD, {
          did: OTHER,
          kind: 'mute',
          minutes: 10,
        })
      ).status,
    ).toBe(200)
    expect((await send(OTHER, 'silenciado')).body).toEqual({error: 'muted'})
    expect(
      (
        await t.call('POST', `/live/${live.streamId}/bans`, MOD, {
          did: HOST,
          kind: 'block',
        })
      ).status,
    ).toBe(403)
    await t.call('DELETE', `/live/${live.streamId}/chat/${msgs[0].id}`, MOD)
    expect(
      (
        await t.call('GET', `/live/${live.streamId}/chat`, OTHER)
      ).body.messages.map((m: any) => m.id),
    ).not.toContain(msgs[0].id)
  })

  it('block removes access to the stream, including an existing playback URL', async () => {
    const live = await goLive()
    const p = await play(live.streamId, OTHER)
    await t.call('POST', `/live/${live.streamId}/bans`, HOST, {
      did: OTHER,
      kind: 'block',
    })
    expect((await t.fetch(p.body.url)).status).toBe(403)
    expect((await play(live.streamId, OTHER)).body).toEqual({error: 'blocked'})
    expect((await t.call('GET', '/live', OTHER)).body.live).toHaveLength(0)
    expect(
      (await t.call('GET', `/live/${live.streamId}/chat`, OTHER)).status,
    ).toBe(403)
  })

  it('reports use structured reasons and are rate limited', async () => {
    const live = await goLive()
    expect(
      (
        await t.call('POST', `/live/${live.streamId}/report`, VIEWER, {
          reason: 'made_up',
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await t.call('POST', `/live/${live.streamId}/report`, VIEWER, {
          reason: 'harassment',
          details: 'x',
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await t.call('POST', `/live/${live.streamId}/report`, VIEWER, {
          reason: 'spam',
        })
      ).status,
    ).toBe(429)
    expect(await t.db.query(`select reason from live_reports`)).toEqual([
      {reason: 'harassment'},
    ])
  })
})

describe('recording and privacy', () => {
  it('ending with record keeps a replay MediaAsset from the same segments; chat is purged', async () => {
    const live = await goLive()
    await t.call('POST', `/live/${live.streamId}/chat`, VIEWER, {body: 'oi'})
    const end = await t.call('POST', `/live/${live.streamId}/end`, HOST, {
      record: true,
    })
    expect(end.body.recordingAssetId).toMatch(/^ast_/)
    expect(await t.db.query(`select id from live_chat_messages`)).toHaveLength(
      0,
    )
    const video = await t.call('POST', '/creator/videos', HOST, {
      title: 'Replay',
      mediaAssetId: end.body.recordingAssetId,
      accessPolicy: 'free',
      publish: true,
    })
    expect(video.status).toBe(200)
    const p = await t.call(
      'POST',
      `/views/videos/${video.body.videoId}/playback`,
      VIEWER,
      {},
    )
    const playlist = await t.fetch(p.body.url)
    expect(playlist.status).toBe(200)
    expect(playlist.body).toContain('#EXT-X-ENDLIST')
  })

  it('live data never leaves the adult context', async () => {
    const live = await goLive()
    expect((await t.call('GET', '/live', did('unverified'))).status).toBe(403)
    expect(
      (await t.call('GET', `/live/${live.streamId}/chat`, did('unverified')))
        .status,
    ).toBe(403)
    const res = await t.app.inject({
      method: 'GET',
      url: '/live',
      headers: {'x-aqua-dev-did': VIEWER},
    })
    expect(res.headers['cache-control']).toBe('private, no-store')
  })
})
