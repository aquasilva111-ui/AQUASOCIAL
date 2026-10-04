import type { Note } from '../adapters/music'

import { hzToMidi } from './pitch'

/**
 * What the singer actually did, as detected: no musical assumptions yet. This is the ORIGINAL and is
 * never modified; every later version (quantised, corrected, transformed) is derived from it.
 */
export interface RawNote {
  /** Seconds from the start of the take. */
  start: number
  duration: number
  /** Representative fundamental frequency of the note (e.g. the median of its frames). */
  hz: number
  /** Loudness 0..1. */
  velocity: number
}

/** One note with both the exact original and the current (interpreted) values side by side. */
export interface MelodyNote {
  /** Seconds, as sung. Never changes. */
  start: number
  duration: number
  hz: number
  velocity: number
  /** Fractional MIDI of what was sung (microtones in the fraction). Never changes. */
  midi: number
  /** Position and length in beats at the melody's tempo. Exact for the original; moved by quantisation. */
  beat: number
  beats: number
  /** Current pitch: fractional MIDI after any correction (equals `midi` for the original). */
  pitch: number
  /** What the original looked like in beats/pitch, kept so a slider can always go back. */
  orig: { beat: number; beats: number; pitch: number }
}

export interface Melody {
  bpm: number
  beatsPerBar: number
  notes: MelodyNote[]
}

/** Builds the faithful version of a take: positions in beats are just seconds converted at `bpm`. */
export function toMelody(raw: RawNote[], bpm: number, beatsPerBar = 4): Melody {
  if (!(bpm > 0)) throw new Error('BPM must be positive')
  const spb = 60 / bpm
  const notes = [...raw]
    .filter((r) => r.duration > 0 && r.hz > 0)
    .sort((a, b) => a.start - b.start)
    .map((r): MelodyNote => {
      const midi = hzToMidi(r.hz)
      const beat = r.start / spb
      const beats = r.duration / spb
      return { start: r.start, duration: r.duration, hz: r.hz, velocity: Math.max(0, Math.min(1, r.velocity)), midi, beat, beats, pitch: midi, orig: { beat, beats, pitch: midi } }
    })
  return { bpm, beatsPerBar, notes }
}

/** The notes of a melody in the Music Studio's own model (integer pitch; microtones are rounded away). */
export function melodyToSongNotes(m: Melody): Note[] {
  return m.notes.map((n) => ({
    beat: Math.max(0, +n.beat.toFixed(4)),
    pitch: Math.max(0, Math.min(127, Math.round(n.pitch))),
    length: Math.max(0.0625, +n.beats.toFixed(4)),
    velocity: Math.max(0.05, n.velocity)
  }))
}

/** Bars needed to hold the melody (for the song's `bars`). */
export const barsFor = (m: Melody): number => {
  const end = m.notes.reduce((e, n) => Math.max(e, n.beat + n.beats), 0)
  return Math.max(1, Math.ceil(end / m.beatsPerBar))
}
