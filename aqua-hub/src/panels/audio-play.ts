import { useCallback, useEffect, useRef, useState } from 'react'

import type { Pcm } from 'aqua-runtime/src/render/wav'

let shared: AudioContext | null = null
/** One AudioContext for the whole Hub (browsers limit how many can exist). */
export function audioContext(): AudioContext {
  shared ??= new AudioContext()
  void shared.resume()
  return shared
}

export function toBuffer(ctx: AudioContext, pcm: Pcm): AudioBuffer {
  const buf = ctx.createBuffer(pcm.channels.length, Math.max(1, pcm.channels[0].length), pcm.sampleRate)
  pcm.channels.forEach((ch, i) => buf.copyToChannel(ch as Float32Array<ArrayBuffer>, i))
  return buf
}

/** Plays a rendered PCM once, fire and forget (note audition). */
export function playOnce(pcm: Pcm, gain = 1) {
  const ctx = audioContext()
  const src = ctx.createBufferSource()
  const g = ctx.createGain()
  g.gain.value = gain
  src.buffer = toBuffer(ctx, pcm)
  src.connect(g).connect(ctx.destination)
  src.start()
}

/**
 * Pre-listening: `render` returns the same PCM the export would produce, which is played with Web
 * Audio. `pos` follows the playback clock. When `watch` changes while playing (the user edits), the
 * audio is re-rendered and restarted at the current position after a short pause.
 */
export function usePlayer(render: () => Promise<Pcm | null> | Pcm | null, watch: unknown) {
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const node = useRef<AudioBufferSourceNode | null>(null)
  const clock = useRef({ at: 0, from: 0, dur: 0 })
  const raf = useRef(0)
  const gen = useRef(0) // invalidates a play() that is still rendering when stop() is called
  const renderRef = useRef(render)
  renderRef.current = render
  const posRef = useRef(0)

  const stop = useCallback(() => {
    gen.current++
    cancelAnimationFrame(raf.current)
    try {
      node.current?.stop()
    } catch {
      /* already stopped */
    }
    node.current = null
    setPlaying(false)
  }, [])

  const play = useCallback(
    async (from = 0) => {
      stop()
      const my = gen.current
      const ctx = audioContext()
      const pcm = await renderRef.current()
      if (my !== gen.current || !pcm || !pcm.channels[0]?.length) return
      const buf = toBuffer(ctx, pcm)
      if (from >= buf.duration - 0.1) from = 0 // at (or next to) the end: start over
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(ctx.destination)
      src.start(0, from)
      node.current = src
      clock.current = { at: ctx.currentTime, from, dur: buf.duration }
      setPlaying(true)
      src.onended = () => {
        if (node.current !== src) return
        stop()
        posRef.current = 0 // finished by itself: rewind
        setPos(0)
      }
      const tick = () => {
        const p = clock.current.from + (ctx.currentTime - clock.current.at)
        posRef.current = p
        setPos(Math.min(p, clock.current.dur))
        raf.current = requestAnimationFrame(tick)
      }
      raf.current = requestAnimationFrame(tick)
    },
    [stop]
  )

  const seek = useCallback((p: number) => {
    posRef.current = p
    setPos(p)
  }, [])

  // Edits while playing: re-render and continue from where we are.
  useEffect(() => {
    if (!playing) return
    const id = setTimeout(() => void play(posRef.current), 250)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch])

  useEffect(() => stop, [stop])
  return { playing, pos, play, stop, seek }
}
