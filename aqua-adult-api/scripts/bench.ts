// Rough latency check with 500 seeded videos: AQUA_ENV=test npx tsx scripts/bench.ts

import {createTestApp, did} from '../test/helpers.js'

const t = await createTestApp()
const C = did('benchcreator')
const V = did('benchviewer')
const creatorId = await t.approvedCreator(C, 'bench.creator')
await t.verifiedUser(V)
// 500 published videos with READY media (rows only; no encoding needed).
for (let i = 0; i < 500; i++) {
  const a = `ast_bench_${i}`
  await t.db.query(
    `insert into media_assets (id, owner_did, kind, status, storage_key, mime_type, declared_size_bytes, duration_ms)
     values ($1, $2, 'video', 'READY', $3, 'video/mp4', 1000, 3000)`,
    [a, C, `assets/${a}/source`],
  )
  await t.db.query(
    `insert into media_variants (id, asset_id, kind, storage_prefix, entry_file, mime_type) values ($1, $2, 'hls', $3, 'master.m3u8', 'application/vnd.apple.mpegurl')`,
    [`var_${i}`, a, `assets/${a}/hls`],
  )
  await t.db.query(
    `insert into videos (id, creator_id, media_asset_id, title, category, access_policy, status, published_at, view_count)
     values ($1, $2, $3, $4, 'solo', $5, 'published', now() - make_interval(mins => $6::int), $6::int)`,
    [
      `vid_bench_${i}`,
      creatorId,
      a,
      `Video ${i}`,
      i % 3 ? 'free' : 'subscriber_only',
      i,
    ],
  )
  if (i % 5 === 0)
    await t.db.query(
      `insert into view_events (user_did, resource_type, resource_id, window_start) values ($1, 'video', $2, now())`,
      [V, `vid_bench_${i}`],
    )
}
const routes: [string, string, string][] = [
  ['GET', '/views/feed', V],
  ['GET', '/views/feed?category=solo', V],
  ['GET', '/views/videos/vid_bench_10', V],
  ['GET', '/views/videos/vid_bench_10/related', V],
  ['POST', '/views/videos/vid_bench_10/playback', V],
  ['GET', '/me/library', V],
  ['GET', '/studios', V],
  ['GET', '/live', V],
  ['GET', '/dashboard/creator', C],
  ['GET', '/dashboard/creator/content', C],
  ['GET', '/dashboard/creator/analytics', C],
  ['GET', '/dashboard/creator/revenue', C],
]
for (const [m, url, who] of routes) {
  const times: number[] = []
  for (let i = 0; i < 15; i++) {
    const s = performance.now()
    const r = await t.call(m as any, url, who, m === 'POST' ? {} : undefined)
    times.push(performance.now() - s)
    if (r.status >= 400) {
      console.log(url, r.status, r.body)
      break
    }
  }
  times.sort((x, y) => x - y)
  console.log(
    `${m} ${url}`.padEnd(46),
    `p50 ${times[Math.floor(times.length / 2)].toFixed(1)}ms`,
    `p95 ${times[Math.floor(times.length * 0.95)].toFixed(1)}ms`,
  )
}
process.exit(0)
