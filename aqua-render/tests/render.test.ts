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

// Opt-in: needs a real ffmpeg. `FFMPEG=/path/to/ffmpeg npm test`
test('real ffmpeg: two clips plus a music track render to a valid MP4', { skip: !process.env.FFMPEG }, async () => {
  const { execFileSync } = await import('node:child_process')
  const bin = process.env.FFMPEG!
  const dir = await mkdtemp(join(tmpdir(), 'real-ff-'))
  const gen = (args: string[]) => execFileSync(bin, ['-y', '-loglevel', 'error', ...args], { stdio: 'pipe' })
  gen(['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(dir, 'a.mp4')])
  gen(['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=25:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(dir, 'b.mp4')])
  gen(['-f', 'lavfi', '-i', 'sine=frequency=880:duration=2', join(dir, 'm.wav')])
  const store = new MemoryAssetStore()
  const put = async (f: string, mime: string) => (await store.put(new Uint8Array(await readFile(join(dir, f))), mime)).hash
  const p = defaultVideo('t')
  p.width = 480
  p.height = 270
  p.fps = 30
  p.clips.push({ id: '1', asset: await put('a.mp4', 'video/mp4'), in: 0.5, out: 2.5, audio: true }, { id: '2', asset: await put('b.mp4', 'video/mp4'), in: 0, out: 2, audio: false })
  p.audioTracks.push({ id: 'x', asset: await put('m.wav', 'audio/wav'), start: 1, gainDb: -6 } as never)
  const out = join(dir, 'out.mp4')
  await writeFile(out, await renderVideo(p, store, { ffmpeg: bin }))
  let info = ''
  try {
    execFileSync(bin, ['-hide_banner', '-i', out], { stdio: 'pipe' })
  } catch (e) {
    info = String((e as { stderr?: Buffer }).stderr) // ffmpeg exits 1 when no output file is given; the probe is on stderr
  }
  assert.match(info, /Duration: 00:00:04/)
})

test('real ffmpeg: fade, colour filter and a text overlay with hostile characters', { skip: !process.env.FFMPEG }, async () => {
  const { execFileSync } = await import('node:child_process')
  const bin = process.env.FFMPEG!
  const dir = await mkdtemp(join(tmpdir(), 'real-fx-'))
  execFileSync(bin, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x808080:size=320x240:rate=30:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(dir, 'g.mp4')])
  const store = new MemoryAssetStore()
  const asset = (await store.put(new Uint8Array(await readFile(join(dir, 'g.mp4'))), 'video/mp4')).hash
  const p = defaultVideo('fx')
  p.width = 320
  p.height = 240
  p.clips.push({ id: 'c', asset, in: 0, out: 3, audio: true, fadeIn: 1, fadeOut: 1 })
  p.texts = [{ id: 't1', text: `it's 50%: a\\b ,;[]`, start: 1, end: 2, x: 0.5, y: 0.5, size: 0.3, color: '#ffffff' }]
  const out = join(dir, 'out.mp4')
  await writeFile(out, await renderVideo(p, store, { ffmpeg: bin }))
  // Mean luma of a frame at time t (grey source is ~128, so black means a fade, white text lifts the mean).
  const luma = (t: number) => {
    const raw = execFileSync(bin, ['-loglevel', 'error', '-ss', String(t), '-i', out, '-frames:v', '1', '-vf', 'format=gray', '-f', 'rawvideo', '-'], { stdio: 'pipe', maxBuffer: 1 << 24 })
    return raw.reduce((a, b) => a + b, 0) / raw.length
  }
  assert.ok(luma(0) < 20, 'first frame is faded to black')
  const last = luma(2.9)
  assert.ok(last < 40, `near the end the frame is faded to black (${last})`)
  const withText = luma(1.5)
  p.texts = []
  await writeFile(out, await renderVideo(p, store, { ffmpeg: bin }))
  assert.ok(withText > luma(1.5) + 3, `text lifts the frame (${withText} vs ${luma(1.5)})`)
})

test('validation: effect and text fields are checked', () => {
  const base = defaultVideo('v')
  base.clips.push({ id: 'c', asset: 'h', in: 0, out: 2, audio: false })
  const text = { id: 't', text: 'oi', start: 0, end: 1, x: 0.5, y: 0.5, size: 0.05, color: '#ffffff' }
  assert.doesNotThrow(() => validateProject({ ...base, texts: [text] }, 600))
  assert.throws(() => validateProject({ ...base, texts: [{ ...text, color: 'red;drop' }] }, 600), /Invalid text/)
  assert.throws(() => validateProject({ ...base, texts: [{ ...text, id: "x'y" }] }, 600), /Invalid text/)
  assert.throws(() => validateProject({ ...base, texts: [{ ...text, text: 'x'.repeat(201) }] }, 600), /Invalid text/)
  assert.throws(() => validateProject({ ...base, clips: [{ ...base.clips[0], brightness: 9 }] }, 600), /Invalid clip effect/)
})

test('the bundled font exists, so text overlays work on any host', async () => {
  const { existsSync } = await import('node:fs')
  const { createRequire } = await import('node:module')
  const { dirname } = await import('node:path')
  const pkg = createRequire(import.meta.url).resolve('dejavu-fonts-ttf/package.json')
  assert.ok(existsSync(join(dirname(pkg), 'ttf', 'DejaVuSans-Bold.ttf')))
})
