import { Midi } from '@tonejs/midi'
import type { Song, Track, Note } from 'aqua-runtime/src/adapters/music'

/**
 * MIDI abstraction for AQUA Music Studio.
 * The AQUA Song model remains the source of truth.
 * These types and functions convert to/from MIDI files.
 */

export type MidiEventType = 'noteOn' | 'noteOff' | 'pitchBend' | 'controlChange' | 'programChange'

export interface MidiEvent {
  type: MidiEventType
  time: number // seconds
  channel: number
  pitch?: number
  velocity?: number
  value?: number
  controller?: number
}

const INSTRUMENT_MAP: Record<string, number> = {
  synth: 80,      // Lead 1 (square)
  piano: 0,
  bass: 33,       // Electric Bass
  pluck: 45,      // Pizzicato Strings
  pad: 88,        // Pad 1 (new age)
  lead: 81,
  drums: 0,       // channel 10 in GM, but we map later
  membrane: 118,  // Synth Drum
  sampler: 81,
}

/**
 * Convert an AQUA Song to a MIDI file (Uint8Array).
 */
export function songToMidi(song: Song): Uint8Array {
  const midi = new Midi()
  midi.header.tempos.push({ ticks: 0, bpm: song.bpm })
  midi.header.timeSignatures.push({
    ticks: 0,
    timeSignature: [song.beatsPerBar, 4],
  })

  const secPerBeat = 60 / song.bpm

  for (const track of song.tracks) {
    const mt = midi.addTrack()
    mt.name = track.name
    mt.instrument.number = INSTRUMENT_MAP[track.instrument] ?? 80
    mt.channel = track.instrument === 'membrane' ? 9 : 0

    for (const note of track.notes) {
      mt.addNote({
        midi: note.pitch,
        time: note.beat * secPerBeat,
        duration: Math.max(0.05, note.length * secPerBeat),
        velocity: note.velocity,
      })
    }
  }

  return new Uint8Array(midi.toArray())
}

/**
 * Convert a MIDI file (ArrayBuffer or Uint8Array) into an AQUA Song.
 */
export function midiToSong(data: ArrayBuffer | Uint8Array, title = 'Imported MIDI'): Song {
  const midi = new Midi(data)
  const bpm = midi.header.tempos[0]?.bpm ?? 120
  const beatsPerBar = midi.header.timeSignatures[0]?.timeSignature[0] ?? 4
  const secPerBeat = 60 / bpm

  const tracks: Track[] = midi.tracks.map((mt, i) => {
    const notes: Note[] = mt.notes.map((n) => ({
      beat: n.time / secPerBeat,
      pitch: n.midi,
      length: Math.max(0.0625, n.duration / secPerBeat),
      velocity: n.velocity,
    }))

    // Guess instrument from GM number
    let instrument: Track['instrument'] = 'synth'
    const num = mt.instrument.number
    if (num === 0) instrument = 'piano' as any
    else if (num >= 32 && num <= 39) instrument = 'bass' as any
    else if (num === 45) instrument = 'pluck'
    else if (num >= 88 && num <= 95) instrument = 'pad' as any
    else if (mt.channel === 9) instrument = 'membrane'

    return {
      id: `trk_midi_${i}`,
      name: mt.name || `Track ${i + 1}`,
      instrument,
      volumeDb: 0,
      muted: false,
      notes,
    }
  })

  // Estimate length in bars
  const maxBeat = tracks.flatMap((t) => t.notes).reduce((m, n) => Math.max(m, n.beat + n.length), 0)
  const bars = Math.max(4, Math.ceil(maxBeat / beatsPerBar))

  return {
    title: midi.header.name || title,
    bpm,
    beatsPerBar,
    bars,
    tracks,
  }
}

/**
 * Optional Web MIDI input helper.
 * Calls `onNote` when a note-on arrives.
 * Returns a cleanup function.
 */
export async function startMidiInput(
  onNote: (pitch: number, velocity: number, channel: number) => void,
): Promise<() => void> {
  if (!navigator.requestMIDIAccess) {
    throw new Error('Web MIDI API not available')
  }
  const access = await navigator.requestMIDIAccess()
  const inputs = Array.from(access.inputs.values())

  const handler = (e: MIDIMessageEvent) => {
    const data = e.data; if (!data || data.length < 3) return; const [status, data1, data2] = data
    const type = status & 0xf0
    const channel = status & 0x0f
    if (type === 0x90 && data2 > 0) {
      // note on
      onNote(data1, data2 / 127, channel)
    }
  }

  for (const input of inputs) {
    input.onmidimessage = handler
  }

  return () => {
    for (const input of inputs) input.onmidimessage = null
  }
}
