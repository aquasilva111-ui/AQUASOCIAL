import { renderMix } from '../render/mix'
import { decodeWav, encodeWav, type Pcm } from '../render/wav'
import type { ToolAdapter } from '../types'
import { jsonSession, parseJson, type JsonSession } from './json'

/**
 * Multitrack audio project. Clips reference AQUA Assets by hash and are non-destructive: a clip is
 * a window (`in`..`out`) of a source placed at `start` on a track. Tracks carry volume, pan, mute
 * and solo. `renderMix` does the mixing, for pre-listening and for export.
 */
export interface MixClip {
  id: string
  asset: string
  /** Seconds on the timeline where the clip starts. */
  start: number
  /** Window inside the source, seconds. */
  in: number
  out: number
  gainDb: number
  fadeIn: number
  fadeOut: number
}

export interface MixTrack {
  id: string
  name: string
  volumeDb: number
  /** -1 (left) .. 1 (right). */
  pan: number
  muted: boolean
  solo: boolean
  clips: MixClip[]
}

export interface Mix {
  title: string
  masterDb: number
  tracks: MixTrack[]
}

export type MixSession = JsonSession<Mix> & {
  addTrack(name?: string): string
  removeTrack(trackId: string): void
  addClip(trackId: string, asset: string, durationSec: number, start?: number): string
  /** Moves a clip on the timeline and optionally to another track. */
  moveClip(clipId: string, start: number, toTrackId?: string): void
  /** Changes the source window; the clip stays in place against the audio (start shifts with `in`). */
  trimClip(clipId: string, inSec: number, outSec: number): void
  /** Splits at a timeline second inside the clip; returns the id of the second half. */
  splitClip(clipId: string, atSec: number): string
  removeClip(clipId: string): void
  /** Length of the mix in seconds. */
  duration(): number
}

export const defaultMix = (title: string): Mix => ({ title, masterDb: 0, tracks: [] })

export const mixDuration = (m: Mix) => m.tracks.flatMap((t) => t.clips).reduce((d, c) => Math.max(d, c.start + (c.out - c.in)), 0)

export interface MixAdapterOptions {
  /** Gives source bytes by asset hash (the runtime's AssetStore). Required for export. */
  loadSource?: (hash: string) => Promise<Uint8Array | undefined>
  /** Decodes non-WAV sources (Web Audio in the browser, FFmpeg on the server). */
  decode?: (bytes: Uint8Array) => Promise<Pcm>
}

export function mixAdapter(opts: MixAdapterOptions = {}): ToolAdapter {
  const make = (mix: Mix): MixSession => {
    const id = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`
    const s = jsonSession(mix, {
      async export(capability) {
        if (capability !== 'audio' || !opts.loadSource) return undefined
        const sources: Record<string, Pcm> = {}
        for (const hash of new Set(s.state.tracks.flatMap((t) => t.clips.map((c) => c.asset)))) {
          const bytes = await opts.loadSource(hash)
          if (!bytes) return undefined
          const isWav = bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
          const pcm = isWav ? decodeWav(bytes) : opts.decode ? await opts.decode(bytes) : undefined
          if (!pcm) return undefined
          sources[hash] = pcm
        }
        if (!Object.keys(sources).length) return undefined
        return { bytes: encodeWav(renderMix(s.state, sources)), mime: 'audio/wav' }
      }
    }) as MixSession
    const track = (d: Mix, tid: string) => {
      const t = d.tracks.find((x) => x.id === tid)
      if (!t) throw new Error(`Track not found: ${tid}`)
      return t
    }
    const find = (d: Mix, cid: string) => {
      for (const t of d.tracks) {
        const i = t.clips.findIndex((c) => c.id === cid)
        if (i >= 0) return { track: t, index: i, clip: t.clips[i] }
      }
      throw new Error(`Clip not found: ${cid}`)
    }
    s.addTrack = (name) => {
      const tid = id('trk')
      s.update((d) => void d.tracks.push({ id: tid, name: name ?? `Faixa ${d.tracks.length + 1}`, volumeDb: 0, pan: 0, muted: false, solo: false, clips: [] }))
      return tid
    }
    s.removeTrack = (tid) => s.update((d) => void (d.tracks = d.tracks.filter((t) => t.id !== tid)))
    s.addClip = (tid, asset, durationSec, start = 0) => {
      const cid = id('clp')
      s.update((d) => void track(d, tid).clips.push({ id: cid, asset, start: Math.max(0, start), in: 0, out: durationSec, gainDb: 0, fadeIn: 0, fadeOut: 0 }))
      return cid
    }
    s.moveClip = (cid, start, toTrackId) =>
      s.update((d) => {
        const f = find(d, cid)
        f.clip.start = Math.max(0, start)
        if (toTrackId && toTrackId !== f.track.id) {
          const dest = track(d, toTrackId)
          f.track.clips.splice(f.index, 1)
          dest.clips.push(f.clip)
        }
      })
    s.trimClip = (cid, inSec, outSec) =>
      s.update((d) => {
        const { clip } = find(d, cid)
        if (!(inSec >= 0 && outSec - inSec >= 0.05)) throw new Error('Invalid trim')
        clip.start = Math.max(0, clip.start + (inSec - clip.in))
        clip.in = inSec
        clip.out = outSec
      })
    s.splitClip = (cid, at) => {
      const nid = id('clp')
      s.update((d) => {
        const { track: t, index, clip } = find(d, cid)
        const off = at - clip.start
        if (!(off > 0.05 && off < clip.out - clip.in - 0.05)) throw new Error('Split point must be inside the clip')
        const second: MixClip = { ...clip, id: nid, start: at, in: clip.in + off, fadeIn: 0 }
        t.clips.splice(index + 1, 0, second)
        clip.out = clip.in + off
        clip.fadeOut = 0
      })
      return nid
    }
    s.removeClip = (cid) => s.update((d) => void d.tracks.forEach((t) => (t.clips = t.clips.filter((c) => c.id !== cid))))
    s.duration = () => mixDuration(s.state)
    return s
  }
  return { kind: 'mix', mime: 'application/vnd.aqua.mix+json', create: (n) => make(defaultMix(n)), open: (b) => make(parseJson<Mix>(b)) }
}
