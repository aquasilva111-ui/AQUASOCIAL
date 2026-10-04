import type { Mix } from '../adapters/mix'
import type { Pcm } from './wav'

const dbToGain = (db: number) => Math.pow(10, db / 20)

/** Linear-interpolation resampler (good enough for preview and export of voice/music mixes). */
export function resample(src: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return src
  const n = Math.max(1, Math.floor((src.length * to) / from))
  const out = new Float32Array(n)
  const k = from / to
  for (let i = 0; i < n; i++) {
    const pos = i * k
    const a = Math.floor(pos)
    const f = pos - a
    out[i] = src[a] * (1 - f) + (src[Math.min(a + 1, src.length - 1)] ?? 0) * f
  }
  return out
}

/**
 * Mixes the tracks of a multitrack project to stereo. Each clip is cut from its source, gained and
 * faded, then the track applies volume and constant-power pan (centre = unity). Muted tracks, and
 * every non-solo track when any track is soloed, are left out. The mix is limited to avoid clipping.
 * Pure: the same function backs live pre-listening and the export.
 */
export function renderMix(mix: Mix, sources: Record<string, Pcm>, sampleRate = 44100): Pcm {
  const cache = new Map<string, Float32Array[]>()
  const chans = (hash: string): Float32Array[] | undefined => {
    const src = sources[hash]
    if (!src?.channels.length) return undefined
    let c = cache.get(hash)
    if (!c) cache.set(hash, (c = src.channels.map((ch) => resample(ch, src.sampleRate, sampleRate))))
    return c
  }
  const end = mix.tracks.flatMap((t) => t.clips).reduce((m, c) => Math.max(m, c.start + (c.out - c.in)), 0)
  const frames = Math.ceil(end * sampleRate)
  const L = new Float32Array(frames)
  const R = new Float32Array(frames)
  const anySolo = mix.tracks.some((t) => t.solo)

  for (const t of mix.tracks) {
    if (t.muted || (anySolo && !t.solo)) continue
    const angle = ((Math.max(-1, Math.min(1, t.pan)) + 1) * Math.PI) / 4
    const gl = Math.cos(angle) * Math.SQRT2 * dbToGain(t.volumeDb)
    const gr = Math.sin(angle) * Math.SQRT2 * dbToGain(t.volumeDb)
    for (const c of t.clips) {
      const src = chans(c.asset)
      if (!src) continue
      const a = Math.max(0, Math.floor(c.in * sampleRate))
      const len = Math.min(Math.floor((c.out - c.in) * sampleRate), src[0].length - a)
      const at = Math.floor(c.start * sampleRate)
      const fin = Math.floor(c.fadeIn * sampleRate)
      const fout = Math.floor(c.fadeOut * sampleRate)
      const g = dbToGain(c.gainDb)
      const left = src[0]
      const right = src[1] ?? src[0]
      for (let i = 0; i < len && at + i < frames; i++) {
        let f = g
        if (fin > 0 && i < fin) f *= i / fin
        if (fout > 0 && i >= len - fout) f *= (len - 1 - i) / fout
        L[at + i] += left[a + i] * f * gl
        R[at + i] += right[a + i] * f * gr
      }
    }
  }
  const master = dbToGain(mix.masterDb)
  let peak = 0
  for (let i = 0; i < frames; i++) {
    L[i] *= master
    R[i] *= master
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
  }
  if (peak > 0.98) for (let i = 0; i < frames; i++) (L[i] /= peak / 0.98, (R[i] /= peak / 0.98))
  return { sampleRate, channels: [L, R] }
}
