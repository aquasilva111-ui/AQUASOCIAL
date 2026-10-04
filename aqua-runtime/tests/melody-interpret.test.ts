import assert from 'node:assert/strict'
import { test } from 'node:test'

import { analyzeMelody, currentHz, findPatterns, interpret, interpretationDelta, invert, makeScale, midiToHz, nearestInScale, repeat, retrograde, reverseRhythm, rhythmOps, stretch, toMelody, transpose, type RawNote } from '../src/index'

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`)
const seq = (pitches: number[], beats: number[], bpm = 120, gaps: number[] = []): RawNote[] => {
  let t = 0
  return pitches.map((p, i) => {
    t += ((gaps[i] ?? 0) * 60) / bpm
    const r = { start: t, duration: (beats[i] * 60) / bpm, hz: midiToHz(p), velocity: 0.8 }
    t += r.duration
    return r
  })
}

test('quantisation: the brief\'s numbers (0.473 s toward 0.500 s at 75% is 0.493 s)', () => {
  const m = toMelody([{ start: 0.473, duration: 0.5, hz: 440, velocity: 1 }], 120) // 120 BPM: 0.5 s per beat
  const at = (q: number) => interpret(m, { quantize: q, grid: 1 }).notes[0].beat * 0.5
  close(at(0), 0.473)
  close(at(0.75), 0.49325)
  close(at(1), 0.5)
  // the sung C D E G ("0.47 0.24 0.26 0.49 s") lands on 1/4 1/8 1/8 1/4 at 120 BPM with an eighth-note grid
  const sung = toMelody(seq([60, 62, 64, 67], [0.94, 0.48, 0.52, 0.98]), 120)
  const q = interpret(sung, { quantize: 1, grid: 0.5 })
  assert.deepEqual(q.notes.map((n) => [n.beat, n.beats]), [[0, 1], [1, 0.5], [1.5, 0.5], [2, 1]])
  assert.deepEqual(analyzeMelody(q).rhythm.ratios, [2, 1, 1, 2])
  // starts only: lengths stay as sung
  const startsOnly = interpret(sung, { quantize: 1, grid: 0.5, quantizeLength: false })
  close(startsOnly.notes[1].beats, 0.48)
  close(startsOnly.notes[1].beat, 1)
})

test('interpretation is derived from the original: idempotent and reversible', () => {
  const m = toMelody(seq([60, 62, 64], [0.9, 0.55, 1.1], 120, [0.07, 0.04, 0.09]), 120)
  const a = interpret(m, { quantize: 1, grid: 0.5, pitchCorrection: 1 })
  const b = interpret(a, { quantize: 1, grid: 0.5, pitchCorrection: 1 })
  assert.deepEqual(b.notes, a.notes) // applying twice changes nothing more
  const back = interpret(a, { quantize: 0, pitchCorrection: 0 }) // sliders to zero
  assert.deepEqual(back.notes.map((n) => [n.beat, n.beats, n.pitch]), m.notes.map((n) => [n.beat, n.beats, n.pitch]))
  // the original fields never move
  assert.deepEqual(a.notes.map((n) => n.orig), m.notes.map((n) => n.orig))
  assert.deepEqual(a.notes.map((n) => n.hz), m.notes.map((n) => n.hz))
  assert.equal(m.notes[0].beat, toMelody(seq([60, 62, 64], [0.9, 0.55, 1.1], 120, [0.07, 0.04, 0.09]), 120).notes[0].beat) // input untouched
})

test('humanity scales both corrections; 1 is the sung version', () => {
  const m = toMelody([{ start: 0.473, duration: 0.5, hz: 436.8, velocity: 1 }], 120)
  const full = interpret(m, { quantize: 1, grid: 1, pitchCorrection: 1, humanity: 0 }).notes[0]
  const half = interpret(m, { quantize: 1, grid: 1, pitchCorrection: 1, humanity: 0.5 }).notes[0]
  const none = interpret(m, { quantize: 1, grid: 1, pitchCorrection: 1, humanity: 1 }).notes[0]
  close(full.beat, 1)
  close(half.beat, (0.946 + 1) / 2)
  close(none.beat, 0.946)
  close(full.pitch, 69)
  close(none.pitch, m.notes[0].midi)
  close(half.pitch, (m.notes[0].midi + 69) / 2)
})

test('pitch correction: the brief (436.8 Hz toward A4 at 60% is ~438.72 Hz), scales and ties', () => {
  const m = toMelody([{ start: 0, duration: 0.5, hz: 436.8, velocity: 1 }], 120)
  close(currentHz(interpret(m, { pitchCorrection: 0.6 }).notes[0]), 438.72, 0.01)
  close(currentHz(interpret(m, { pitchCorrection: 1 }).notes[0]), 440, 1e-9)
  close(currentHz(interpret(m, { pitchCorrection: 0 }).notes[0]), 436.8, 1e-9)
  const cmaj = makeScale(0, 'maior')
  assert.equal(nearestInScale(61.2, cmaj), 62) // C# sung sharp-ish: D is closer
  assert.equal(nearestInScale(60.6, cmaj), 60)
  assert.equal(nearestInScale(61.2, null), 61) // free semitone
  assert.equal(nearestInScale(66.3, makeScale(0, 'pentatônica maior')), 67) // F#: G is nearer than E
  assert.equal(nearestInScale(63, makeScale(2, 'menor natural')), 62) // D minor has no Eb; D (1) and F (2 away)
  assert.equal(nearestInScale(130.4, cmaj), 131) // octaves other than the middle ones work
  // a sung out-of-key note is pulled into the key; one already in the key is untouched
  const sung = toMelody(seq([61.2, 64], [1, 1]), 120)
  const fixed = interpret(sung, { pitchCorrection: 1, scale: cmaj })
  assert.deepEqual(fixed.notes.map((n) => n.pitch), [62, 64])
})

test('interpretation never creates overlaps and reports how far it moved', () => {
  // two quick notes that quantise onto the same grid line would collide
  const m = toMelody(seq([60, 62, 64], [0.3, 0.3, 1], 120, [0, 0.04, 0.2]), 120)
  const q = interpret(m, { quantize: 1, grid: 1 })
  for (let i = 0; i < q.notes.length - 1; i++) assert.ok(q.notes[i].beat + q.notes[i].beats <= q.notes[i + 1].beat + 1e-9 || q.notes[i + 1].beat === q.notes[i].beat)
  assert.ok(q.notes.every((n) => n.beats >= 1 / 16))
  const d = interpretationDelta(interpret(toMelody([{ start: 0.473, duration: 0.5, hz: 436.8, velocity: 1 }], 120), { quantize: 1, grid: 1, pitchCorrection: 1 }))
  close(d.maxBeatShift, 0.054)
  close(d.maxSecondsShift, 0.027)
  close(d.maxCents, 12.63, 0.01)
  assert.deepEqual(interpretationDelta(toMelody([], 120)), { meanBeatShift: 0, maxBeatShift: 0, maxSecondsShift: 0, meanCents: 0, maxCents: 0 })
})

test('transformations: transpose, invert, retrograde, stretch, reverse rhythm, repeat', () => {
  const m = toMelody(seq([60, 62, 64, 67], [1, 1, 2, 1]), 120) // C D E G, rhythm 1 1 2 1
  const pitches = (x: typeof m) => x.notes.map((n) => Math.round(n.pitch))
  assert.deepEqual(pitches(transpose(m, 5)), [65, 67, 69, 72])
  assert.deepEqual(pitches(invert(m)), [60, 58, 56, 53]) // intervals +2 +2 +3 become -2 -2 -3
  assert.deepEqual(pitches(invert(m, 64)), [68, 66, 64, 61])
  const retro = retrograde(m)
  assert.deepEqual(pitches(retro), [67, 64, 62, 60])
  assert.deepEqual(retro.notes.map((n) => [n.beat, n.beats]), [[0, 1], [1, 2], [3, 1], [4, 1]]) // rhythm reversed with it
  assert.deepEqual(stretch(m, 2).notes.map((n) => [n.beat, n.beats]), [[0, 2], [2, 2], [4, 4], [8, 2]])
  assert.deepEqual(stretch(m, 0.5).notes.map((n) => [n.beat, n.beats]), [[0, 0.5], [0.5, 0.5], [1, 1], [2, 0.5]])
  assert.throws(() => stretch(m, 0))
  const rr = reverseRhythm(m)
  assert.deepEqual(pitches(rr), [60, 62, 64, 67]) // same notes in the same order
  assert.deepEqual(analyzeMelody(rr).rhythm.ratios, [1, 2, 1, 1]) // 1:1:2:1 -> 1:2:1:1 as in the brief
  const rep = repeat(m, 3)
  assert.equal(rep.notes.length, 12)
  assert.equal(rep.notes[4].beat, 8) // 5 beats long: next copy on the bar after (beat 8)
  assert.equal(rep.notes[8].beat, 16)
  // a transformed melody is its own baseline and consistent in seconds and Hz
  const t = transpose(m, 12)
  close(t.notes[0].hz, midiToHz(72), 1e-9)
  close(t.notes[1].start, 0.5)
  assert.deepEqual(t.notes[2].orig, { beat: t.notes[2].beat, beats: t.notes[2].beats, pitch: t.notes[2].pitch })
  assert.deepEqual(m.notes.map((n) => Math.round(n.pitch)), [60, 62, 64, 67]) // source untouched
  assert.deepEqual(transpose(toMelody([], 120), 3).notes, [])
})

test('rhythm ratio operations from the brief: x2, /2, reverse', () => {
  const r = [1, 1, 2, 1]
  assert.deepEqual(rhythmOps.multiply(r, 2), [2, 2, 4, 2])
  assert.deepEqual(rhythmOps.divide(r, 2), [0.5, 0.5, 1, 0.5])
  assert.deepEqual(rhythmOps.reverse(r), [1, 2, 1, 1])
  assert.deepEqual(r, [1, 1, 2, 1]) // not mutated
})

test('patterns: exact repeats, transposed repeats, repeated rhythm', () => {
  // C D E | C D E | G  : the motif C D E appears twice, exactly
  const exact = toMelody(seq([60, 62, 64, 60, 62, 64, 67], [1, 1, 1, 1, 1, 1, 2]), 120)
  const pe = findPatterns(exact)
  assert.equal(pe[0].kind, 'exact')
  assert.deepEqual(pe[0].positions, [0, 3])
  assert.equal(pe[0].length, 3)
  assert.deepEqual(pe[0].intervals, [2, 2])
  assert.deepEqual(pe[0].shifts, [0, 0])
  // C D E | D E F# : the same shape a step higher is still an exact repeat, transposed by 2 semitones
  const trans = toMelody(seq([60, 62, 64, 62, 64, 66, 55], [1, 1, 1, 1, 1, 1, 2]), 120)
  const pt = findPatterns(trans)[0]
  assert.equal(pt.kind, 'exact')
  assert.deepEqual(pt.positions, [0, 3])
  assert.deepEqual(pt.shifts, [0, 2])
  // same notes with a different rhythm: the melody repeats, the rhythm does not
  const mel = toMelody(seq([60, 62, 64, 60, 62, 64, 67], [1, 1, 1, 1, 0.5, 0.5, 2]), 120)
  const pm = findPatterns(mel).find((p) => p.kind === 'melodic')!
  assert.deepEqual(pm.positions, [0, 3])
  assert.equal(findPatterns(mel).some((p) => p.kind === 'exact' && p.length === 3), false)
  // same rhythm, different notes, different shapes: only the rhythm repeats
  const rhy = toMelody(seq([60, 67, 62, 59, 71, 55], [1, 0.5, 0.5, 1, 0.5, 0.5]), 120)
  const pr = findPatterns(rhy).find((p) => p.kind === 'rhythmic')!
  assert.deepEqual(pr.positions, [0, 3])
  assert.deepEqual(pr.durations, [16, 8, 8])
  assert.equal(findPatterns(rhy).some((p) => p.kind === 'exact'), false)
  // nothing repeats; too short; overlapping occurrences are not double counted
  assert.deepEqual(findPatterns(toMelody(seq([60, 62, 65, 69, 74], [1, 1, 1, 1, 1]), 120)).filter((p) => p.kind !== 'rhythmic'), [])
  assert.deepEqual(findPatterns(toMelody(seq([60, 62], [1, 1]), 120)), [])
  const run = toMelody(seq([60, 60, 60, 60, 60, 60], [1, 1, 1, 1, 1, 1]), 120)
  for (const p of findPatterns(run)) {
    const spans = p.positions.map((s) => [s, s + p.length - 1])
    for (let i = 1; i < spans.length; i++) assert.ok(spans[i][0] > spans[i - 1][1])
  }
})
