import type { Melody } from './melody'
import { degreeName, intervalName, intervalRatio, noteName, pitchClass, pitchClassName } from './pitch'

export interface IntervalInfo {
  semitones: number
  name: string
  /** Equal-tempered ratio of the interval. */
  ratio: number
}

export interface KeyEstimate {
  tonic: number
  tonicName: string
  mode: 'maior' | 'menor'
  /** Correlation with the key profile, -1..1. Below ~0.5 the guess is weak. */
  confidence: number
}

export interface ChordHint {
  name: string
  root: number
  /** Share of the melody's time spent on notes that belong to the chord, 0..1. */
  coverage: number
  /** What each distinct melody note is relative to the chord root. */
  roles: { note: string; role: string }[]
}

export interface MelodyAnalysis {
  names: string[]
  /** Between consecutive notes, from the current (interpreted) pitches. */
  intervals: IntervalInfo[]
  /** Frequency of each note relative to the first, measured on the sung Hz. */
  sungRatios: number[]
  /** The same relative to the first note after rounding to equal temperament. */
  tempered: number[]
  /** Durations normalised to the shortest, e.g. [2, 1, 2, 2]; `unit` is that shortest duration in beats. */
  rhythm: { ratios: number[]; unit: number }
  range: { low: number; high: number; semitones: number }
  key?: KeyEstimate
  chords: ChordHint[]
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/**
 * Durations as small whole-number ratios: [0.5, 0.25, 0.25, 0.5] beats -> [2, 1, 1, 2]. Works on a
 * 1/16-beat grid; when the durations are not clean multiples the ratios keep one decimal.
 */
export function rhythmRatios(beats: number[]): { ratios: number[]; unit: number } {
  const snap = beats.map((b) => Math.max(1, Math.round(b * 16))) // sixteenths of a beat
  if (!snap.length) return { ratios: [], unit: 0 }
  const g = snap.reduce((a, b) => gcd(a, b))
  const min = Math.min(...snap)
  // Prefer the greatest common divisor; if it is tiny (messy timing), fall back to the shortest note.
  const unit = g >= Math.max(2, min / 4) ? g : min
  const ratios = snap.map((s) => +(s / unit).toFixed(1))
  const clean = ratios.every((r) => Math.abs(r - Math.round(r)) < 0.001)
  return { ratios: clean ? ratios.map(Math.round) : ratios, unit: unit / 16 }
}

// Krumhansl–Schmuckler key profiles (probe-tone ratings).
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

const pearson = (a: number[], b: number[]): number => {
  const n = a.length
  const ma = a.reduce((x, y) => x + y, 0) / n
  const mb = b.reduce((x, y) => x + y, 0) / n
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    db += (b[i] - mb) ** 2
  }
  return da && db ? num / Math.sqrt(da * db) : 0
}

/** Pitch-class histogram weighted by note length (in beats), summing to 1. */
export function pitchClassWeights(m: Melody): number[] {
  const w = new Array<number>(12).fill(0)
  for (const n of m.notes) w[pitchClass(n.pitch)] += n.beats
  const total = w.reduce((a, b) => a + b, 0)
  return total ? w.map((x) => x / total) : w
}

export function estimateKey(m: Melody): KeyEstimate | undefined {
  const w = pitchClassWeights(m)
  if (w.filter((x) => x > 0).length < 2) return undefined
  let best: KeyEstimate | undefined
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const [mode, prof] of [['maior', MAJOR], ['menor', MINOR]] as const) {
      const rotated = prof.map((_, i) => prof[(i - tonic + 12) % 12])
      const r = pearson(w, rotated)
      if (!best || r > best.confidence) best = { tonic, tonicName: pitchClassName(tonic), mode, confidence: r }
    }
  }
  return best
}

const CHORDS: { suffix: string; tones: number[] }[] = [
  { suffix: 'maior', tones: [0, 4, 7] },
  { suffix: 'menor', tones: [0, 3, 7] },
  { suffix: 'diminuto', tones: [0, 3, 6] },
  { suffix: 'aumentado', tones: [0, 4, 8] },
  { suffix: 'sus2', tones: [0, 2, 7] },
  { suffix: 'sus4', tones: [0, 5, 7] },
  { suffix: '7M', tones: [0, 4, 7, 11] },
  { suffix: 'm7', tones: [0, 3, 7, 10] },
  { suffix: '7', tones: [0, 4, 7, 10] }
]

/**
 * Chords that could hold the melody, best first. Purely mathematical (which notes belong to which
 * triad/seventh); it suggests, the musician decides. Scored by how much of the melody's time falls on
 * chord tones and how many of the chord's tones the melody actually uses.
 */
export function chordHints(m: Melody, max = 3): ChordHint[] {
  const w = pitchClassWeights(m)
  const used = w.map((x) => x > 0)
  if (used.filter(Boolean).length < 2) return []
  const out: (ChordHint & { score: number; size: number })[] = []
  for (let root = 0; root < 12; root++) {
    for (const c of CHORDS) {
      const pcs = c.tones.map((t) => (root + t) % 12)
      const coverage = pcs.reduce((s, pc) => s + w[pc], 0)
      const presence = pcs.filter((pc) => used[pc]).length / pcs.length
      const roles = [...new Set(m.notes.map((n) => pitchClass(n.pitch)))]
        .filter((pc) => pcs.includes(pc))
        .map((pc) => ({ note: pitchClassName(pc), role: degreeName(pc - root) }))
      out.push({ name: `${pitchClassName(root)} ${c.suffix}`, root, coverage, roles, score: coverage * 0.7 + presence * 0.3, size: pcs.length })
    }
  }
  return out
    .sort((a, b) => b.score - a.score || a.size - b.size || a.root - b.root)
    .slice(0, max)
    .map(({ score: _s, size: _z, ...c }) => c)
}

export function analyzeMelody(m: Melody): MelodyAnalysis {
  const n = m.notes
  const intervals: IntervalInfo[] = []
  for (let i = 1; i < n.length; i++) {
    const semitones = Math.round(n[i].pitch) - Math.round(n[i - 1].pitch)
    intervals.push({ semitones, name: intervalName(semitones), ratio: intervalRatio(semitones) })
  }
  const first = n[0]
  const pitches = n.map((x) => Math.round(x.pitch))
  const low = pitches.length ? Math.min(...pitches) : 0
  const high = pitches.length ? Math.max(...pitches) : 0
  return {
    names: pitches.map(noteName),
    intervals,
    sungRatios: first ? n.map((x) => x.hz / first.hz) : [],
    tempered: first ? pitches.map((p) => intervalRatio(p - Math.round(first.pitch))) : [],
    rhythm: rhythmRatios(n.map((x) => x.beats)),
    range: { low, high, semitones: high - low },
    key: estimateKey(m),
    chords: chordHints(m)
  }
}
