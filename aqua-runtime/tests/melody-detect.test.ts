import assert from 'node:assert/strict'
import { test } from 'node:test'

import { analyzeMelody, estimateBpm, interpret, melodyFromAudio, midiToHz, noteName, segmentNotes, trackPitch, centsOff, type RawNote } from '../src/index'

const SR = 22050

/** Deterministic noise so failures are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1
}

interface Syn {
  /** Fundamental in Hz; 0 = silence. */
  hz: number
  dur: number
  /** Vibrato depth in cents (5.5 Hz). */
  vib?: number
  /** Amplitude 0..1. */
  amp?: number
  /** Dip the loudness to this share in the middle 25% (re-articulation). */
  dip?: number
}

/** A voice-like signal: harmonics with a strong 2nd partial, vibrato, soft attack/release, noise. */
function voice(parts: Syn[], noise = 0.01, sr = SR): Float32Array {
  const total = parts.reduce((n, p) => n + Math.round(p.dur * sr), 0)
  const out = new Float32Array(total)
  const rand = rng(7)
  let at = 0
  let phase = 0
  for (const p of parts) {
    const n = Math.round(p.dur * sr)
    for (let i = 0; i < n; i++) {
      let v = 0
      if (p.hz > 0) {
        const t = i / sr
        const cents = (p.vib ?? 0) * Math.sin(2 * Math.PI * 5.5 * t)
        phase += (2 * Math.PI * p.hz * Math.pow(2, cents / 1200)) / sr
        const edge = Math.min(1, t / 0.02, (p.dur - t) / 0.02) // 20 ms attack/release
        let a = (p.amp ?? 0.6) * edge
        if (p.dip !== undefined) {
          const x = i / n
          if (x > 0.4 && x < 0.6) a *= p.dip + (1 - p.dip) * Math.abs(x - 0.5) * 10 // V-shaped dip
        }
        v = a * (Math.sin(phase) + 0.7 * Math.sin(2 * phase) + 0.4 * Math.sin(3 * phase) + 0.2 * Math.sin(4 * phase)) / 2.3
      }
      out[at + i] = v + noise * rand()
    }
    at += n
  }
  return out
}

