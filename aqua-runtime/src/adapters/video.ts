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
  /** Playback speed 0.25..4 (1 = normal). Pitch is not preserved beyond ffmpeg's atempo. */
  speed?: number
  /** Fade from/to black (and audio fade), seconds. Gives a dip-to-black transition between clips. */
  fadeIn?: number
  fadeOut?: number
  /** Colour adjustment (ffmpeg `eq`): brightness -1..1 (0), contrast 0..2 (1), saturation 0..3 (1). */
  brightness?: number
  contrast?: number
  saturation?: number
}

/** A value over time: linear between keyframes, constant before the first and after the last. `t` is seconds from the item's start. */
export interface Keyframe {
  t: number
  v: number
}

/** A second video track: a clip placed on top of the main track (picture-in-picture, B-roll). */
export interface VideoOverlay {
  id: string
  asset: string
  in: number
  out: number
  /** Timeline second where it appears. */
  start: number
  /** Centre position, 0..1 of the canvas. */
  x: number
  y: number
  /** Width as a fraction of the canvas width, 0.05..1. */
  scale: number
  audio: boolean
  /** Animated x / y (0..1). Overrides the fixed value when present. */
  anim?: { x?: Keyframe[]; y?: Keyframe[] }
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
  /** Animated x / y (0..1) and opacity (0..1), keyed from `start`. */
  anim?: { x?: Keyframe[]; y?: Keyframe[]; opacity?: Keyframe[] }
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
  /** Clips drawn over the main track. */
  overlays?: VideoOverlay[]
}

export type VideoSession = JsonSession<VideoProject> & {
  addClip(asset: string, durationSec: number): string
  trim(clipId: string, inSec: number, outSec: number): void
  moveClip(clipId: string, toIndex: number): void
  removeClip(clipId: string): void
  /** Splits a clip at `atSec` seconds from its own start; returns the id of the second half. */
  splitClip(clipId: string, atSec: number): string
  addText(text: string, start: number, end: number): string
  addOverlay(asset: string, durationSec: number, start: number): string
  removeOverlay(overlayId: string): void
  /** Turns SRT subtitles into text overlays (replacing earlier captions); returns how many. */
  importSrt(srt: string, offsetSec?: number): number
  removeText(textId: string): void
  addAudio(asset: string, start?: number, gainDb?: number): string
  duration(): number
}

export const defaultVideo = (title: string): VideoProject => ({ title, width: 1080, height: 1920, fps: 30, clips: [], audioTracks: [] })

/** Length of a clip on the timeline (source length divided by speed). */
export const clipLength = (c: VideoClip) => (c.out - c.in) / (c.speed ?? 1)

export const videoDuration = (p: VideoProject) => p.clips.reduce((t, c) => t + clipLength(c), 0)

export interface Cue {
  start: number
  end: number
  text: string
}

/** Parses SRT (also tolerates WebVTT headers and `.` as the millisecond separator). */
export function parseSrt(srt: string): Cue[] {
  const toSec = (h: string, m: string, s: string, ms: string) => +h * 3600 + +m * 60 + +s + +ms.padEnd(3, '0') / 1000
  const cues: Cue[] = []
  for (const block of srt.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim() !== '')
    const i = lines.findIndex((l) => l.includes('-->'))
    if (i < 0) continue
    const m = /(\d+):(\d+):(\d+)[,.](\d{1,3})\s*-->\s*(\d+):(\d+):(\d+)[,.](\d{1,3})/.exec(lines[i])
    const text = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim()
    if (!m || !text) continue
    const start = toSec(m[1], m[2], m[3], m[4])
    const end = toSec(m[5], m[6], m[7], m[8])
    if (end > start) cues.push({ start, end, text })
  }
  return cues
}

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

/** Escapes commas for use inside a filtergraph expression. */
const esc = (e: string) => e.replace(/,/g, '\\,')

/**
 * ffmpeg expression (variable `T`, in seconds) that interpolates linearly between keyframes.
 * Constant before the first and after the last. Commas are NOT escaped here.
 */
export function keyframeExpr(keys: Keyframe[], T: string): string {
  const k = [...keys].sort((a, b) => a.t - b.t)
  if (!k.length) throw new Error('No keyframes')
  let e = `${num(k[k.length - 1].v)}`
  for (let i = k.length - 2; i >= 0; i--) {
    const [a, b] = [k[i], k[i + 1]]
    const span = Math.max(b.t - a.t, 0.001)
    e = `if(lt(${T},${num(b.t)}),${num(a.v)}+(${num(b.v - a.v)})*(${T}-${num(a.t)})/${num(span)},${e})`
  }
  return `if(lt(${T},${num(k[0].t)}),${num(k[0].v)},${e})`
}

/** atempo accepts 0.5..2 per instance; chain several for the rest of the range. */
function atempoChain(speed: number): string {
  const parts: string[] = []
  let s = speed
  while (s > 2) (parts.push('atempo=2'), (s /= 2))
  while (s < 0.5) (parts.push('atempo=0.5'), (s *= 2))
  parts.push(`atempo=${num(s)}`)
  return parts.join(',')
}

