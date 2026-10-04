import { toMelody, type Melody, type RawNote } from './melody'
import { hzToMidi, midiToHz } from './pitch'

/** One analysis frame of a recording. `hz` is 0 when the frame is not a pitched sound. */
export interface PitchFrame {
  /** Seconds at the centre of the frame. */
  t: number
  hz: number
  /** 0..1, how periodic the sound is (1 - the YIN aperiodicity). */
  confidence: number
  rms: number
}

export interface YinOptions {
  /** Analysis window in samples (the lowest detectable pitch needs about two periods). */
  frameSize?: number
  /** Samples between frames. */
  hop?: number
  minHz?: number
  maxHz?: number
  /** YIN's absolute threshold: lower is stricter. 0.1–0.2 is the usual range. */
  threshold?: number
  /** Frames quieter than this (RMS, 0..1) are treated as silence. */
  silenceRms?: number
}

const DEFAULT_YIN = { minHz: 70, maxHz: 1000, threshold: 0.15, silenceRms: 0.01 }

/** About 46 ms windows (2048 samples at 44.1 kHz) and a hop of a quarter window, whatever the sample rate. */
const frameFor = (sampleRate: number): number => Math.pow(2, Math.round(Math.log2(sampleRate * 0.0464)))

const rmsOf = (x: Float32Array, from: number, len: number): number => {
  let s = 0
  for (let i = from; i < from + len; i++) s += x[i] * x[i]
  return Math.sqrt(s / len)
}

/**
 * YIN (de Cheveigné & Kawahara, 2002) on one frame: difference function, cumulative-mean
 * normalisation, absolute threshold, parabolic refinement. Returns hz 0 when nothing periodic is found.
 */
export function yinFrame(x: Float32Array, from: number, sampleRate: number, o: Required<YinOptions>): { hz: number; confidence: number } {
  const W = Math.floor(o.frameSize / 2)
  const tauMax = Math.min(W - 1, Math.floor(sampleRate / o.minHz))
  const tauMin = Math.max(2, Math.floor(sampleRate / o.maxHz))
  const d = new Float32Array(tauMax + 1)
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0
    for (let j = 0; j < W; j++) {
      const diff = x[from + j] - x[from + j + tau]
      sum += diff * diff
    }
    d[tau] = sum
  }
  // cumulative mean normalised difference
  let running = 0
  d[0] = 1
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau]
    d[tau] = running > 0 ? (d[tau] * tau) / running : 1
  }
  // first dip under the threshold, followed down to its local minimum
  let tau = -1
  for (let t = tauMin; t <= tauMax; t++) {
    if (d[t] < o.threshold) {
      while (t + 1 <= tauMax && d[t + 1] < d[t]) t++
      tau = t
      break
    }
  }
  if (tau < 0) return { hz: 0, confidence: 0 }
  // parabolic interpolation around the minimum
  const a = d[tau - 1]
  const b = d[tau]
  const c = tau + 1 <= tauMax ? d[tau + 1] : d[tau]
  const denom = a + c - 2 * b
  const refined = denom !== 0 ? tau + (a - c) / (2 * denom) : tau
  return { hz: sampleRate / refined, confidence: Math.max(0, Math.min(1, 1 - b)) }
}

/** Pitch of every frame of a mono recording. */
export function trackPitch(samples: Float32Array, sampleRate: number, opts: YinOptions = {}): PitchFrame[] {
  const frameSize = opts.frameSize ?? frameFor(sampleRate)
  const o: Required<YinOptions> = { ...DEFAULT_YIN, frameSize, hop: opts.hop ?? frameSize / 4, ...opts }
  o.frameSize = frameSize
  o.hop = opts.hop ?? frameSize / 4
  const need = o.frameSize
  // Half a window of silence on both sides, so the first and last notes are measured over their full length.
  const pad = need / 2
  const x = new Float32Array(samples.length + need)
  x.set(samples, pad)
  const frames: PitchFrame[] = []
  for (let from = 0; from + need <= x.length; from += o.hop) {
    const rms = rmsOf(x, from, need)
    const t = Math.max(0, (from + need / 2 - pad) / sampleRate)
    if (rms < o.silenceRms) {
      frames.push({ t, hz: 0, confidence: 0, rms })
      continue
    }
    const { hz, confidence } = yinFrame(x, from, sampleRate, o)
    frames.push({ t, hz, confidence, rms })
  }
  return frames
}

export interface SegmentOptions {
  /** Frames below this confidence are not part of a note. */
  minConfidence?: number
  /** A pitch this far (cents) from the current note, held for `changeFrames`, starts a new note. */
  splitCents?: number
  changeFrames?: number
  /** Unvoiced stretch (seconds) that ends a note; shorter ones are bridged. */
  maxGap?: number
  /** Shortest note kept, seconds. */
  minNote?: number
  /** A dip of the loudness below this share of the note's peak, then recovery, re-articulates the same pitch ("na na"). */
  dipRatio?: number
  /** Frame hop in seconds, to give every note its full length (taken from the frames when omitted). */
  hopSeconds?: number
}

const DEFAULT_SEG: Required<Omit<SegmentOptions, 'hopSeconds'>> = { minConfidence: 0.6, splitCents: 70, changeFrames: 3, maxGap: 0.06, minNote: 0.07, dipRatio: 0.4 }

const median = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Turns frames into notes: a voiced run is one note until the pitch moves by `splitCents` (and stays
 * there), the sound stops for longer than `maxGap`, or the loudness dips and returns. The note's
 * pitch is the median of its frames, so vibrato and scoops average out.
 */
