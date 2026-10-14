import { useEffect, useRef, useState } from 'react'
import type { MusicSession, Note, Song, Track } from 'aqua-runtime/src/adapters/music'
import { playOnce } from '../panels/audio-play'
import { renderSong } from 'aqua-runtime/src/render/music'
import type { useTonePlayer } from './tone-player'

const LOW = 36
const HIGH = 96
const ROW = 16
const KEYS = 52
const RULER = 20
const EDGE = 7
const COLORS = ['#ff5a8a', '#ffb703', '#2ee6a6', '#4cc9f0', '#b388ff', '#ff8a4c']

type Drag =
  | { mode: 'move' | 'resize'; indices: number[]; x0: number; y0: number; originals: Note[] }
  | { mode: 'box'; x0: number; y0: number; x1: number; y1: number }

const preview = (song: Song, track: Track, pitch: number) =>
  renderSong({
    ...song,
    bars: 1,
    tracks: [{
      ...track,
      muted: false,
      solo: false,
      volumeDb: Math.min(track.volumeDb, 0),
      notes: [{ beat: 0, pitch, length: 0.5, velocity: 0.8 }],
    }],
  })

interface Props {
  song: Song
  track: Track
  session: MusicSession
  player: ReturnType<typeof useTonePlayer>
  snap: number
  bw: number
  selected: Set<number>
  setSelected: (s: Set<number>) => void
  clipboard: Note[]
  setClipboard: (n: Note[]) => void
}

