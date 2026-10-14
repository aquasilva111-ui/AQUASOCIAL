import * as Tone from 'tone'

/**
 * InstrumentEngine — AQUA Music Studio
 *
 * Thin adapter over Tone.js. The AQUA Song model remains the source of truth.
 * Instruments are defined as serializable data; Tone.js objects are created only
 * at playback time and never stored in the project.
 */

export type InstrumentType = 'synth' | 'piano' | 'bass' | 'pluck' | 'pad' | 'lead' | 'drums' | 'membrane' | 'sampler'

export interface InstrumentDefinition {
  id: string
  name: string
  type: InstrumentType
  source: 'synthetic' | 'sampled' | 'plugin'
  polyphony: number
  parameters?: Record<string, number | string | boolean>
  effects?: Array<{ type: string; params: Record<string, number> }>
  presets?: string[]
}

export interface InstrumentInstance {
  id: string
  definition: InstrumentDefinition
  dispose(): void
  triggerAttackRelease(note: string | number, duration: number | string, time?: number, velocity?: number): void
  triggerAttack(note: string | number, time?: number, velocity?: number): void
  triggerRelease(note: string | number, time?: number): void
}

const DEFAULTS: Record<string, Partial<InstrumentDefinition>> = {
  synth: { type: 'synth', source: 'synthetic', polyphony: 8, name: 'Synth' },
  piano: { type: 'piano', source: 'synthetic', polyphony: 8, name: 'Piano' },
  bass: { type: 'bass', source: 'synthetic', polyphony: 1, name: 'Bass' },
  pluck: { type: 'pluck', source: 'synthetic', polyphony: 6, name: 'Pluck' },
  pad: { type: 'pad', source: 'synthetic', polyphony: 4, name: 'Pad' },
  lead: { type: 'lead', source: 'synthetic', polyphony: 4, name: 'Lead' },
  drums: { type: 'drums', source: 'synthetic', polyphony: 8, name: 'Drums' },
  membrane: { type: 'membrane', source: 'synthetic', polyphony: 2, name: 'Membrane' },
  sampler: { type: 'sampler', source: 'synthetic', polyphony: 4, name: 'Sampler' },
}

export class InstrumentEngine {
  private instances = new Map<string, InstrumentInstance>()

  create(def: InstrumentDefinition | string): InstrumentInstance {
    const base = typeof def === 'string' ? { id: def, ...DEFAULTS[def] } : def
    const full: InstrumentDefinition = {
      id: base.id || `inst_${Math.random().toString(36).slice(2, 8)}`,
      name: base.name || base.type || 'Instrument',
      type: (base.type as InstrumentType) || 'synth',
      source: base.source || 'synthetic',
      polyphony: base.polyphony ?? 8,
      parameters: base.parameters,
      effects: base.effects,
      presets: base.presets,
    }

    const inst = this.buildTone(full)
    this.instances.set(full.id, inst)
    return inst
  }

  get(id: string): InstrumentInstance | undefined {
    return this.instances.get(id)
  }

  dispose(id: string) {
    this.instances.get(id)?.dispose()
    this.instances.delete(id)
  }

  disposeAll() {
    for (const inst of this.instances.values()) inst.dispose()
    this.instances.clear()
  }

  private buildTone(def: InstrumentDefinition): InstrumentInstance {
    let synth: Tone.PolySynth | Tone.Synth | Tone.MembraneSynth | Tone.NoiseSynth | Tone.MetalSynth | Tone.PluckSynth

    switch (def.type) {
      case 'piano':
      case 'pad':
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 1.2 },
        }).toDestination()
        break
      case 'bass':
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'square' },
          envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.4 },
        }).toDestination()
        break
      case 'pluck':
        synth = new Tone.PluckSynth().toDestination()
        break
      case 'lead':
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 },
        }).toDestination()
        break
      case 'drums':
      case 'membrane':
        synth = new Tone.MembraneSynth({
          pitchDecay: 0.05,
          octaves: 4,
          envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 },
        }).toDestination()
        break
      case 'sampler':
        // Placeholder until real samples; square wave for now
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'square' },
        }).toDestination()
        break
      case 'synth':
      default:
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.4 },
        }).toDestination()
        break
    }

    return {
      id: def.id,
      definition: def,
      dispose() {
        synth.dispose()
      },
      triggerAttackRelease(note, duration, time, velocity = 0.8) {
        const t = time ?? Tone.now()
        if ('triggerAttackRelease' in synth) {
          ;(synth as any).triggerAttackRelease(note, duration, t, velocity)
        }
      },
      triggerAttack(note, time, velocity = 0.8) {
        const t = time ?? Tone.now()
        if ('triggerAttack' in synth) {
          ;(synth as any).triggerAttack(note, t, velocity)
        }
      },
      triggerRelease(note, time) {
        const t = time ?? Tone.now()
        if ('triggerRelease' in synth) {
          ;(synth as any).triggerRelease(note, t)
        }
      },
    }
  }
}

export const engine = new InstrumentEngine()
