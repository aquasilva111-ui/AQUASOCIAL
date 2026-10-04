import assert from 'node:assert/strict'
import { test } from 'node:test'

import { analyzeMelody, barsFor, centsOff, chordHints, degreeName, estimateKey, hzToMidi, intervalName, intervalRatio, melodyToSongNotes, midiToHz, noteName, rhythmRatios, toMelody, type RawNote } from '../src/index'

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`)

// C4 D4 E4 G4 E4 at 120 BPM (0.5 s per beat), notes lasting 1, .5, 1, 1, 1 beats
const hz = (midi: number) => midiToHz(midi)
const take = (pitches: number[], beats: number[], bpm = 120): RawNote[] => {
  let t = 0
  return pitches.map((p, i) => {
    const r = { start: t, duration: (beats[i] * 60) / bpm, hz: hz(p), velocity: 0.8 }
    t += r.duration
    return r
  })
}

test('pitch math: Hz <-> MIDI <-> name, cents, intervals', () => {
  close(hzToMidi(440), 69)
  close(hzToMidi(261.6256), 60, 1e-4)
  close(midiToHz(69), 440)
  close(midiToHz(hzToMidi(123.45)), 123.45, 1e-9)
  assert.equal(noteName(60), 'C4')
  assert.equal(noteName(69), 'A4')
  assert.equal(noteName(61), 'C#4')
  assert.equal(noteName(59), 'B3')
  // the example from the brief: 436.8 Hz sung, A4 intended
  close(centsOff(436.8), -12.63, 0.01)
  close(centsOff(440), 0)
  close(centsOff(446), 23.4, 0.1)
  assert.throws(() => hzToMidi(0))
  assert.throws(() => hzToMidi(-3))
  close(intervalRatio(12), 2)
  close(intervalRatio(7), 1.4983, 1e-4) // tempered fifth, a hair under 3/2
  assert.equal(intervalName(0), 'uníssono')
  assert.equal(intervalName(4), '3ª maior ↑')
  assert.equal(intervalName(-7), '5ª justa ↓')
  assert.equal(intervalName(12), 'oitava ↑')
  assert.equal(intervalName(14), '2ª maior + 1 oitava ↑')
  assert.equal(intervalName(-24), '2 oitavas ↓')
  assert.equal(degreeName(7), '5ª justa')
  assert.equal(degreeName(-5), '5ª justa') // wraps below the root
  assert.equal(degreeName(0), 'fundamental')
})

test('toMelody: the original keeps microtones and exact timing, interpreted starts identical', () => {
  // meio fora do tempo e do tom: 436.8 Hz (A4 -12.6c) entering 0.47 s late
  const raw: RawNote[] = [
    { start: 0.03, duration: 0.47, hz: 436.8, velocity: 0.7 },
    { start: 0.5, duration: 0.24, hz: midiToHz(62), velocity: 0.9 }
  ]
  const m = toMelody(raw, 120)
  assert.equal(m.notes.length, 2)
  const n = m.notes[0]
  close(n.beat, 0.06)
  close(n.beats, 0.94)
  close(n.midi, 68.8737, 1e-3)
  assert.equal(Math.round(n.pitch), 69)
  assert.deepEqual(n.orig, { beat: n.beat, beats: n.beats, pitch: n.pitch })
  close(m.notes[1].beat, 1)
  close(m.notes[1].beats, 0.48)
  // unsorted and invalid input is tamed, never mutated
  const messy = toMelody([raw[1], { start: 1, duration: 0, hz: 440, velocity: 1 }, { start: 2, duration: 1, hz: -5, velocity: 1 }, raw[0]], 120)
  assert.deepEqual(messy.notes.map((x) => Math.round(x.midi)), [69, 62])
  assert.equal(raw[0].start, 0.03)
  assert.throws(() => toMelody(raw, 0))
  // velocity is clamped
  assert.equal(toMelody([{ start: 0, duration: 1, hz: 440, velocity: 3 }], 120).notes[0].velocity, 1)
})

test('analysis: intervals, frequency ratios, rhythm ratios and range of C D E G E', () => {
  const m = toMelody(take([60, 62, 64, 67, 64], [1, 0.5, 1, 1, 1]), 120)
  const a = analyzeMelody(m)
  assert.deepEqual(a.names, ['C4', 'D4', 'E4', 'G4', 'E4'])
  assert.deepEqual(a.intervals.map((i) => i.semitones), [2, 2, 3, -3])
  assert.deepEqual(a.intervals.map((i) => i.name), ['2ª maior ↑', '2ª maior ↑', '3ª menor ↑', '3ª menor ↓'])
  assert.deepEqual(a.tempered.slice(0, 4).map((r) => +r.toFixed(3)), [1, 1.122, 1.26, 1.498]) // the ratios from the brief
  close(a.sungRatios[3], hz(67) / hz(60), 1e-9)
  assert.deepEqual(a.rhythm, { ratios: [2, 1, 2, 2, 2], unit: 0.5 })
  assert.deepEqual(a.range, { low: 60, high: 67, semitones: 7 })
})

test('rhythmRatios: clean ratios, messy human timing, edge cases', () => {
  assert.deepEqual(rhythmRatios([0.5, 0.5, 1, 0.5]), { ratios: [1, 1, 2, 1], unit: 0.5 }) // 1 : 1 : 2 : 1 from the brief
  assert.deepEqual(rhythmRatios([1, 1, 2, 1]), { ratios: [1, 1, 2, 1], unit: 1 })
  assert.deepEqual(rhythmRatios([0.25, 0.25, 0.5]), { ratios: [1, 1, 2], unit: 0.25 })
  // triplets keep their meaning on the 1/16 grid only approximately; the answer must not be nonsense
  const messy = rhythmRatios([0.94, 0.48, 0.52, 0.98]) // sung "C D E G" at 120 BPM
  assert.equal(messy.ratios.length, 4)
  assert.ok(messy.ratios[0] > messy.ratios[1] && messy.ratios[3] > messy.ratios[2])
  assert.deepEqual(rhythmRatios([]), { ratios: [], unit: 0 })
  assert.deepEqual(rhythmRatios([2]), { ratios: [1], unit: 2 })
})

test('key estimate: C major for C E G E, A minor for A C E A', () => {
  const cmaj = estimateKey(toMelody(take([60, 64, 67, 64, 60, 62, 64, 60], [1, 1, 1, 1, 1, 0.5, 1.5, 1]), 120))!
  assert.equal(cmaj.tonicName, 'C')
  assert.equal(cmaj.mode, 'maior')
  assert.ok(cmaj.confidence > 0.6)
  const amin = estimateKey(toMelody(take([69, 72, 76, 72, 69, 71, 69, 67, 69], [1, 1, 1, 1, 1, 1, 1, 1, 2]), 120))!
  assert.equal(amin.tonicName, 'A')
  assert.equal(amin.mode, 'menor')
  assert.equal(estimateKey(toMelody(take([60, 60, 60], [1, 1, 1]), 120)), undefined) // one pitch class: no key
  assert.equal(estimateKey(toMelody([], 120)), undefined)
})

test('chord hints: C E G E is a C major triad, with roles', () => {
  const m = toMelody(take([60, 64, 67, 64], [1, 1, 1, 1]), 120)
  const [best] = chordHints(m)
  assert.equal(best.name, 'C maior')
  close(best.coverage, 1)
  assert.deepEqual(best.roles, [
    { note: 'C', role: 'fundamental' },
    { note: 'E', role: '3ª maior' },
    { note: 'G', role: '5ª justa' }
  ])
  assert.equal(chordHints(m).length, 3)
  // a minor shape is recognised as minor
  assert.equal(chordHints(toMelody(take([57, 60, 64, 60], [1, 1, 1, 1]), 120))[0].name, 'A menor')
  assert.deepEqual(chordHints(toMelody(take([60, 60], [1, 1]), 120)), []) // one note says nothing
})

test('melodyToSongNotes and barsFor feed the piano roll', () => {
  const m = toMelody(take([60, 62, 64, 67, 64], [1, 0.5, 1, 1, 1]), 120)
  const notes = melodyToSongNotes(m)
  assert.deepEqual(notes.map((n) => [n.beat, n.pitch, n.length]), [[0, 60, 1], [1, 62, 0.5], [1.5, 64, 1], [2.5, 67, 1], [3.5, 64, 1]])
  assert.equal(barsFor(m), 2) // ends at beat 4.5
  assert.equal(barsFor(toMelody([], 120)), 1)
  // a microtonal note is rounded to the piano roll's integer pitch
  const micro = melodyToSongNotes(toMelody([{ start: 0, duration: 0.5, hz: 436.8, velocity: 0.8 }], 120))
  assert.equal(micro[0].pitch, 69)
})