export default function PianoRoll({
  song, track, session, player, snap, bw, selected, setSelected, clipboard, setClipboard,
}: Props) {
  const cv = useRef<HTMLCanvasElement>(null)
  const velCv = useRef<HTMLCanvasElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const lastLen = useRef(0.5)
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)

  const beats = song.bars * song.beatsPerBar
  const secPerBeat = 60 / song.bpm
  const xOf = (beat: number) => KEYS + beat * bw
  const yOf = (pitch: number) => RULER + (HIGH - 1 - pitch) * ROW

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = yOf(72) - 120
  }, [])

  // Draw piano roll
  useEffect(() => {
    const c = cv.current
    if (!c) return
    const W = KEYS + beats * bw
    const H = RULER + (HIGH - LOW) * ROW
    c.width = W
    c.height = H
    const g = c.getContext('2d')!
    g.clearRect(0, 0, W, H)

    // Grid background
    for (let p = LOW; p < HIGH; p++) {
      g.fillStyle = [1, 3, 6, 8, 10].includes(p % 12) ? '#11151c' : '#171c26'
      g.fillRect(KEYS, yOf(p), W - KEYS, ROW)
      if (p % 12 === 0) {
        g.fillStyle = '#2b3547'
        g.fillRect(KEYS, yOf(p) + ROW - 1, W - KEYS, 1)
      }
    }
    for (let b = 0; b <= beats; b += snap) {
      g.strokeStyle = b % song.beatsPerBar === 0 ? '#3d4a63' : b % 1 === 0 ? '#232c3c' : '#1b2230'
      g.beginPath()
      g.moveTo(xOf(b) + 0.5, RULER)
      g.lineTo(xOf(b) + 0.5, H)
      g.stroke()
    }

    // Ruler + piano keys
    g.fillStyle = '#10141b'
    g.fillRect(0, 0, W, RULER)
    g.fillStyle = '#8a97ad'
    g.font = '11px sans-serif'
    for (let b = 0; b < beats; b += song.beatsPerBar) {
      g.fillText(String(b / song.beatsPerBar + 1), xOf(b) + 4, 14)
    }
    for (let p = LOW; p < HIGH; p++) {
      const black = [1, 3, 6, 8, 10].includes(p % 12)
      g.fillStyle = black ? '#0b0e13' : '#d9dee8'
      g.fillRect(0, yOf(p), KEYS - (black ? 14 : 0), ROW - 1)
      if (p % 12 === 0) {
        g.fillStyle = '#3d4a63'
        g.fillText(`C${Math.floor(p / 12) - 1}`, 6, yOf(p) + 12)
      }
    }

    // Notes (active track highlighted, others ghosted)
    song.tracks.forEach((t, ti) => {
      const active = t.id === track.id
      const color = COLORS[ti % COLORS.length]
      t.notes.forEach((n, i) => {
        if (n.pitch < LOW || n.pitch >= HIGH) return
        const [nx, ny, nw, nh] = [xOf(n.beat) + 1, yOf(n.pitch) + 1, Math.max(4, n.length * bw - 2), ROW - 2]
        g.globalAlpha = t.muted ? 0.12 : active ? 0.55 + n.velocity * 0.45 : 0.22
        g.fillStyle = color
        g.beginPath()
        g.roundRect(nx, ny, nw, nh, 4)
        g.fill()
        g.globalAlpha = 1
        if (active && selected.has(i)) {
          g.strokeStyle = '#fff'
          g.lineWidth = 2
          g.beginPath()
          g.roundRect(nx, ny, nw, nh, 4)
          g.stroke()
        }
      })
    })

    // Playhead
    const px = xOf(player.position / secPerBeat)
    g.fillStyle = '#ff5a36'
    g.fillRect(px, 0, 2, H)

    // Box selection
    if (box) {
      const x = Math.min(box.x0, box.x1)
      const y = Math.min(box.y0, box.y1)
      const w = Math.abs(box.x1 - box.x0)
      const h = Math.abs(box.y1 - box.y0)
      g.strokeStyle = 'rgba(255,255,255,0.7)'
      g.fillStyle = 'rgba(255,255,255,0.08)'
      g.lineWidth = 1
      g.beginPath()
      g.roundRect(x, y, w, h, 2)
      g.fill()
      g.stroke()
    }
  })

  // Velocity lane
  useEffect(() => {
    const c = velCv.current
    if (!c) return
    const W = KEYS + beats * bw
    c.width = W
    c.height = 48
    const g = c.getContext('2d')!
    g.clearRect(0, 0, W, 48)
    g.fillStyle = '#0e1218'
    g.fillRect(0, 0, W, 48)
    track.notes.forEach((n, i) => {
      const x = xOf(n.beat)
      const h = n.velocity * 40
      g.fillStyle = selected.has(i) ? '#ffb703' : '#4cc9f0'
      g.fillRect(x + 1, 44 - h, Math.max(3, n.length * bw - 2), h)
    })
  })

  const hit = (x: number, y: number) => {
    const beat = (x - KEYS) / bw
    const pitch = HIGH - 1 - Math.floor((y - RULER) / ROW)
    return track.notes.findIndex((n) => n.pitch === pitch && beat >= n.beat && beat <= n.beat + n.length)
  }

  const local = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const snapBeat = (b: number) => Math.round(b / snap) * snap

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = local(e)
    if (y < RULER) {
      const t = Math.max(0, snapBeat((x - KEYS) / bw)) * secPerBeat
      player.seek(t)
      if (player.playing) void player.play(t)
      return
    }
    if (x < KEYS) {
      playOnce(preview(song, track, HIGH - 1 - Math.floor((y - RULER) / ROW)))
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    const i = hit(x, y)

    if (i < 0) {
      // Box select or create note
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        drag.current = { mode: 'box', x0: x, y0: y, x1: x, y1: y }
        setBox({ x0: x, y0: y, x1: x, y1: y })
        return
      }
      // Create note
      const pitch = HIGH - 1 - Math.floor((y - RULER) / ROW)
      const beat = Math.max(0, Math.min(beats - snap, Math.floor(((x - KEYS) / bw) / snap) * snap))
      session.addNote(track.id, { beat, pitch, length: lastLen.current })
      const newIndex = track.notes.length
      setSelected(new Set([newIndex]))
      drag.current = {
        mode: 'resize',
        indices: [newIndex],
        x0: x,
        y0: y,
        originals: [{ beat, pitch, length: lastLen.current, velocity: 0.8 }],
      }
      playOnce(preview(song, track, pitch))
      return
    }

    // Existing note
    const additive = e.shiftKey || e.metaKey || e.ctrlKey
    let next = new Set(selected)
    if (additive) {
      if (next.has(i)) next.delete(i)
      else next.add(i)
    } else if (!next.has(i)) {
      next = new Set([i])
    }
    setSelected(next)

    const indices = additive || next.size > 1 ? [...next] : [i]
    const originals = indices.map((idx) => ({ ...track.notes[idx] }))
    const edge = x >= xOf(track.notes[i].beat + track.notes[i].length) - EDGE
    drag.current = {
      mode: edge ? 'resize' : 'move',
      indices,
      x0: x,
      y0: y,
      originals,
    }
    if (!edge) playOnce(preview(song, track, track.notes[i].pitch))
  }

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    if (!d) return
    const { x, y } = local(e)

    if (d.mode === 'box') {
      d.x1 = x
      d.y1 = y
      setBox({ x0: d.x0, y0: d.y0, x1: x, y1: y })
      return
    }

    const dBeats = (x - d.x0) / bw
    const dPitch = Math.round((d.y0 - y) / ROW)

    if (d.mode === 'resize') {
      d.indices.forEach((idx, k) => {
        const orig = d.originals[k]
        const length = Math.max(snap, Math.min(beats - orig.beat, snapBeat(orig.length + dBeats)))
        session.updateNote(track.id, idx, { length })
        lastLen.current = length
      })
    } else {
      d.indices.forEach((idx, k) => {
        const orig = d.originals[k]
        const beat = Math.max(0, Math.min(beats - orig.length, snapBeat(orig.beat + dBeats)))
        const pitch = Math.max(LOW, Math.min(HIGH - 1, orig.pitch + dPitch))
        session.updateNote(track.id, idx, { beat, pitch })
      })
    }
  }

  const onUp = () => {
    const d = drag.current
    if (d?.mode === 'box') {
      const x1 = Math.min(d.x0, d.x1)
      const x2 = Math.max(d.x0, d.x1)
      const y1 = Math.min(d.y0, d.y1)
      const y2 = Math.max(d.y0, d.y1)
      const hits = new Set<number>()
      track.notes.forEach((n, i) => {
        const nx = xOf(n.beat)
        const ny = yOf(n.pitch)
        const nw = n.length * bw
        if (nx < x2 && nx + nw > x1 && ny < y2 && ny + ROW > y1) hits.add(i)
      })
      setSelected(hits)
    }
    drag.current = null
    setBox(null)
  }

  const quantize = () => {
    if (!selected.size) return
    for (const i of selected) {
      const n = track.notes[i]
      if (!n) continue
      const beat = snapBeat(n.beat)
      const length = Math.max(snap, snapBeat(n.length))
      session.updateNote(track.id, i, { beat, length })
    }
  }

  const copy = () => {
    const notes = [...selected].map((i) => track.notes[i]).filter(Boolean)
    if (!notes.length) return
    const minBeat = Math.min(...notes.map((n) => n.beat))
    setClipboard(notes.map((n) => ({ ...n, beat: n.beat - minBeat })))
  }

  const paste = () => {
    if (!clipboard.length) return
    const start = player.position / secPerBeat
    const base = snapBeat(Math.max(0, start))
    const newIndices: number[] = []
    clipboard.forEach((n) => {
      session.addNote(track.id, { ...n, beat: base + n.beat })
      newIndices.push(track.notes.length)
    })
    setSelected(new Set(newIndices))
  }

  const duplicate = () => {
    if (!selected.size) return
    const notes = [...selected].map((i) => track.notes[i]).filter(Boolean)
    const minBeat = Math.min(...notes.map((n) => n.beat))
    const maxEnd = Math.max(...notes.map((n) => n.beat + n.length))
    const offset = maxEnd - minBeat
    const newIndices: number[] = []
    notes.forEach((n) => {
      session.addNote(track.id, { ...n, beat: n.beat + offset })
      newIndices.push(track.notes.length)
    })
    setSelected(new Set(newIndices))
  }

  const remove = () => {
    if (!selected.size) return
    const sorted = [...selected].sort((a, b) => b - a)
    for (const i of sorted) session.removeNote(track.id, i)
    setSelected(new Set())
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (['INPUT', 'SELECT'].includes((e.target as HTMLElement).tagName)) return
    const meta = e.metaKey || e.ctrlKey
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      remove()
    } else if (meta && e.key === 'c') {
      e.preventDefault()
      copy()
    } else if (meta && e.key === 'v') {
      e.preventDefault()
      paste()
    } else if (meta && e.key === 'd') {
      e.preventDefault()
      duplicate()
    } else if (meta && e.key === 'q') {
      e.preventDefault()
      quantize()
    }
  }

  return (
    <div tabIndex={0} onKeyDown={onKey} style={{ outline: 'none' }}>
      <div style={{ display: 'flex', gap: 8, padding: '6px 12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={quantize} disabled={!selected.size}>Quantizar</button>
        <button onClick={copy} disabled={!selected.size}>Copiar</button>
        <button onClick={paste} disabled={!clipboard.length}>Colar</button>
        <button onClick={duplicate} disabled={!selected.size}>Duplicar</button>
        <button onClick={remove} disabled={!selected.size}>Apagar</button>
        <span style={{ opacity: 0.6, fontSize: 12 }}>
          {selected.size ? `${selected.size} nota(s)` : 'nenhuma seleção'} · Ctrl+C/V/D/Q · Delete
        </span>
      </div>
      <div className="roll" ref={scroller} style={{ maxHeight: 380, overflow: 'auto' }}>
        <canvas
          ref={cv}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          style={{ cursor: 'crosshair', display: 'block', touchAction: 'none', background: 'transparent' }}
        />
      </div>
      <div style={{ borderTop: '1px solid #232c3c', background: '#0e1218' }}>
        <div style={{ fontSize: 11, color: '#8a97ad', padding: '2px 8px' }}>Velocity</div>
        <canvas ref={velCv} style={{ display: 'block', width: '100%', height: 48 }} />
      </div>
    </div>
  )
}
