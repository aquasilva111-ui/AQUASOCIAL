/** Pitch mathematics for the Melody Lab. Equal temperament, A4 = 440 Hz unless told otherwise. */

export const A4_HZ = 440
export const A4_MIDI = 69

/** Fractional MIDI number of a frequency (69 = A4). Microtones are the fractional part. */
export const hzToMidi = (hz: number, a4 = A4_HZ): number => {
  if (!(hz > 0)) throw new Error('Frequency must be positive')
  return A4_MIDI + 12 * Math.log2(hz / a4)
}

export const midiToHz = (midi: number, a4 = A4_HZ): number => a4 * Math.pow(2, (midi - A4_MIDI) / 12)

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const pitchClass = (midi: number): number => ((Math.round(midi) % 12) + 12) % 12
export const pitchClassName = (pc: number): string => NAMES[((pc % 12) + 12) % 12]

/** "A4", "C#3". MIDI 60 is C4. */
export const noteName = (midi: number): string => `${NAMES[pitchClass(midi)]}${Math.floor(Math.round(midi) / 12) - 1}`

/** Deviation of a frequency from the nearest equal-tempered note, in cents (-50..50). */
export const centsOff = (hz: number, a4 = A4_HZ): number => {
  const m = hzToMidi(hz, a4)
  return (m - Math.round(m)) * 100
}

/** Frequency ratio of an interval in equal temperament (7 semitones -> 1.4983, a hair under 3/2). */
export const intervalRatio = (semitones: number): number => Math.pow(2, semitones / 12)

const INTERVALS = ['uníssono', '2ª menor', '2ª maior', '3ª menor', '3ª maior', '4ª justa', 'trítono', '5ª justa', '6ª menor', '6ª maior', '7ª menor', '7ª maior']

/** "3ª maior ↑", "5ª justa ↓", "oitava ↑", "9ª maior ↑ (oitava + 2ª maior)". */
export function intervalName(semitones: number): string {
  const s = Math.round(semitones)
  if (s === 0) return 'uníssono'
  const a = Math.abs(s)
  const dir = s > 0 ? '↑' : '↓'
  if (a === 12) return `oitava ${dir}`
  if (a < 12) return `${INTERVALS[a]} ${dir}`
  const oct = Math.floor(a / 12)
  const rest = a % 12
  return rest === 0 ? `${oct} oitavas ${dir}` : `${INTERVALS[rest]} + ${oct} ${oct === 1 ? 'oitava' : 'oitavas'} ${dir}`
}

/** Name of a semitone distance above a chord root, for roles inside a chord ("fundamental", "3ª maior", "5ª justa"). */
export const degreeName = (semitonesAboveRoot: number): string => {
  const s = ((semitonesAboveRoot % 12) + 12) % 12
  return s === 0 ? 'fundamental' : INTERVALS[s]
}
