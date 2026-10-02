import { renderSong } from '../render/music'
import { encodeWav } from '../render/wav'
import type { ToolAdapter } from '../types'
import { jsonSession, parseJson, type JsonSession } from './json'

/**
 * Song model for the Music Studio. Plain data on purpose: playback and the piano roll
 * (Tone.js, UI layer) read this; the runtime stores, versions and undoes it.
 */
export interface Note {
  /** Position in beats from the start. */
  beat: number
  /** MIDI pitch, 60 = C4. */
  pitch: number
  /** Length in beats. */
  length: number
  velocity: number
}

export interface Track {
  id: string
  name: string
  instrument: 'synth' | 'pluck' | 'membrane' | 'sampler'
  volumeDb: number
  muted: boolean
  notes: Note[]
}

export interface Song {
  title: string
  bpm: number
  beatsPerBar: number
  bars: number
  tracks: Track[]
}

export type MusicSession = JsonSession<Song> & {
  addTrack(name: string, instrument?: Track['instrument']): string
  addNote(trackId: string, note: Omit<Note, 'velocity'> & { velocity?: number }): void
  /** Song length in seconds. */
  duration(): number
}

export const defaultSong = (title: string): Song => ({ title, bpm: 120, beatsPerBar: 4, bars: 8, tracks: [] })

export interface MusicAdapterOptions {
  /** Replace the built-in WAV renderer (e.g. Tone.js `Offline` with better instruments). */
  renderAudio?: (song: Song) => Promise<Uint8Array>
  mime?: string
}

export function musicAdapter(opts: MusicAdapterOptions = {}): ToolAdapter {
  const make = (song: Song): MusicSession => {
    const s = jsonSession(song, {
      async export(capability) {
        if (capability !== 'audio') return undefined
        if (opts.renderAudio) return { bytes: await opts.renderAudio(s.state), mime: opts.mime ?? 'audio/wav' }
        return { bytes: encodeWav(renderSong(s.state)), mime: 'audio/wav' }
      }
    }) as MusicSession
    s.addTrack = (name, instrument = 'synth') => {
      const id = `trk_${Math.random().toString(36).slice(2, 8)}`
      s.update((d) => void d.tracks.push({ id, name, instrument, volumeDb: 0, muted: false, notes: [] }))
      return id
    }
    s.addNote = (trackId, n) =>
      s.update((d) => {
        const t = d.tracks.find((x) => x.id === trackId)
        if (!t) throw new Error(`Track not found: ${trackId}`)
        t.notes.push({ velocity: 0.8, ...n })
      })
    s.duration = () => ((s.state.bars * s.state.beatsPerBar) / s.state.bpm) * 60
    return s
  }
  return { kind: 'music', mime: 'application/vnd.aqua.song+json', create: (n) => make(defaultSong(n)), open: (b) => make(parseJson<Song>(b)) }
}
