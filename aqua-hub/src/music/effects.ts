import * as Tone from 'tone'
import type { AudioEffect } from 'aqua-runtime/src/adapters/music'

/**
 * Builds Tone.js effect chains from serializable AQUA AudioEffect data.
 * Tone objects are never stored in the project.
 */

export function createEffect(effect: AudioEffect): Tone.ToneAudioNode | null {
  if (!effect.enabled) return null
  const p = effect.params

  switch (effect.type) {
    case 'reverb':
      return new Tone.Reverb({
        decay: p.decay ?? 2.4,
        wet: p.wet ?? 0.25,
      }).toDestination()
    case 'delay':
      return new Tone.FeedbackDelay({
        delayTime: p.time ?? 0.25,
        feedback: p.feedback ?? 0.3,
        wet: p.wet ?? 0.25,
      }).toDestination()
    case 'chorus':
      return new Tone.Chorus({
        frequency: p.frequency ?? 1.5,
        delayTime: p.delayTime ?? 3.5,
        depth: p.depth ?? 0.7,
        wet: p.wet ?? 0.3,
      }).start().toDestination()
    case 'distortion':
      return new Tone.Distortion({
        distortion: p.amount ?? 0.4,
        wet: p.wet ?? 0.5,
      }).toDestination()
    case 'filter':
      return new Tone.Filter({
        frequency: p.frequency ?? 800,
        type: (p.type as any) || 'lowpass',
        Q: p.q ?? 1,
      }).toDestination()
    case 'compressor':
      return new Tone.Compressor({
        threshold: p.threshold ?? -24,
        ratio: p.ratio ?? 4,
        attack: p.attack ?? 0.003,
        release: p.release ?? 0.25,
      }).toDestination()
    case 'limiter':
      return new Tone.Limiter(p.threshold ?? -1).toDestination()
    case 'eq':
      return new Tone.EQ3({
        low: p.low ?? 0,
        mid: p.mid ?? 0,
        high: p.high ?? 0,
      }).toDestination()
    default:
      return null
  }
}

/**
 * Connect a source through a chain of effects, then to destination.
 * Returns the last node (or the source if no effects).
 */
export function connectChain(source: Tone.ToneAudioNode, effects: AudioEffect[]): Tone.ToneAudioNode {
  let node: Tone.ToneAudioNode = source
  for (const eff of effects) {
    const fx = createEffect(eff)
    if (fx) {
      node.connect(fx)
      node = fx
    }
  }
  if (node !== source) node.toDestination()
  else source.toDestination()
  return node
}

export function defaultParams(type: AudioEffect['type']): Record<string, number> {
  switch (type) {
    case 'reverb': return { decay: 2.4, wet: 0.25 }
    case 'delay': return { time: 0.25, feedback: 0.3, wet: 0.25 }
    case 'chorus': return { frequency: 1.5, depth: 0.7, wet: 0.3 }
    case 'distortion': return { amount: 0.4, wet: 0.5 }
    case 'filter': return { frequency: 800, q: 1 }
    case 'compressor': return { threshold: -24, ratio: 4 }
    case 'limiter': return { threshold: -1 }
    case 'eq': return { low: 0, mid: 0, high: 0 }
    default: return {}
  }
}
