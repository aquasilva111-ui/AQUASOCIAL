import { applyAudioEdit } from '../render/audio'
import { decodeWav, encodeWav, type Pcm } from '../render/wav'
import type { ToolAdapter } from '../types'
import { jsonSession, parseJson, type JsonSession } from './json'

/**
 * Non-destructive audio edit: the source stays an AQUA Asset (by hash) and the edit is a list of
 * regions to keep plus gain/fades. WaveSurfer (waveform, regions) is the UI over this model; it is
 * a viewer/selector, not an editor, so the actual cut/mix is done by `renderAudio` (Web Audio or
 * server-side FFmpeg), never by this package.
 */
export interface AudioRegion {
  id: string
  /** Seconds in the source. */
  start: number
  end: number
  label: string
}

export interface AudioEdit {
  title: string
  /** Hash of the source in the project's asset store; null until a file is added. */
  source: string | null
  durationSec: number
  gainDb: number
  fadeInSec: number
  fadeOutSec: number
  /** Parts kept, in order. Empty means the whole source. */
  keep: AudioRegion[]
}

export type AudioSession = JsonSession<AudioEdit> & {
  setSource(hash: string, durationSec: number): void
  keepRegion(start: number, end: number, label?: string): void
  /** Length of the result in seconds. */
  resultDuration(): number
}

export const defaultAudio = (title: string): AudioEdit => ({ title, source: null, durationSec: 0, gainDb: 0, fadeInSec: 0, fadeOutSec: 0, keep: [] })

export interface AudioAdapterOptions {
  /** Gives the source bytes by asset hash (the runtime's AssetStore). Required for export. */
  loadSource?: (hash: string) => Promise<Uint8Array | undefined>
  /** Decodes non-WAV sources (MP3, M4A...) to PCM: Web Audio in the browser, FFmpeg on the server. WAV needs none. */
  decode?: (bytes: Uint8Array) => Promise<Pcm>
  /** Replace the whole render step. */
  renderAudio?: (edit: AudioEdit) => Promise<Uint8Array>
  mime?: string
}

export function audioAdapter(opts: AudioAdapterOptions = {}): ToolAdapter {
  const make = (edit: AudioEdit): AudioSession => {
    const s = jsonSession(edit, {
      async export(capability) {
        if (capability !== 'audio') return undefined
        if (opts.renderAudio) return { bytes: await opts.renderAudio(s.state), mime: opts.mime ?? 'audio/mpeg' }
        const hash = s.state.source
        if (!hash || !opts.loadSource) return undefined
        const bytes = await opts.loadSource(hash)
        if (!bytes) return undefined
        const isWav = bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
        const pcm = isWav ? decodeWav(bytes) : opts.decode ? await opts.decode(bytes) : undefined
        if (!pcm) return undefined
        return { bytes: encodeWav(applyAudioEdit(pcm, s.state)), mime: 'audio/wav' }
      }
    }) as AudioSession
    s.setSource = (hash, durationSec) =>
      s.update((d) => {
        d.source = hash
        d.durationSec = durationSec
        d.keep = []
      })
    s.keepRegion = (start, end, label = '') =>
      s.update((d) => {
        const a = Math.max(0, Math.min(start, end))
        const b = Math.min(d.durationSec, Math.max(start, end))
        if (b - a <= 0) throw new Error('Empty region')
        d.keep.push({ id: `reg_${Math.random().toString(36).slice(2, 8)}`, start: a, end: b, label })
      })
    s.resultDuration = () => (s.state.keep.length ? s.state.keep.reduce((t, r) => t + (r.end - r.start), 0) : s.state.durationSec)
    return s
  }
  return { kind: 'audio', mime: 'application/vnd.aqua.audio-edit+json', create: (n) => make(defaultAudio(n)), open: (b) => make(parseJson<AudioEdit>(b)) }
}
