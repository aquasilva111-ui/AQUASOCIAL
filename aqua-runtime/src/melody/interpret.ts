import type { Melody, MelodyNote } from './melody'
import { midiToHz, pitchClass } from './pitch'

/** A scale as a tonic pitch class (0 = C) and the semitone offsets above it. */
export interface Scale {
  tonic: number
  intervals: number[]
}

export const SCALE_SHAPES: Record<string, number[]> = {
  maior: [0, 2, 4, 5, 7, 9, 11],
  'menor natural': [0, 2, 3, 5, 7, 8, 10],
  'menor harmônica': [0, 2, 3, 5, 7, 8, 11],
  'pentatônica maior': [0, 2, 4, 7, 9],
  'pentatônica menor': [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  dórico: [0, 2, 3, 5, 7, 9, 10],
  cromática: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
}

export const makeScale = (tonic: number, shape: keyof typeof SCALE_SHAPES | number[] = 'maior'): Scale => ({
  tonic: ((tonic % 12) + 12) % 12,
  intervals: Array.isArray(shape) ? shape : SCALE_SHAPES[shape]
})

/** Common grid sizes in beats (a quarter note is one beat). */
export const GRIDS = { '1/4': 1, '1/8': 0.5, '1/16': 0.25, '1/32': 0.125, '1/8 tercina': 1 / 3, '1/16 tercina': 1 / 6 } as const

export interface Interpretation {
  /** 0..1: how far note starts (and lengths) move toward the grid. 0.75 = 75% of the way. */
  quantize: number
  /** Grid size in beats. */
  grid: number
  /** Also quantise note lengths (otherwise only the starts move). */
  quantizeLength: boolean
  /** 0..1: how far each pitch moves toward its target note. */
  pitchCorrection: number
  /** Notes to snap to; null snaps to the nearest semitone. */
  scale: Scale | null
  /** 0 = fully mathematical, 1 = untouched. Scales both amounts: effective = amount × (1 − humanity). */
  humanity: number
}

export const NEUTRAL: Interpretation = { quantize: 0, grid: 0.25, quantizeLength: true, pitchCorrection: 0, scale: null, humanity: 0 }

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const MIN_BEATS = 1 / 16

/** The note of `scale` (or semitone, when null) closest to a fractional MIDI pitch. */
export function nearestInScale(midi: number, scale: Scale | null): number {
  if (!scale) return Math.round(midi)
  const allowed = new Set(scale.intervals.map((i) => (scale.tonic + i) % 12))
  const base = Math.round(midi)
  let best = base
  let bestDist = Infinity
  for (let m = base - 7; m <= base + 7; m++) {
    if (!allowed.has(pitchClass(m))) continue
    const d = Math.abs(m - midi)
    if (d < bestDist - 1e-9) (best = m), (bestDist = d)
  }
  return best
}

/**
 * Derives the interpreted melody from the ORIGINAL values of each note (never from a previous
 * interpretation), so it is idempotent and any slider can go back to the sung version. Positions and
 * lengths move linearly toward the grid; pitch moves linearly in semitones (i.e. in cents) toward
 * the target. The result stays monophonic: a note that would run into the next is shortened.
 */
export function interpret(m: Melody, opts: Partial<Interpretation> = {}): Melody {
  const o = { ...NEUTRAL, ...opts }
  const human = 1 - clamp01(o.humanity)
  const q = clamp01(o.quantize) * human
  const p = clamp01(o.pitchCorrection) * human
  const g = o.grid > 0 ? o.grid : NEUTRAL.grid

  // Ideal start of each note: the nearest grid line, but never on or before the previous note's line
  // (a dense passage on a coarse grid pushes the later notes to the next line instead of stacking them).
  let prevIdeal = -Infinity
  const ideals = m.notes.map((n) => {
    const ideal = Math.max(Math.round(n.orig.beat / g) * g, prevIdeal + g)
    prevIdeal = ideal
    return ideal
  })
  const notes: MelodyNote[] = m.notes.map((n, i) => {
    const idealBeat = ideals[i]
    const idealLen = Math.max(g, Math.round(n.orig.beats / g) * g)
    const beat = n.orig.beat + (idealBeat - n.orig.beat) * q
    const beats = o.quantizeLength ? n.orig.beats + (idealLen - n.orig.beats) * q : n.orig.beats
    const target = nearestInScale(n.orig.pitch, o.scale)
    return { ...n, beat: Math.max(0, beat), beats: Math.max(MIN_BEATS, beats), pitch: n.orig.pitch + (target - n.orig.pitch) * p }
  })
  // Keep it monophonic: only shorten notes that the interpretation itself pushed into the next one.
  for (let i = 0; i < notes.length - 1; i++) {
    const room = notes[i + 1].beat - notes[i].beat
    const wasClear = m.notes[i].orig.beat + m.notes[i].orig.beats <= m.notes[i + 1].orig.beat + 1e-9
    if (wasClear && notes[i].beats > room) notes[i].beats = Math.max(MIN_BEATS, room)
  }
  return { ...m, notes }
}

/** Frequency of a note's current (interpreted) pitch. */
export const currentHz = (n: MelodyNote): number => midiToHz(n.pitch)

export interface InterpretationDelta {
  /** Mean and largest start shift in beats, and the same in seconds at the melody's tempo. */
  meanBeatShift: number
  maxBeatShift: number
  maxSecondsShift: number
  /** Mean and largest pitch shift in cents. */
  meanCents: number
  maxCents: number
}

/** How far the interpretation is from what was sung, for the UI to show next to the sliders. */
export function interpretationDelta(m: Melody): InterpretationDelta {
  if (!m.notes.length) return { meanBeatShift: 0, maxBeatShift: 0, maxSecondsShift: 0, meanCents: 0, maxCents: 0 }
  const beat = m.notes.map((n) => Math.abs(n.beat - n.orig.beat))
  const cents = m.notes.map((n) => Math.abs(n.pitch - n.orig.pitch) * 100)
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
  return { meanBeatShift: mean(beat), maxBeatShift: Math.max(...beat), maxSecondsShift: (Math.max(...beat) * 60) / m.bpm, meanCents: mean(cents), maxCents: Math.max(...cents) }
}