export function segmentNotes(frames: PitchFrame[], opts: SegmentOptions = {}): RawNote[] {
  const o = { ...DEFAULT_SEG, ...opts }
  if (frames.length < 2) return []
  const hop = opts.hopSeconds ?? frames[1].t - frames[0].t
  const peakRms = Math.max(...frames.map((f) => f.rms), 1e-9)
  const voiced = frames.map((f) => (f.hz > 0 && f.confidence >= o.minConfidence ? hzToMidi(f.hz) : NaN))
  // 5-frame median on the pitch track removes one-frame octave jumps and spikes
  const smooth = voiced.map((v, i) => {
    if (Number.isNaN(v)) return NaN
    const w = voiced.slice(Math.max(0, i - 2), i + 3).filter((x) => !Number.isNaN(x))
    return median(w)
  })

  const notes: RawNote[] = []
  let cur: { idx: number[]; peak: number; dipped: boolean; dipMin: number } | null = null
  let gap = 0
  let pending: number[] = [] // consecutive frames that disagree with the current note's pitch

  const close = () => {
    if (!cur) return
    const idx = cur.idx
    const dur = (idx[idx.length - 1] - idx[0] + 1) * hop
    if (dur >= o.minNote) {
      const midi = median(idx.map((i) => smooth[i]))
      const rms = idx.reduce((s, i) => s + frames[i].rms, 0) / idx.length
      notes.push({ start: Math.max(0, frames[idx[0]].t - hop / 2), duration: dur, hz: midiToHz(midi), velocity: Math.max(0.2, Math.min(1, rms / peakRms)) })
    }
    cur = null
    pending = []
  }
  const open = (i: number) => {
    cur = { idx: [i], peak: frames[i].rms, dipped: false, dipMin: frames[i].rms }
    pending = []
  }

  for (let i = 0; i < frames.length; i++) {
    const v = smooth[i]
    if (Number.isNaN(v)) {
      gap += hop
      if (cur && gap > o.maxGap) close()
      continue
    }
    if (!cur) {
      open(i)
      gap = 0
      continue
    }
    gap = 0
    const ref = median(cur.idx.slice(-8).map((k) => smooth[k]))
    // pitch moved away and stayed there: a new note, starting where it began to move
    if (Math.abs(v - ref) * 100 > o.splitCents) {
      pending.push(i)
      if (pending.length >= o.changeFrames) {
        const start = pending[0]
        cur.idx = cur.idx.filter((k) => k < start)
        close()
        cur = { idx: [...pending], peak: Math.max(...pending.map((k) => frames[k].rms)), dipped: false, dipMin: frames[i].rms }
        pending = []
      }
      continue
    }
    pending = []
    // same pitch, but the loudness dropped and came back: the singer said the syllable again
    const r = frames[i].rms
    if (r < cur.peak * o.dipRatio) {
      cur.dipped = true
      cur.dipMin = Math.min(cur.dipMin, r)
    } else if (cur.dipped && r > cur.dipMin * 1.6 && r > cur.peak * 0.55) {
      const dipFrame: number = cur.idx.reduce((best: number, k: number) => (frames[k].rms < frames[best].rms ? k : best), cur.idx[0])
      const keep = cur.idx.filter((k) => k < dipFrame)
      const rest: number[] = [...cur.idx.filter((k) => k >= dipFrame), i]
      cur.idx = keep.length ? keep : [dipFrame]
      close()
      cur = { idx: rest, peak: r, dipped: false, dipMin: r }
      continue
    }
    cur.peak = Math.max(cur.peak, r)
    cur.idx.push(i)
  }
  close()
  return notes
}

export interface TakeOptions extends YinOptions, SegmentOptions {
  bpm?: number
  beatsPerBar?: number
}

/** From a mono recording to the original (sung) melody. Pass `bpm` or let `estimateBpm` guess it. */
export function melodyFromAudio(samples: Float32Array, sampleRate: number, opts: TakeOptions = {}): { melody: Melody; frames: PitchFrame[]; raw: RawNote[] } {
  const frames = trackPitch(samples, sampleRate, opts)
  const hop = opts.hop ?? (opts.frameSize ?? frameFor(sampleRate)) / 4
  const raw = segmentNotes(frames, { ...opts, hopSeconds: hop / sampleRate })
  const bpm = opts.bpm ?? estimateBpm(raw)
  return { melody: toMelody(raw, bpm, opts.beatsPerBar ?? 4), frames, raw }
}

/**
 * Tempo guess from note onsets: the BPM (60–160) whose eighth-note grid the onsets sit closest to.
 * A guess, nothing more: sung material is free in time, so the UI should always let the user type it.
 */
export function estimateBpm(raw: RawNote[], min = 60, max = 160): number {
  if (raw.length < 2) return 100
  let best = 100
  let bestScore = -Infinity
  for (let bpm = min; bpm <= max; bpm += 0.5) {
    const spb = 60 / bpm
    let score = 0
    for (const n of raw) score += Math.cos(2 * Math.PI * (n.start / spb) * 2) // eighth-note grid
    score /= raw.length
    // tiny pull toward 100 BPM so equally good tempi (e.g. 70 and 140) pick the more natural one
    score -= Math.abs(bpm - 100) * 1e-4
    if (score > bestScore) (best = bpm), (bestScore = score)
  }
  return best
}
