import type { Melody } from './melody'

export interface MelodyPattern {
  /**
   * exact: same intervals and same rhythm, whether or not it was transposed (see `shifts`).
   * melodic: same intervals but different rhythm. rhythmic: same rhythm over different notes.
   */
  kind: 'exact' | 'melodic' | 'rhythmic'
  /** Number of notes in the pattern. */
  length: number
  /** Index of the first note of every occurrence (never overlapping). */
  positions: number[]
  /** Semitones each occurrence sits above the first one (0 for a literal repeat). */
  shifts: number[]
  /** Interval steps (semitones) and durations (1/16 beats) that define it. */
  intervals: number[]
  durations: number[]
}

/**
 * Repeated shapes in a melody: motifs that return, transposed or not, and rhythms that come back
 * under new notes. Longest first; a note already explained by a longer pattern of the same kind is
 * not reported again by a shorter one.
 */
export function findPatterns(m: Melody, opts: { minLength?: number; maxLength?: number } = {}): MelodyPattern[] {
  const notes = m.notes
  const min = Math.max(2, opts.minLength ?? 3)
  const max = Math.min(opts.maxLength ?? 8, notes.length)
  const pitch = notes.map((n) => Math.round(n.pitch))
  const dur = notes.map((n) => Math.max(1, Math.round(n.beats * 16)))
  const out: MelodyPattern[] = []

  for (const kind of ['exact', 'melodic', 'rhythmic'] as const) {
    const covered = new Set<number>()
    for (let L = max; L >= min; L--) {
      const groups = new Map<string, number[]>()
      for (let i = 0; i + L <= notes.length; i++) {
        const iv = Array.from({ length: L - 1 }, (_, k) => pitch[i + k + 1] - pitch[i + k])
        const du = dur.slice(i, i + L)
        const key = kind === 'exact' ? `${iv}|${du}` : kind === 'melodic' ? `${iv}` : `${du}`
        const list = groups.get(key) ?? []
        list.push(i)
        groups.set(key, list)
      }
      for (const [, starts] of groups) {
        const free: number[] = []
        let lastEnd = -1
        for (const s of starts) {
          if (s <= lastEnd) continue // overlaps the previous occurrence
          if (Array.from({ length: L }, (_, k) => s + k).some((i) => covered.has(i))) continue
          free.push(s)
          lastEnd = s + L - 1
        }
        if (free.length < 2) continue
        const s0 = free[0]
        const iv = Array.from({ length: L - 1 }, (_, k) => pitch[s0 + k + 1] - pitch[s0 + k])
        // A "melodic" or "rhythmic" report is only interesting when it differs from the exact one.
        const du = dur.slice(s0, s0 + L)
        if (kind !== 'exact' && free.every((s) => dur.slice(s, s + L).join() === du.join() && Array.from({ length: L - 1 }, (_, k) => pitch[s + k + 1] - pitch[s + k]).join() === iv.join())) continue
        out.push({ kind, length: L, positions: free, shifts: free.map((s) => pitch[s] - pitch[s0]), intervals: iv, durations: du })
        for (const s of free) for (let k = 0; k < L; k++) covered.add(s + k)
      }
    }
  }
  return out.sort((a, b) => b.length * b.positions.length - a.length * a.positions.length || a.kind.localeCompare(b.kind))
}
