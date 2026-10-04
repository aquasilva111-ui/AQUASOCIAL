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
  /** When any track is soloed, only soloed tracks are heard. */
  solo?: boolean
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
  /** Edits one note; `index` is its position in the track's `notes`. */
  updateNote(trackId: string, index: number, patch: Partial<Note>): void
  removeNote(trackId: string, index: number): void
  removeTrack(trackId: string): void
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
    const track = (d: Song, id: string) => {
      const t = d.tracks.find((x) => x.id === id)
      if (!t) throw new Error(`Track not found: ${id}`)
      return t
    }
    s.updateNote = (trackId, index, patch) =>
      s.update((d) => {
        const n = track(d, trackId).notes[index]
        if (!n) throw new Error(`Note not found: ${index}`)
        Object.assign(n, patch)
        n.beat = Math.max(0, n.beat)
        n.length = Math.max(0.0625, n.length)
        n.pitch = Math.max(0, Math.min(127, Math.round(n.pitch)))
        n.velocity = Math.max(0.05, Math.min(1, n.velocity))
      })
    s.removeNote = (trackId, index) =>
      s.update((d) => {
        const t = track(d, trackId)
        if (!t.notes[index]) throw new Error(`Note not found: ${index}`)
        t.notes.splice(index, 1)
      })
    s.removeTrack = (trackId) => s.update((d) => void (d.tracks = d.tracks.filter((t) => t.id !== trackId)))
    s.duration = () => ((s.state.bars * s.state.beatsPerBar) / s.state.bpm) * 60
    return s
  }
  return { kind: 'music', mime: 'application/vnd.aqua.song+json', create: (n) => make(defaultSong(n)), open: (b) => make(parseJson<Song>(b)) }
}
