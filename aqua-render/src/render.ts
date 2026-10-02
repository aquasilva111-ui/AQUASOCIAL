import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import type { AssetStore } from 'aqua-project/src/index'
import { buildFfmpegArgs, videoDuration, type VideoProject } from 'aqua-runtime/src/index'

export interface RenderOptions {
  /** Path of the ffmpeg binary (default: `ffmpeg` from PATH). Run as a process, never linked. */
  ffmpeg?: string
  /** Kill ffmpeg after this long. */
  timeoutMs?: number
  /** TrueType font for text overlays (default: the bundled DejaVu Sans Bold). */
  fontFile?: string
  /** Refuse longer projects (seconds). */
  maxDurationSec?: number
}

export class RenderError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 422 | 500 | 504 = 422
  ) {
    super(message)
  }
}

const MAX_CLIPS = 200
/** DejaVu Sans Bold ships with this package (free licence), so text overlays never depend on the host's fonts. */
function bundledFont(): string | undefined {
  try {
    return join(dirname(createRequire(import.meta.url).resolve('dejavu-fonts-ttf/package.json')), 'ttf', 'DejaVuSans-Bold.ttf')
  } catch {
    return undefined
  }
}
const FONTS = [bundledFont(), '/System/Library/Fonts/Supplemental/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].filter(Boolean) as string[]
const findFont = () => FONTS.find((f) => existsSync(f))

/** Validates the project shape before it reaches ffmpeg (the project comes over the network). */
export function validateProject(p: VideoProject, maxDurationSec: number): void {
  const num = (n: unknown) => typeof n === 'number' && Number.isFinite(n)
  if (!p || !Array.isArray(p.clips) || !Array.isArray(p.audioTracks)) throw new RenderError('Malformed project', 400)
  if (!p.clips.length) throw new RenderError('Video has no clips', 400)
  if (p.clips.length > MAX_CLIPS || p.audioTracks.length > MAX_CLIPS) throw new RenderError('Too many clips', 400)
  if (![p.width, p.height, p.fps].every(num) || p.width < 16 || p.height < 16 || p.width > 4096 || p.height > 4096 || p.fps < 1 || p.fps > 60) throw new RenderError('Invalid canvas', 400)
  for (const c of p.clips) if (!num(c.in) || !num(c.out) || c.in < 0 || c.out <= c.in || typeof c.asset !== 'string') throw new RenderError('Invalid clip', 400)
  const inRange = (v: unknown, lo: number, hi: number) => v === undefined || (num(v) && (v as number) >= lo && (v as number) <= hi)
  for (const c of p.clips)
    if (![c.fadeIn, c.fadeOut].every((v) => inRange(v, 0, 10)) || !inRange(c.brightness, -1, 1) || !inRange(c.contrast, 0, 2) || !inRange(c.saturation, 0, 3)) throw new RenderError('Invalid clip effect', 400)
  for (const c of p.clips) if (!inRange(c.speed, 0.25, 4)) throw new RenderError('Invalid clip speed', 400)
  const keys = (k: unknown, lo: number, hi: number) =>
    k === undefined || (Array.isArray(k) && k.length <= 30 && k.every((x) => x && num(x.t) && num(x.v) && x.t >= 0 && x.t <= 36000 && x.v >= lo && x.v <= hi))
  const overlays = p.overlays ?? []
  if (!Array.isArray(overlays) || overlays.length > 10) throw new RenderError('Too many overlays', 400)
  for (const o of overlays) {
    const ok = typeof o.id === 'string' && typeof o.asset === 'string' && [o.in, o.out, o.start, o.x, o.y, o.scale].every(num) && o.in >= 0 && o.out > o.in && o.start >= 0 && o.x >= 0 && o.x <= 1 && o.y >= 0 && o.y <= 1 && o.scale >= 0.05 && o.scale <= 1 && keys(o.anim?.x, 0, 1) && keys(o.anim?.y, 0, 1)
    if (!ok) throw new RenderError('Invalid overlay', 400)
  }
  const texts = p.texts ?? []
  if (!Array.isArray(texts) || texts.length > 200) throw new RenderError('Too many texts', 400)
  for (const t of texts) {
    const ok = typeof t.id === 'string' && /^[\w-]{1,40}$/.test(t.id) && typeof t.text === 'string' && t.text.length > 0 && t.text.length <= 200 && typeof t.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(t.color)
    if (!ok || ![t.start, t.end, t.x, t.y, t.size].every(num) || t.start < 0 || t.end <= t.start || t.x < 0 || t.x > 1 || t.y < 0 || t.y > 1 || t.size < 0.01 || t.size > 0.3 || !keys(t.anim?.x, 0, 1) || !keys(t.anim?.y, 0, 1) || !keys(t.anim?.opacity, 0, 1)) throw new RenderError('Invalid text', 400)
  }
  for (const t of p.audioTracks) if (!num(t.start) || !num(t.gainDb) || t.start < 0 || typeof t.asset !== 'string') throw new RenderError('Invalid audio track', 400)
  if (videoDuration(p) > maxDurationSec) throw new RenderError(`Longer than ${maxDurationSec}s`, 422)
}

/** Writes each referenced asset to a temp file, runs ffmpeg, returns the MP4 bytes. Always cleans up. */
export async function renderVideo(project: VideoProject, store: AssetStore, opts: RenderOptions = {}): Promise<Uint8Array> {
  validateProject(project, opts.maxDurationSec ?? 600)
  const dir = await mkdtemp(join(tmpdir(), 'aqua-render-'))
  try {
    const inputs: Record<string, string> = {}
    const hashes = new Set([...project.clips.map((c) => c.asset), ...(project.overlays ?? []).map((o) => o.asset), ...project.audioTracks.map((t) => t.asset)])
    for (const hash of hashes) {
      const blob = await store.get(hash)
      if (!blob) throw new RenderError(`Missing asset ${hash}`, 422)
      const path = join(dir, `in-${hash.slice(0, 16)}`) // fixed name: never a user-controlled path
      await writeFile(path, blob.bytes)
      inputs[hash] = path
    }
    const out = join(dir, 'out.mp4')
    const textFiles: Record<string, string> = {}
    for (const [n, t] of (project.texts ?? []).entries()) {
      textFiles[t.id] = join(dir, `text-${n}.txt`) // fixed name; the text itself never enters the filter string
      await writeFile(textFiles[t.id], t.text)
    }
    const fontFile = opts.fontFile ?? findFont()
    if (project.texts?.length && !fontFile) throw new RenderError('No usable font for text overlays', 500)
    await run(opts.ffmpeg ?? 'ffmpeg', buildFfmpegArgs(project, inputs, out, { fontFile, textFiles }), opts.timeoutMs ?? 10 * 60_000)
    return new Uint8Array(await readFile(out))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function run(bin: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    child.stderr.on('data', (d) => (err = (err + d).slice(-2000)))
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new RenderError('Render timed out', 504))
    }, timeoutMs)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(new RenderError(`Cannot run ffmpeg: ${e.message}`, 500))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      code === 0 ? resolve() : reject(new RenderError(`ffmpeg failed (${code}): ${err.trim().split('\n').slice(-3).join(' | ')}`, 422))
    })
  })
}