/**
 * ffmpeg arguments for the project. `inputs` maps asset hash -> file path on the render server.
 * Each clip is trimmed, retimed, scaled to fit and padded to the canvas, then concatenated. Overlay
 * clips and text are drawn over that, and audio tracks are delayed, gained and mixed with the clips'
 * own audio. Silent clips get generated silence so concat always has matching streams.
 */
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
    const speed = c.speed ?? 1
    const len = clipLength(c)
    const fin = Math.min(c.fadeIn ?? 0, len)
    const fout = Math.min(c.fadeOut ?? 0, len)
    const look = c.brightness || (c.contrast ?? 1) !== 1 || (c.saturation ?? 1) !== 1 ? `,eq=brightness=${num(c.brightness ?? 0)}:contrast=${num(c.contrast ?? 1)}:saturation=${num(c.saturation ?? 1)}` : ''
    const vfade = (fin > 0 ? `,fade=t=in:st=0:d=${num(fin)}` : '') + (fout > 0 ? `,fade=t=out:st=${num(len - fout)}:d=${num(fout)}` : '')
    const afade = (fin > 0 ? `,afade=t=in:st=0:d=${num(fin)}` : '') + (fout > 0 ? `,afade=t=out:st=${num(len - fout)}:d=${num(fout)}` : '')
    const retime = speed !== 1 ? `setpts=(PTS-STARTPTS)/${num(speed)}` : 'setpts=PTS-STARTPTS'
    f.push(`[${i}:v]trim=start=${num(c.in)}:end=${num(c.out)},${retime},fps=${p.fps},scale=${p.width}:${p.height}:force_original_aspect_ratio=decrease,pad=${p.width}:${p.height}:(ow-iw)/2:(oh-ih)/2,setsar=1${look}${vfade}[v${n}]`)
    if (c.audio) f.push(`[${i}:a]atrim=start=${num(c.in)}:end=${num(c.out)},asetpts=PTS-STARTPTS${speed !== 1 ? ',' + atempoChain(speed) : ''},aresample=44100,aformat=channel_layouts=stereo${afade}[a${n}]`)
    else f.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${num(len)}[a${n}]`)
  })
  const cat = p.clips.map((_, n) => `[v${n}][a${n}]`).join('')
  const overlays = p.overlays ?? []
  const texts = p.texts ?? []
  const stages = overlays.length + texts.length
  let cur = 'vcat'
  let stage = 0
  const nextLabel = () => (++stage === stages ? 'vout' : `vs${stage}`)
  f.push(`${cat}concat=n=${p.clips.length}:v=1:a=1[${stages ? 'vcat' : 'vout'}][amain]`)

  const mix = ['[amain]']
  overlays.forEach((o, n) => {
    const i = idx(o.asset)
    const len = o.out - o.in
    const xy = (v: number, keys: Keyframe[] | undefined) => (keys?.length ? esc(keyframeExpr(keys.map((k) => ({ t: k.t + o.start, v: k.v })), 't')) : `${num(v)}`)
    f.push(`[${i}:v]trim=start=${num(o.in)}:end=${num(o.out)},setpts=PTS-STARTPTS+${num(o.start)}/TB,fps=${p.fps},scale=${Math.max(16, Math.round((p.width * o.scale) / 2) * 2)}:-2,setsar=1[ov${n}]`)
    const out = nextLabel()
    f.push(`[${cur}][ov${n}]overlay=x=(W*(${xy(o.x, o.anim?.x)}))-w/2:y=(H*(${xy(o.y, o.anim?.y)}))-h/2:eval=frame:enable=between(t\\,${num(o.start)}\\,${num(o.start + len)})[${out}]`)
    cur = out
    if (o.audio) {
      const ms = Math.round(o.start * 1000)
      f.push(`[${i}:a]atrim=start=${num(o.in)}:end=${num(o.out)},asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[oa${n}]`)
      mix.push(`[oa${n}]`)
    }
  })

  if (texts.length && !extras.fontFile) throw new Error('Text overlays need a font file')
  texts.forEach((t) => {
    const file = extras.textFiles?.[t.id]
    if (!file) throw new Error(`No text file for ${t.id}`)
    const at = (keys: Keyframe[] | undefined, fixed: number) => (keys?.length ? esc(keyframeExpr(keys.map((k) => ({ t: k.t + t.start, v: k.v })), 't')) : `${num(fixed)}`)
    const alpha = t.anim?.opacity?.length ? `:alpha=${at(t.anim.opacity, 1)}` : ''
    const out = nextLabel()
    f.push(
      `[${cur}]drawtext=expansion=none:fontfile=${extras.fontFile}:textfile=${file}:fontsize=${num(t.size * p.height)}:fontcolor=${t.color}${alpha}:x=(w*(${at(t.anim?.x, t.x)}))-text_w/2:y=(h*(${at(t.anim?.y, t.y)}))-text_h/2:enable=between(t\\,${num(t.start)}\\,${num(t.end)})[${out}]`
    )
    cur = out
  })

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
        const cut = c.in + atSec * (c.speed ?? 1) // atSec is timeline time; the source advances `speed` times faster
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
    s.addOverlay = (asset, durationSec, start) => {
      const oid = id('ovl')
      s.update((d) => void (d.overlays ??= []).push({ id: oid, asset, in: 0, out: durationSec, start, x: 0.8, y: 0.2, scale: 0.35, audio: false }))
      return oid
    }
    s.removeOverlay = (overlayId) => s.update((d) => void (d.overlays = (d.overlays ?? []).filter((o) => o.id !== overlayId)))
    s.importSrt = (srt, offsetSec = 0) => {
      const cues = parseSrt(srt).slice(0, 200)
      s.update((d) => {
        const texts = (d.texts = (d.texts ?? []).filter((t) => !t.id.startsWith('cap_')))
        cues.forEach((c, n) => texts.push({ id: `cap_${n}`, text: c.text, start: Math.max(0, c.start + offsetSec), end: Math.max(0, c.end + offsetSec), x: 0.5, y: 0.88, size: 0.045, color: '#ffffff' }))
      })
      return cues.length
    }
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
