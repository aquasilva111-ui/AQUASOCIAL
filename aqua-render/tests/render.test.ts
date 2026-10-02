import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { MemoryAssetStore, sha256Hex } from 'aqua-project/src/index'
import { defaultVideo, type VideoProject } from 'aqua-runtime/src/index'

import { RenderError, renderVideo, validateProject } from '../src/render'
import { createRenderServer } from '../src/server'

// No real ffmpeg on the dev machine: a stand-in script that records its arguments and writes the
// output file. It proves the plumbing (temp files, process, cleanup, HTTP); it does NOT prove the
// filter graph is valid for real ffmpeg.
async function fakeFfmpeg(exit = 0) {
  const dir = await mkdtemp(join(tmpdir(), 'fake-ff-'))
  const bin = join(dir, 'ffmpeg')
  const log = join(dir, 'args.txt')
  await writeFile(bin, `#!/bin/sh\nprintf '%s\\n' "$@" > '${log}'\nfor last; do :; done\n[ ${exit} -eq 0 ] && printf 'MP4DATA' > "$last"\n[ ${exit} -ne 0 ] && echo 'boom' >&2\nexit ${exit}\n`)
  await chmod(bin, 0o755)
  return { bin, log }
}

async function project(store: MemoryAssetStore): Promise<VideoProject> {
  const ref = await store.put(new TextEncoder().encode('video-bytes'), 'video/mp4')
  const p = defaultVideo('t')
  p.clips.push({ id: 'c1', asset: ref.hash, in: 0, out: 3, audio: true })
  return p
}

test('renderVideo writes inputs, runs the binary, returns output and cleans up', async () => {
  const store = new MemoryAssetStore()
  const p = await project(store)
  const ff = await fakeFfmpeg()
  const out = await renderVideo(p, store, { ffmpeg: ff.bin })
  assert.equal(new TextDecoder().decode(out), 'MP4DATA')
  const args = (await readFile(ff.log, 'utf8')).split('\n')
  assert.ok(args.includes('-filter_complex') && args.includes('libx264'))
  const inPath = args[args.indexOf('-i') + 1]
  assert.ok(inPath.includes('aqua-render-'))
  await assert.rejects(() => readFile(inPath)) // temp dir removed
})

test('failures: ffmpeg error, missing asset, invalid or too long project', async () => {
  const store = new MemoryAssetStore()
  const p = await project(store)
  const bad = (await fakeFfmpeg(1)).bin
  const good = (await fakeFfmpeg()).bin
  await assert.rejects(() => renderVideo(p, store, { ffmpeg: bad }), /ffmpeg failed \(1\).*boom/)
  await assert.rejects(() => renderVideo(p, new MemoryAssetStore(), { ffmpeg: good }), /Missing asset/)
  await assert.rejects(() => renderVideo(p, store, { ffmpeg: '/nonexistent/ffmpeg' }), /Cannot run ffmpeg/)
  assert.throws(() => validateProject({ ...p, clips: [] }, 600), RenderError)
  assert.throws(() => validateProject({ ...p, width: 99999 }, 600), /Invalid canvas/)
  assert.throws(() => validateProject({ ...p, clips: [{ ...p.clips[0], out: 9999 }] }, 600), /Longer than/)
  assert.throws(() => validateProject({ ...p, clips: [{ ...p.clips[0], in: 5, out: 1 }] }, 600), /Invalid clip/)
})

test('http: token required, assets verified by hash, render returns video/mp4, busy returns 429', async () => {
  const token = 'a'.repeat(24)
  const ff = await fakeFfmpeg()
  const store = new MemoryAssetStore()
  const server = createRenderServer({ token, store, ffmpeg: ff.bin, concurrency: 1 })
  await new Promise<void>((r) => server.listen(0, r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const auth = { authorization: `Bearer ${token}` }
  try {
    assert.equal((await fetch(`${base}/render`, { method: 'POST', body: '{}' })).status, 401)
    assert.equal((await fetch(`${base}/render`, { method: 'POST', body: '{}', headers: { authorization: 'Bearer nope' } })).status, 401)

    const bytes = new TextEncoder().encode('video-bytes')
    const hash = await sha256Hex(bytes)
    assert.equal((await fetch(`${base}/assets/${'0'.repeat(64)}`, { method: 'PUT', body: bytes, headers: auth })).status, 400)
    assert.equal((await fetch(`${base}/assets/${hash}`, { method: 'PUT', body: bytes, headers: auth })).status, 204)

    const p = defaultVideo('t')
    p.clips.push({ id: 'c', asset: hash, in: 0, out: 2, audio: false })
    const r = await fetch(`${base}/render`, { method: 'POST', body: JSON.stringify(p), headers: auth })
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('content-type'), 'video/mp4')
    assert.equal(await r.text(), 'MP4DATA')

    assert.equal((await fetch(`${base}/render`, { method: 'POST', body: 'not json', headers: auth })).status, 400)
    assert.equal((await fetch(`${base}/nope`, { headers: auth })).status, 404)
  } finally {
    server.close()
  }
  assert.throws(() => createRenderServer({ token: 'short' }), /token/)
})

test('cors: only listed origins get headers; preflight needs no token; others are refused', async () => {
  const server = createRenderServer({ token: 'b'.repeat(24), allowedOrigins: ['https://create.example'] })
  await new Promise<void>((r) => server.listen(0, r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    const ok = await fetch(`${base}/render`, { method: 'OPTIONS', headers: { origin: 'https://create.example' } })
    assert.equal(ok.status, 204)
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://create.example')
    assert.equal((await fetch(`${base}/render`, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } })).status, 403)
    const noAuth = await fetch(`${base}/render`, { method: 'POST', body: '{}', headers: { origin: 'https://create.example' } })
    assert.equal(noAuth.status, 401)
    assert.equal(noAuth.headers.get('access-control-allow-origin'), 'https://create.example') // browser can read the 401
  } finally {
    server.close()
  }
})
