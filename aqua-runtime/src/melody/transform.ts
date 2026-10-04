import type { Melody, MelodyNote } from './melody'
import { midiToHz } from './pitch'

/**
 * Compositional transformations. They work on the CURRENT (interpreted) notes and return a new
 * melody that is a fresh baseline: `orig` equals the result, and the seconds/Hz fields are rebuilt
 * from beats and pitch, because a transformed melody was not sung. The sung take itself is kept by
 * the caller and is never touched.
 */
const rebuild = (m: Melody, notes: { beat: number; beats: number; pitch: number; velocity: number }[]): Melody => {
  const spb = 60 / m.bpm
  return {
    ...m,
    notes: notes
      .map((n): MelodyNote => ({
        start: n.beat * spb,
        duration: n.beats * spb,
        hz: midiToHz(n.pitch),
        velocity: n.velocity,
        midi: n.pitch,
        beat: n.beat,
        beats: n.beats,
        pitch: n.pitch,
        orig: { beat: n.beat, beats: n.beats, pitch: n.pitch }
      }))
      .sort((a, b) => a.beat - b.beat)
  }
}

const cur = (m: Melody) => m.notes.map((n) => ({ beat: n.beat, beats: n.beats, pitch: n.pitch, velocity: n.velocity }))

export const transpose = (m: Melody, semitones: number): Melody => rebuild(m, cur(m).map((n) => ({ ...n, pitch: n.pitch + semitones })))

/** Mirrors every interval around `axis` (default: the first note): up becomes down, same size. */
export function invert(m: Melody, axis = m.notes[0]?.pitch ?? 60): Melody {
  return rebuild(m, cur(m).map((n) => ({ ...n, pitch: 2 * axis - n.pitch })))
}

/** Plays the melody backwards: the last note first, rhythm reversed with it. */
export function retrograde(m: Melody): Melody {
  const notes = cur(m)
  const end = notes.reduce((e, n) => Math.max(e, n.beat + n.beats), 0)
  const start = notes.reduce((s, n) => Math.min(s, n.beat), Infinity)
  return rebuild(m, notes.map((n) => ({ ...n, beat: start + (end - (n.beat + n.beats)) })))
}

/** Multiplies every position and length: 2 doubles the durations (augmentation), 0.5 halves them. */
export function stretch(m: Melody, factor: number): Melody {
  if (!(factor > 0)) throw new Error('Factor must be positive')
  return rebuild(m, cur(m).map((n) => ({ ...n, beat: n.beat * factor, beats: n.beats * factor })))
}

/**
 * Reverses the rhythm only: pitches keep their order, durations and gaps come in reverse order.
 * 1 : 1 : 2 : 1 becomes 1 : 2 : 1 : 1 under the same melody.
 */
export function reverseRhythm(m: Melody): Melody {
  const notes = cur(m)
  if (notes.length < 2) return rebuild(m, notes)
  const pairs = notes.map((n, i) => ({ ioi: i < notes.length - 1 ? notes[i + 1].beat - n.beat : n.beats, beats: n.beats })).reverse()
  let t = notes[0].beat
  return rebuild(m, notes.map((n, i) => {
    const out = { ...n, beat: t, beats: pairs[i].beats }
    t += pairs[i].ioi
    return out
  }))
}

/** Appends `times - 1` copies, each starting on the next bar line after the previous end. */
export function repeat(m: Melody, times: number): Melody {
  const notes = cur(m)
  if (!notes.length || times < 2) return rebuild(m, notes)
  const end = notes.reduce((e, n) => Math.max(e, n.beat + n.beats), 0)
  const span = Math.ceil(end / m.beatsPerBar) * m.beatsPerBar
  const all = [...notes]
  for (let k = 1; k < times; k++) all.push(...notes.map((n) => ({ ...n, beat: n.beat + k * span })))
  return rebuild(m, all)
}

/** The same operations on a bare rhythm (the ratios of `analyzeMelody`): 1 : 1 : 2 : 1 -> x2 -> 2 : 2 : 4 : 2. */
export const rhythmOps = {
  multiply: (r: number[], k: number) => r.map((x) => +(x * k).toFixed(4)),
  divide: (r: number[], k: number) => r.map((x) => +(x / k).toFixed(4)),
  reverse: (r: number[]) => [...r].reverse()
}
