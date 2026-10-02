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
  /** Fade from/to black (and audio fade), seconds. Gives a dip-to-black transition between clips. */
  fadeIn?: number
  fadeOut?: number
  /** Colour adjustment (ffmpeg `eq`): brightness -1..1 (0), contrast 0..2 (1), saturation 0..3 (1). */
  brightness?: number
  contrast?: number
  saturation?: number
}

/** Text drawn over the finished timeline between `start` and `end` seconds. */
export interface VideoText {
  id: string
  text: string
  start: number
  end: number
  /** Position of the text box centre, 0..1 of the canvas. */
  x: number
  y: number
  /** Font size as a fraction of the canvas height. */
  size: number
  color: string
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
  texts?: VideoText[]
}

export type VideoSession = JsonSession<VideoProject> & {
  addClip(asset: string, durationSec: number): string
  trim(clipId: string, inSec: number, outSec: number): void
  moveClip(clipId: string, toIndex: number): void
  removeClip(clipId: string): void
  /** Splits a clip at `atSec` seconds from its own start; returns the id of the second half. */
  splitClip(clipId: string, atSec: number): string
  addText(text: string, start: number, end: number): string
  removeText(textId: string): void
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
export interface FfmpegExtras {
  /** Font file for text overlays (required when the project has texts). */
  fontFile?: string
  /** text id -> path of a file holding that text (kept out of the filter string on purpose). */
  textFiles?: Record<string, string>
}

export function buildFfmpegArgs(p: VideoProject, inputs: Record<string, string>, output: string, extras: FfmpegExtras = {}): string[] {
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
    const fin = Math.min(c.fadeIn ?? 0, len)
    const fout = Math.min(c.fadeOut ?? 0, len)
    const look = c.brightness || (c.contrast ?? 1) !== 1 || (c.saturation ?? 1) !== 1 ? `,eq=brightness=${num(c.brightness ?? 0)}:contrast=${num(c.contrast ?? 1)}:saturation=${num(c.saturation ?? 1)}` : ''
    const vfade = (fin > 0 ? `,fade=t=in:st=0:d=${num(fin)}` : '') + (fout > 0 ? `,fade=t=out:st=${num(len - fout)}:d=${num(fout)}` : '')
    const afade = (fin > 0 ? `,afade=t=in:st=0:d=${num(fin)}` : '') + (fout > 0 ? `,afade=t=out:st=${num(len - fout)}:d=${num(fout)}` : '')
    f.push(`[${i}:v]trim=start=${num(c.in)}:end=${num(c.out)},setpts=PTS-STARTPTS,fps=${p.fps},scale=${p.width}:${p.height}:force_original_aspect_ratio=decrease,pad=${p.width}:${p.height}:(ow-iw)/2:(oh-ih)/2,setsar=1${look}${vfade}[v${n}]`)
    if (c.audio) f.push(`[${i}:a]atrim=start=${num(c.in)}:end=${num(c.out)},asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=stereo${afade}[a${n}]`)
    else f.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${len}[a${n}]`)
  })
  const cat = p.clips.map((_, n) => `[v${n}][a${n}]`).join('')
  const texts = p.texts ?? []
  f.push(`${cat}concat=n=${p.clips.length}:v=1:a=1[${texts.length ? 'vcat' : 'vout'}][amain]`)
  if (texts.length) {
    if (!extras.fontFile) throw new Error('Text overlays need a font file')
    let prev = 'vcat'
    texts.forEach((t, n) => {
      const file = extras.textFiles?.[t.id]
      if (!file) throw new Error(`No text file for ${t.id}`)
      const out = n === texts.length - 1 ? 'vout' : `vt${n}`
      f.push(
        `[${prev}]drawtext=expansion=none:fontfile=${extras.fontFile}:textfile=${file}:fontsize=${num(t.size * p.height)}:fontcolor=${t.color}:x=(w*${num(t.x)})-text_w/2:y=(h*${num(t.y)})-text_h/2:enable=between(t\\,${num(t.start)}\\,${num(t.end)})[${out}]`
      )
      prev = out
    })
  }

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
    s.splitClip = (clipId, atSec) => {
      const nid = id('clp')
      s.update((d) => {
        const i = d.clips.findIndex((x) => x.id === clipId)
        if (i < 0) throw new Error(`Clip not found: ${clipId}`)
        const c = d.clips[i]
        const cut = c.in + atSec
        if (!(atSec > 0.05 && cut < c.out - 0.05)) throw new Error('Split point must be inside the clip')
        // The fade-out and transition stay with the second half; the fade-in stays with the first.
        const second = { ...c, id: nid, in: cut, fadeIn: 0 }
        d.clips.splice(i + 1, 0, second)
        c.out = cut
        c.fadeOut = 0
      })
      return nid
    }
    s.addText = (text, start, end) => {
      const tid = id('txt')
      s.update((d) => void (d.texts ??= []).push({ id: tid, text, start, end, x: 0.5, y: 0.8, size: 0.05, color: '#ffffff' }))
      return tid
    }
    s.removeText = (textId) => s.update((d) => void (d.texts = (d.texts ?? []).filter((t) => t.id !== textId)))
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
