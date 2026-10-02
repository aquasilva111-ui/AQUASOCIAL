import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { AssetStore } from 'aqua-project/src/index'
import { buildFfmpegArgs, videoDuration, type VideoProject } from 'aqua-runtime/src/index'

export interface RenderOptions {
  /** Path of the ffmpeg binary (default: `ffmpeg` from PATH). Run as a process, never linked. */
  ffmpeg?: string
  /** Kill ffmpeg after this long. */
  timeoutMs?: number
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

/** Validates the project shape before it reaches ffmpeg (the project comes over the network). */
export function validateProject(p: VideoProject, maxDurationSec: number): void {
  const num = (n: unknown) => typeof n === 'number' && Number.isFinite(n)
  if (!p || !Array.isArray(p.clips) || !Array.isArray(p.audioTracks)) throw new RenderError('Malformed project', 400)
  if (!p.clips.length) throw new RenderError('Video has no clips', 400)
  if (p.clips.length > MAX_CLIPS || p.audioTracks.length > MAX_CLIPS) throw new RenderError('Too many clips', 400)
  if (![p.width, p.height, p.fps].every(num) || p.width < 16 || p.height < 16 || p.width > 4096 || p.height > 4096 || p.fps < 1 || p.fps > 60) throw new RenderError('Invalid canvas', 400)
  for (const c of p.clips) if (!num(c.in) || !num(c.out) || c.in < 0 || c.out <= c.in || typeof c.asset !== 'string') throw new RenderError('Invalid clip', 400)
  for (const t of p.audioTracks) if (!num(t.start) || !num(t.gainDb) || t.start < 0 || typeof t.asset !== 'string') throw new RenderError('Invalid audio track', 400)
  if (videoDuration(p) > maxDurationSec) throw new RenderError(`Longer than ${maxDurationSec}s`, 422)
}

/** Writes each referenced asset to a temp file, runs ffmpeg, returns the MP4 bytes. Always cleans up. */
export async function renderVideo(project: VideoProject, store: AssetStore, opts: RenderOptions = {}): Promise<Uint8Array> {
  validateProject(project, opts.maxDurationSec ?? 600)
  const dir = await mkdtemp(join(tmpdir(), 'aqua-render-'))
  try {
    const inputs: Record<string, string> = {}
    const hashes = new Set([...project.clips.map((c) => c.asset), ...project.audioTracks.map((t) => t.asset)])
    for (const hash of hashes) {
      const blob = await store.get(hash)
      if (!blob) throw new RenderError(`Missing asset ${hash}`, 422)
      const path = join(dir, `in-${hash.slice(0, 16)}`) // fixed name: never a user-controlled path
      await writeFile(path, blob.bytes)
      inputs[hash] = path
    }
    const out = join(dir, 'out.mp4')
    await run(opts.ffmpeg ?? 'ffmpeg', buildFfmpegArgs(project, inputs, out), opts.timeoutMs ?? 10 * 60_000)
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
