import type { ToolAdapter } from '../types'
import { jsonSession, parseJson, type JsonSession } from './json'

/**
 * Video project model. Clips reference AQUA Assets by hash and are trimmed non-destructively.
 * Rendering is a server job: `buildFfmpegArgs` turns the project into an ffmpeg command line
 * (ffmpeg runs as a separate process on the server; nothing GPL is linked into or shipped with
 * the app). The browser/native UI only edits this model and previews it.
 */
export interface VideoClip {
  id: string
  /** Asset hash of the source file. */
  asset: string
  /** Seconds inside the source. */
  in: number
  out: number
  /** Whether the clip's own audio is kept. */
  audio: boolean
}

export interface VideoAudioTrack {
  id: string
  asset: string
  /** Seconds on the timeline where it starts. */
  start: number
  gainDb: number
}

export interface VideoProject {
  title: string
  width: number
  height: number
  fps: number
  /** Main track: clips play one after another. */
  clips: VideoClip[]
  /** Extra audio (music, voice-over) mixed under the main track. */
  audioTracks: VideoAudioTrack[]
}

export type VideoSession = JsonSession<VideoProject> & {
  addClip(asset: string, durationSec: number): string
  trim(clipId: string, inSec: number, outSec: number): void
  moveClip(clipId: string, toIndex: number): void
  removeClip(clipId: string): void
  addAudio(asset: string, start?: number, gainDb?: number): string
  duration(): number
}

export const defaultVideo = (title: string): VideoProject => ({ title, width: 1080, height: 1920, fps: 30, clips: [], audioTracks: [] })

export const videoDuration = (p: VideoProject) => p.clips.reduce((t, c) => t + (c.out - c.in), 0)

const num = (n: number) => +n.toFixed(3)

/**
 * ffmpeg arguments for the project. `inputs` maps asset hash -> file path on the render server.
 * Each clip is trimmed, scaled to fit and padded to the canvas, then concatenated. Audio tracks
 * are delayed, gained and mixed with the clips' own audio. Silent clips get generated silence so
 * concat always has matching streams.
 */
export function buildFfmpegArgs(p: VideoProject, inputs: Record<string, string>, output: string): string[] {
  if (!p.clips.length) throw new Error('Video has no clips')
  const files: string[] = []
  const idx = (hash: string) => {
    const path = inputs[hash]
    if (!path) throw new Error(`No file for asset ${hash}`)
    let i = files.indexOf(path)
    if (i < 0) i = files.push(path) - 1
    return i
  }

  const f: string[] = []
  p.clips.forEach((c, n) => {
    const i = idx(c.asset)
    const len = num(c.out - c.in)
    f.push(`[${i}:v]trim=start=${num(c.in)}:end=${num(c.out)},setpts=PTS-STARTPTS,fps=${p.fps},scale=${p.width}:${p.height}:force_original_aspect_ratio=decrease,pad=${p.width}:${p.height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${n}]`)
    if (c.audio) f.push(`[${i}:a]atrim=start=${num(c.in)}:end=${num(c.out)},asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=stereo[a${n}]`)
    else f.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${len}[a${n}]`)
  })
  const cat = p.clips.map((_, n) => `[v${n}][a${n}]`).join('')
  f.push(`${cat}concat=n=${p.clips.length}:v=1:a=1[vout][amain]`)

  const mix = ['[amain]']
  p.audioTracks.forEach((t, n) => {
    const i = idx(t.asset)
    const ms = Math.round(t.start * 1000)
    f.push(`[${i}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${num(t.gainDb)}dB,adelay=${ms}|${ms}[x${n}]`)
    mix.push(`[x${n}]`)
  })
  if (mix.length > 1) f.push(`${mix.join('')}amix=inputs=${mix.length}:duration=first:normalize=0[aout]`)

  return [
    '-y',
    ...files.flatMap((path) => ['-i', path]),
    '-filter_complex', f.join(';'),
    '-map', '[vout]',
    '-map', mix.length > 1 ? '[aout]' : '[amain]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '20',
    '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart',
    output
  ]
}

export interface VideoAdapterOptions {
  /** Server-side render: receives the project, returns the MP4 bytes. Absent: no video export. */
  render?: (project: VideoProject) => Promise<Uint8Array>
}

export function videoAdapter(opts: VideoAdapterOptions = {}): ToolAdapter {
  const make = (project: VideoProject): VideoSession => {
    const id = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`
    const s = jsonSession(project, {
      async export(capability) {
        if ((capability !== 'short_video' && capability !== 'long_video') || !opts.render) return undefined
        const limit = capability === 'short_video' ? 180 : Infinity
        if (videoDuration(s.state) > limit) return undefined
        return { bytes: await opts.render(s.state), mime: 'video/mp4' }
      }
    }) as VideoSession
    s.addClip = (asset, durationSec) => {
      const cid = id('clp')
      s.update((d) => void d.clips.push({ id: cid, asset, in: 0, out: durationSec, audio: true }))
      return cid
    }
    s.trim = (clipId, inSec, outSec) =>
      s.update((d) => {
        const c = d.clips.find((x) => x.id === clipId)
        if (!c) throw new Error(`Clip not found: ${clipId}`)
        if (!(inSec >= 0 && outSec > inSec)) throw new Error('Invalid trim')
        c.in = inSec
        c.out = outSec
      })
    s.moveClip = (clipId, to) =>
      s.update((d) => {
        const from = d.clips.findIndex((x) => x.id === clipId)
        if (from < 0) throw new Error(`Clip not found: ${clipId}`)
        const [c] = d.clips.splice(from, 1)
        d.clips.splice(Math.max(0, Math.min(to, d.clips.length)), 0, c)
      })
    s.removeClip = (clipId) => s.update((d) => void (d.clips = d.clips.filter((c) => c.id !== clipId)))
    s.addAudio = (asset, start = 0, gainDb = -6) => {
      const tid = id('aud')
      s.update((d) => void d.audioTracks.push({ id: tid, asset, start, gainDb }))
      return tid
    }
    s.duration = () => videoDuration(s.state)
    return s
  }
  return { kind: 'video', mime: 'application/vnd.aqua.video+json', create: (n) => make(defaultVideo(n)), open: (b) => make(parseJson<VideoProject>(b)) }
}