const hz = midiToHz
const close = (a: number, b: number, eps: number, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} !~ ${b} (±${eps})`)
const centsBetween = (a: number, b: number) => 1200 * Math.log2(a / b)

test('YIN finds the fundamental of pure and harmonic-rich tones across the vocal range', () => {
  for (const f of [100, 164.8, 261.63, 440, 659.25, 880]) {
    const frames = trackPitch(voice([{ hz: f, dur: 0.5, amp: 0.5 }], 0), SR)
    const mid = frames.filter((x) => x.t > 0.15 && x.t < 0.35 && x.hz > 0)
    assert.ok(mid.length > 3, `voiced frames at ${f}`)
    for (const fr of mid) assert.ok(Math.abs(centsBetween(fr.hz, f)) < 10, `${f} Hz detected as ${fr.hz.toFixed(2)}`)
  }
  // fundamental weaker than the 2nd harmonic must not be read an octave up
  const n = Math.round(0.5 * SR)
  const weak = new Float32Array(n)
  for (let i = 0; i < n; i++) weak[i] = 0.25 * Math.sin((2 * Math.PI * 200 * i) / SR) + 0.6 * Math.sin((2 * Math.PI * 400 * i) / SR) + 0.3 * Math.sin((2 * Math.PI * 600 * i) / SR)
  const f = trackPitch(weak, SR).filter((x) => x.hz > 0)
  assert.ok(f.length > 5)
  for (const fr of f) assert.ok(Math.abs(centsBetween(fr.hz, 200)) < 15, `weak fundamental read as ${fr.hz}`)
})

test('silence and noise are not pitched; frames carry time and loudness', () => {
  const silence = trackPitch(new Float32Array(SR), SR)
  assert.ok(silence.every((f) => f.hz === 0 && f.rms < 1e-6))
  const rand = rng(3)
  const noise = new Float32Array(SR)
  for (let i = 0; i < noise.length; i++) noise[i] = 0.3 * rand()
  const nf = trackPitch(noise, SR)
  assert.ok(nf.filter((f) => f.hz > 0 && f.confidence >= 0.6).length / nf.length < 0.05, 'white noise is almost never "pitched"')
  assert.deepEqual(segmentNotes(nf, { hopSeconds: 256 / SR }), [])
  const frames = trackPitch(voice([{ hz: 300, dur: 1 }]), SR)
  close(frames[1].t - frames[0].t, 256 / SR, 1e-9) // 1024-sample windows, hop 256 at 22.05 kHz
  assert.ok(frames.every((f) => f.t >= 0 && f.t <= 1.0001))
  assert.ok(frames[frames.length - 1].t > 0.95) // the last frame reaches the end of the recording
  const tiny = trackPitch(new Float32Array(100), SR) // shorter than one window: silent frames, never a crash
  assert.ok(tiny.every((f) => f.hz === 0))
  assert.deepEqual(segmentNotes([]), [])
})

test('a sung phrase with vibrato and breaths becomes the right notes', () => {
  // C4 D4 E4 G4, 0.4 s each, 60 ms of silence between, ±25 cents vibrato
  const names = [60, 62, 64, 67]
  const audio = voice(names.flatMap((m) => [{ hz: hz(m), dur: 0.4, vib: 25 }, { hz: 0, dur: 0.06 }]))
  const raw = segmentNotes(trackPitch(audio, SR), { hopSeconds: 256 / SR })
  assert.equal(raw.length, 4)
  raw.forEach((n, i) => {
    assert.equal(noteName(Math.round(69 + 12 * Math.log2(n.hz / 440))), noteName(names[i]))
    assert.ok(Math.abs(centsBetween(n.hz, hz(names[i]))) < 12, `note ${i} is ${centsBetween(n.hz, hz(names[i])).toFixed(1)} cents off`)
    close(n.duration, 0.4, 0.05, `duration ${i}`)
    close(n.start, i * 0.46, 0.05, `start ${i}`)
    assert.ok(n.velocity >= 0.2 && n.velocity <= 1)
  })
})

test('the brief: A3 420 ms, C4 180 ms, D4 190 ms, E4 610 ms, D4 220 ms, sung legato', () => {
  const plan = [[57, 0.42], [60, 0.18], [62, 0.19], [64, 0.61], [62, 0.22]] as const
  const audio = voice(plan.map(([m, d]) => ({ hz: hz(m), dur: d, vib: 12 })))
  const { melody, raw } = melodyFromAudio(audio, SR, { bpm: 120 })
  assert.deepEqual(analyzeMelody(melody).names, ['A3', 'C4', 'D4', 'E4', 'D4'])
  raw.forEach((n, i) => close(n.duration, plan[i][1], 0.06, `duration of note ${i}`))
  // legato: each note starts where the previous one ended
  for (let i = 1; i < raw.length; i++) close(raw[i].start, raw[i - 1].start + raw[i - 1].duration, 0.05)
  assert.deepEqual(analyzeMelody(melody).intervals.map((x) => x.semitones), [3, 2, 2, -2])
})

test('out of tune is preserved, then corrected on request (436.8 Hz sung for A4)', () => {
  const audio = voice([{ hz: 436.8, dur: 0.6, vib: 5 }])
  const { melody } = melodyFromAudio(audio, SR, { bpm: 120 })
  assert.equal(melody.notes.length, 1)
  close(melody.notes[0].hz, 436.8, 3)
  close(centsOff(melody.notes[0].hz), -12.6, 5)
  const fixed = interpret(melody, { pitchCorrection: 1 })
  close(fixed.notes[0].pitch, 69, 1e-9)
  close(fixed.notes[0].orig.pitch, melody.notes[0].midi, 1e-9) // the sung pitch is still there
})

test('the same pitch sung twice with a dip in loudness is two notes; a steady note is one', () => {
  const twice = segmentNotes(trackPitch(voice([{ hz: hz(62), dur: 0.9, dip: 0.05 }]), SR), { hopSeconds: 256 / SR })
  assert.equal(twice.length, 2, `got ${twice.length}`)
  close(centsBetween(twice[0].hz, twice[1].hz), 0, 15)
  const steady = segmentNotes(trackPitch(voice([{ hz: hz(62), dur: 0.9, vib: 20 }]), SR), { hopSeconds: 256 / SR })
  assert.equal(steady.length, 1)
  close(steady[0].duration, 0.9, 0.06)
})

test('noise on top of the voice does not break it; clicks shorter than a note are dropped', () => {
  const noisy = voice([{ hz: hz(60), dur: 0.5 }, { hz: 0, dur: 0.05 }, { hz: hz(65), dur: 0.5 }], 0.08)
  const raw = segmentNotes(trackPitch(noisy, SR), { hopSeconds: 256 / SR })
  assert.equal(raw.length, 2)
  assert.ok(Math.abs(centsBetween(raw[0].hz, hz(60))) < 20 && Math.abs(centsBetween(raw[1].hz, hz(65))) < 20)
  // a 30 ms blip of pitch between silences is below minNote
  const blip = voice([{ hz: 0, dur: 0.2 }, { hz: hz(70), dur: 0.03 }, { hz: 0, dur: 0.2 }])
  assert.deepEqual(segmentNotes(trackPitch(blip, SR), { hopSeconds: 256 / SR }), [])
})

test('works at other sample rates and at CD quality', () => {
  for (const sr of [16000, 44100, 48000]) {
    const audio = voice([{ hz: hz(57), dur: 0.4, vib: 15 }, { hz: 0, dur: 0.06 }, { hz: hz(64), dur: 0.4, vib: 15 }], 0.01, sr)
    const { raw } = melodyFromAudio(audio, sr, { bpm: 100 })
    assert.equal(raw.length, 2, `sample rate ${sr}`)
    assert.ok(Math.abs(centsBetween(raw[0].hz, hz(57))) < 12 && Math.abs(centsBetween(raw[1].hz, hz(64))) < 12, `sample rate ${sr}`)
  }
})

test('estimateBpm: onsets on a 100 BPM grid; degenerate takes fall back', () => {
  const grid = (bpm: number, beats: number[]): RawNote[] => beats.map((b) => ({ start: (b * 60) / bpm, duration: 0.2, hz: 440, velocity: 1 }))
  close(estimateBpm(grid(100, [0, 1, 1.5, 2, 3, 3.5, 4, 5])), 100, 3)
  close(estimateBpm(grid(84, [0, 1, 2, 2.5, 3, 4, 5, 5.5])), 84, 3)
  close(estimateBpm(grid(132, [0, 1, 2, 3, 3.5, 4, 5, 6])), 132, 3)
  assert.equal(estimateBpm([]), 100)
  assert.equal(estimateBpm(grid(120, [0])), 100)
})

test('analysis of a minute of audio is fast enough to run live in a browser', () => {
  const audio = voice(Array.from({ length: 30 }, (_, i) => [{ hz: hz(60 + (i % 5)), dur: 1.8, vib: 15 }, { hz: 0, dur: 0.2 }]).flat())
  const t0 = performance.now()
  const { raw } = melodyFromAudio(audio, SR, { bpm: 100 })
  const ms = performance.now() - t0
  assert.equal(raw.length, 30)
  assert.ok(ms < 20000, `took ${Math.round(ms)} ms for 60 s of audio`)
  console.log(`  60 s of audio analysed in ${Math.round(ms)} ms`)
})
