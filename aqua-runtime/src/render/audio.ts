import type { AudioEdit } from '../adapters/audio'
import type { Pcm } from './wav'

const dbToGain = (db: number) => Math.pow(10, db / 20)

/** Applies an edit to decoded PCM: keeps the chosen regions in order, then gain and fades. Pure. */
export function applyAudioEdit(source: Pcm, edit: AudioEdit): Pcm {
  const rate = source.sampleRate
  const total = source.channels[0]?.length ?? 0
  const ranges = edit.keep.length
    ? edit.keep.map((r) => [Math.max(0, Math.floor(r.start * rate)), Math.min(total, Math.floor(r.end * rate))] as const)
    : ([[0, total]] as const)
  const frames = ranges.reduce((n, [a, b]) => n + Math.max(0, b - a), 0)
  const gain = dbToGain(edit.gainDb)
  const fadeIn = Math.floor(edit.fadeInSec * rate)
  const fadeOut = Math.floor(edit.fadeOutSec * rate)

  const channels = source.channels.map((src) => {
    const out = new Float32Array(frames)
    let w = 0
    for (const [a, b] of ranges) for (let i = a; i < b; i++) out[w++] = src[i]
    for (let i = 0; i < frames; i++) {
      let g = gain
      if (fadeIn > 0 && i < fadeIn) g *= i / fadeIn
      if (fadeOut > 0 && i >= frames - fadeOut) g *= (frames - 1 - i) / fadeOut
      out[i] *= g
    }
    return out
  })
  return { sampleRate: rate, channels }
}
