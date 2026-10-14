import { useEffect, useRef, useState, useCallback } from 'react'
import * as Tone from 'tone'
import type { Song, Track, Note } from 'aqua-runtime/src/adapters/music'
import { engine, type InstrumentInstance } from './instrument-engine'

export interface LoopRegion {
  start: number // beats
  end: number // beats
  enabled: boolean
}

export interface TonePlayerState {
  playing: boolean
  position: number // seconds
  bpm: number
  loop: LoopRegion | null
}

/**
 * Live playback via Tone.js Transport.
 * The Song model is the source of truth; this only schedules.
 * Notes are scheduled relative to Transport time.
 */
export function useTonePlayer(song: Song | null | undefined) {
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [loop, setLoop] = useState<LoopRegion | null>(null)
  const instruments = useRef<Map<string, InstrumentInstance>>(new Map())
  const part = useRef<Tone.Part | null>(null)
  const raf = useRef(0)

  // Sync BPM
  useEffect(() => {
    if (song) Tone.Transport.bpm.value = song.bpm
  }, [song?.bpm])

  // Rebuild schedule when song or loop changes
  const schedule = useCallback(() => {
    part.current?.dispose()
    part.current = null
    if (!song) return

    // Ensure instruments exist for each track
    for (const track of song.tracks) {
      if (!instruments.current.has(track.id)) {
        const inst = engine.create(track.instrument || 'synth')
        instruments.current.set(track.id, inst)
      }
    }
    // Clean removed tracks
    for (const id of [...instruments.current.keys()]) {
      if (!song.tracks.find((t) => t.id === id)) {
        instruments.current.get(id)?.dispose()
        instruments.current.delete(id)
      }
    }

    const events: Array<{ time: number; trackId: string; note: Note }> = []
    const secPerBeat = 60 / song.bpm
    for (const track of song.tracks) {
      if (track.muted) continue
      for (const note of track.notes) {
        events.push({ time: note.beat * secPerBeat, trackId: track.id, note })
      }
    }

    const p = new Tone.Part((time, ev: { trackId: string; note: Note }) => {
      const inst = instruments.current.get(ev.trackId)
      if (!inst) return
      const track = song.tracks.find((t) => t.id === ev.trackId)
      if (!track || track.muted) return
      const anySolo = song.tracks.some((t) => t.solo)
      if (anySolo && !track.solo) return
      const dur = Math.max(0.05, ev.note.length * secPerBeat)
      inst.triggerAttackRelease(ev.note.pitch, dur, time, ev.note.velocity)
    }, events).start(0)

    part.current = p

    if (loop?.enabled) {
      Tone.Transport.loop = true
      Tone.Transport.loopStart = loop.start * secPerBeat
      Tone.Transport.loopEnd = loop.end * secPerBeat
    } else {
      Tone.Transport.loop = false
    }
  }, [song, loop])

  useEffect(() => {
    schedule()
    return () => {
      part.current?.dispose()
    }
  }, [schedule])

  const play = useCallback(async (fromSeconds = 0) => {
    await Tone.start()
    Tone.Transport.seconds = Math.max(0, fromSeconds)
    Tone.Transport.start()
    setPlaying(true)
  }, [])

  const stop = useCallback(() => {
    Tone.Transport.stop()
    Tone.Transport.seconds = 0
    setPlaying(false)
    setPosition(0)
  }, [])

  const pause = useCallback(() => {
    Tone.Transport.pause()
    setPlaying(false)
  }, [])

  const seek = useCallback((seconds: number) => {
    Tone.Transport.seconds = Math.max(0, seconds)
    setPosition(seconds)
  }, [])

  const setLoopRegion = useCallback((region: LoopRegion | null) => {
    setLoop(region)
  }, [])

  // Position tracking
  useEffect(() => {
    const tick = () => {
      if (Tone.Transport.state === 'started') {
        setPosition(Tone.Transport.seconds)
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  // Cleanup
  useEffect(() => {
    return () => {
      Tone.Transport.stop()
      Tone.Transport.cancel()
      for (const inst of instruments.current.values()) inst.dispose()
      instruments.current.clear()
      part.current?.dispose()
    }
  }, [])

  return {
    playing,
    position,
    loop,
    play,
    stop,
    pause,
    seek,
    setLoopRegion,
  }
}
