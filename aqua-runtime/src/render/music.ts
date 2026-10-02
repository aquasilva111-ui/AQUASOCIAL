import type { Song, Track } from '../adapters/music'
import type { Pcm } from './wav'

const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12)
const dbToGain = (db: number) => Math.pow(10, db / 20)

type Voice = (phase: number) => number
const VOICES: Record<Track['instrument'], { wave: Voice; attack: number; release: number }> = {
  synth: { wave: (p) => 2 * (p - Math.floor(p + 0.5)), attack: 0.01, release: 0.12 }, // saw
  pluck: { wave: (p) => Math.sin(2 * Math.PI * p), attack: 0.002, release: 0.35 }, // sine, long tail
  membrane: { wave: (p) => Math.sin(2 * Math.PI * p), attack: 0.001, release: 0.2 },
  sampler: { wave: (p) => (p % 1 < 0.5 ? 1 : -1), attack: 0.005, release: 0.1 } // placeholder: square
}

/**
 * Offline render of a Song to mono PCM with simple oscillators and an attack/release envelope.
 * It is the headless export path (and what tests check); live playback and nicer instruments
 * are Tone.js in the UI. Notes are summed and the mix is limited to avoid clipping.
 */
export function renderSong(song: Song, sampleRate = 44100): Pcm {
  const secPerBeat = 60 / song.bpm
  const lastEnd = song.tracks.flatMap((t) => t.notes).reduce((m, n) => Math.max(m, (n.beat + n.length) * secPerBeat), 0)
  const length = Math.max(song.bars * song.beatsPerBar * secPerBeat, lastEnd)
  const frames = Math.ceil((length + 0.5) * sampleRate)
  const mix = new Float32Array(frames)

  for (const t of song.tracks) {
    if (t.muted) continue
    const v = VOICES[t.instrument]
    const trackGain = dbToGain(t.volumeDb)
    for (const n of t.notes) {
      const start = Math.floor(n.beat * secPerBeat * sampleRate)
      const hold = Math.floor(n.length * secPerBeat * sampleRate)
      const rel = Math.floor(v.release * sampleRate)
      const att = Math.max(1, Math.floor(v.attack * sampleRate))
      const hz = midiToHz(n.pitch)
      for (let i = 0; i < hold + rel && start + i < frames; i++) {
        const env = Math.min(1, i / att) * (i < hold ? 1 : 1 - (i - hold) / rel)
        mix[start + i] += v.wave((hz * i) / sampleRate) * env * n.velocity * trackGain * 0.25
      }
    }
  }
  let peak = 0
  for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(mix[i]))
  if (peak > 0.98) for (let i = 0; i < frames; i++) mix[i] /= peak / 0.98
  return { sampleRate, channels: [mix] }
}
