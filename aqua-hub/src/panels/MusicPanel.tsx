import { useEffect, useRef, useState } from 'react'

import type { MusicSession, Note, Song, Track } from 'aqua-runtime/src/adapters/music'
import { renderSong } from 'aqua-runtime/src/render/music'

import { download, runtime } from '../hub'
import { playOnce, usePlayer } from './audio-play'
import { UndoRedo, useSession } from './hooks'

const LOW = 36 // C2
const HIGH = 96 // C7 (exclusive)
const ROW = 16
const KEYS = 52 // width of the piano column
const RULER = 20
const EDGE = 7 // px at a note's right edge that resize instead of move
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const BLACK = new Set([1, 3, 6, 8, 10])
const COLORS = ['#002BEF', '#F04C24', '#0A8F6A', '#9333EA', '#C2410C', '#0E7490']

type Drag = { mode: 'move' | 'resize'; index: number; x0: number; y0: number; note: Note }

/** One-note song, used to audition what a note will sound like (same renderer as the export). */
const preview = (song: Song, track: Track, pitch: number) =>
  renderSong({ ...song, bars: 1, tracks: [{ ...track, muted: false, solo: false, volumeDb: Math.min(track.volumeDb, 0), notes: [{ beat: 0, pitch, length: Math.min(1, 60 / song.bpm * 1.2) / (60 / song.bpm), velocity: 0.8 }] }] })

export default function MusicPanel({ itemId }: { itemId: string }) {
  const { session, refresh } = useSession<MusicSession>(itemId)
  const [trackId, setTrackId] = useState<string | undefined>()
  const [sel, setSel] = useState<number | null>(null)
  const [snap, setSnap] = useState(0.25) // beats
  const [bw, setBw] = useState(56) // pixels per beat
  const [url, setUrl] = useState<string | null>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const lastLen = useRef(0.5)
  const song = session?.state
  const track = song?.tracks.find((t) => t.id === trackId) ?? song?.tracks[0]
  const beats = song ? song.bars * song.beatsPerBar : 0

  const player = usePlayer(() => (song ? renderSong(song) : null), song)
  const secPerBeat = song ? 60 / song.bpm : 0.5
  const xOf = (beat: number) => KEYS + beat * bw
  const yOf = (pitch: number) => RULER + (HIGH - 1 - pitch) * ROW

  // Start scrolled to the middle of the range (around C4).
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = yOf(72) - 120
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!song])

  useEffect(() => {
    const c = cv.current
    if (!c || !song) return
    const W = KEYS + beats * bw
    const H = RULER + (HIGH - LOW) * ROW
    c.width = W
    c.height = H
    const g = c.getContext('2d')!
    g.clearRect(0, 0, W, H)
    for (let p = LOW; p < HIGH; p++) {
      g.fillStyle = BLACK.has(p % 12) ? '#EFF2F6' : '#fff'
      g.fillRect(KEYS, yOf(p), W - KEYS, ROW)
      if (p % 12 === 0) {
        g.fillStyle = '#DCE2EA'
        g.fillRect(KEYS, yOf(p) + ROW - 1, W - KEYS, 1)
      }
    }
    for (let b = 0; b <= beats; b += snap) {
      g.strokeStyle = b % song.beatsPerBar === 0 ? '#9FB0C6' : b % 1 === 0 ? '#DCE2EA' : '#EFF2F6'
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(xOf(b) + 0.5, RULER)
      g.lineTo(xOf(b) + 0.5, H)
      g.stroke()
    }
    // ruler (bars) + piano
    g.fillStyle = '#EFF2F6'
    g.fillRect(0, 0, W, RULER)
    g.fillStyle = '#405168'
    g.font = '11px sans-serif'
    for (let b = 0; b < beats; b += song.beatsPerBar) g.fillText(String(b / song.beatsPerBar + 1), xOf(b) + 4, 14)
    for (let p = LOW; p < HIGH; p++) {
      g.fillStyle = BLACK.has(p % 12) ? '#1C2736' : '#fff'
      g.fillRect(0, yOf(p), KEYS, ROW - 1)
      if (p % 12 === 0) {
        g.fillStyle = '#405168'
        g.fillText(`C${Math.floor(p / 12) - 1}`, 6, yOf(p) + 12)
      }
    }
    song.tracks.forEach((t, ti) => {
      const active = t.id === track?.id
      t.notes.forEach((n, i) => {
        if (n.pitch < LOW || n.pitch >= HIGH) return
        const color = COLORS[ti % COLORS.length]
        g.globalAlpha = t.muted ? 0.15 : active ? 1 : 0.3
        g.fillStyle = color
        g.fillRect(xOf(n.beat) + 1, yOf(n.pitch) + 1, Math.max(4, n.length * bw - 2), ROW - 2)
        g.globalAlpha = 1
        if (active && i === sel) {
          g.strokeStyle = '#000'
          g.lineWidth = 2
          g.strokeRect(xOf(n.beat) + 1, yOf(n.pitch) + 1, Math.max(4, n.length * bw - 2), ROW - 2)
        }
      })
    })
    const px = xOf(player.pos / secPerBeat)
    g.fillStyle = '#F04C24'
    g.fillRect(px, 0, 2, H)
  })

  const hit = (x: number, y: number) => {
    if (!track) return -1
    const beat = (x - KEYS) / bw
    const pitch = HIGH - 1 - Math.floor((y - RULER) / ROW)
    return track.notes.findIndex((n) => n.pitch === pitch && beat >= n.beat && beat <= n.beat + n.length)
  }
  const local = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const snapBeat = (b: number) => Math.round(b / snap) * snap

  if (!session || !song) return <p className="note">Abrindo…</p>

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = local(e)
    if (y < RULER) {
      player.seek(Math.max(0, snapBeat((x - KEYS) / bw)) * secPerBeat)
      if (player.playing) void player.play(Math.max(0, snapBeat((x - KEYS) / bw)) * secPerBeat)
      return
    }
    if (x < KEYS || !track) {
      if (track && x < KEYS) playOnce(preview(song, track, HIGH - 1 - Math.floor((y - RULER) / ROW)))
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    let i = hit(x, y)
    if (i < 0) {
      // Empty cell: a note appears here and can be stretched by dragging.
      const pitch = HIGH - 1 - Math.floor((y - RULER) / ROW)
      const beat = Math.max(0, Math.min(beats - snap, Math.floor(((x - KEYS) / bw) / snap) * snap))
      session.addNote(track.id, { beat, pitch, length: lastLen.current })
      i = track.notes.length // index of the note just added
      setSel(i)
      drag.current = { mode: 'resize', index: i, x0: x, y0: y, note: { beat, pitch, length: lastLen.current, velocity: 0.8 } }
      playOnce(preview(song, track, pitch))
      return
    }
    const n = track.notes[i]
    setSel(i)
    const edge = x >= xOf(n.beat + n.length) - EDGE
    drag.current = { mode: edge ? 'resize' : 'move', index: i, x0: x, y0: y, note: { ...n } }
    if (!edge) playOnce(preview(song, track, n.pitch))
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    if (!d || !track) return
    const { x, y } = local(e)
    const dBeats = (x - d.x0) / bw
    if (d.mode === 'resize') {
      const length = Math.max(snap, Math.min(beats - d.note.beat, snapBeat(d.note.length + dBeats)))
      if (length !== track.notes[d.index]?.length) {
        session.updateNote(track.id, d.index, { length })
        lastLen.current = length
      }
    } else {
      const beat = Math.max(0, Math.min(beats - d.note.length, snapBeat(d.note.beat + dBeats)))
      const pitch = Math.max(LOW, Math.min(HIGH - 1, d.note.pitch - Math.round((y - d.y0) / ROW)))
      const cur = track.notes[d.index]
      if (cur && (cur.beat !== beat || cur.pitch !== pitch)) {
        session.updateNote(track.id, d.index, { beat, pitch })
        if (cur.pitch !== pitch) playOnce(preview(song, track, pitch))
      }
    }
  }
  const up = () => (drag.current = null)

  const remove = () => {
    if (!track || sel === null) return
    session.removeNote(track.id, sel)
    setSel(null)
  }
  const selected = track && sel !== null ? track.notes[sel] : undefined
  const setTrack = (id: string, f: Partial<Track>) => session.update((d) => void Object.assign(d.tracks.find((t) => t.id === id)!, f))

  return (
    <div
      tabIndex={0}
      style={{ outline: 'none' }}
      onKeyDown={(e) => {
        if (['INPUT', 'SELECT'].includes((e.target as HTMLElement).tagName)) return
        if (e.key === ' ') (e.preventDefault(), player.playing ? player.stop() : void player.play(player.pos))
        else if (e.key === 'Delete' || e.key === 'Backspace') remove()
      }}
    >
      <div className="row">
        <button className="primary" onClick={() => (player.playing ? player.stop() : void player.play(player.pos))}>{player.playing ? 'Parar' : 'Tocar'}</button>
        <button onClick={() => (player.stop(), player.seek(0))}>Início</button>
        <label className="field">BPM <input type="number" min={40} max={240} value={song.bpm} style={{ width: 64 }} onChange={(e) => session.update((d) => void (d.bpm = Math.max(40, Math.min(240, +e.target.value || 120))))} /></label>
        <label className="field">Compassos <input type="number" min={1} max={64} value={song.bars} style={{ width: 64 }} onChange={(e) => session.update((d) => void (d.bars = Math.max(1, Math.min(64, +e.target.value || 8))))} /></label>
        <label className="field">Grade
          <select value={snap} onChange={(e) => setSnap(+e.target.value)}>
            <option value={1}>1/4</option><option value={0.5}>1/8</option><option value={0.25}>1/16</option><option value={0.125}>1/32</option>
          </select>
        </label>
        <label className="field">Zoom <input type="range" min={24} max={140} value={bw} onChange={(e) => setBw(+e.target.value)} /></label>
        <UndoRedo itemId={itemId} refresh={refresh} />
        <button onClick={async () => {
          const out = await runtime.exportForLaunch(itemId, 'audio')
          if (out) setUrl(URL.createObjectURL(new Blob([out.bytes as BlobPart], { type: out.mime })))
        }}>Gerar áudio</button>
        <button onClick={async () => {
          const out = await runtime.exportForLaunch(itemId, 'audio')
          if (out) download(out.bytes, 'musica.wav', out.mime)
        }}>Baixar WAV</button>
      </div>
      {url && <audio controls src={url} />}

      <div style={{ margin: '8px 0' }}>
        {song.tracks.map((t, ti) => (
          <div className="row" key={t.id} style={{ borderLeft: `4px solid ${COLORS[ti % COLORS.length]}`, paddingLeft: 8, background: t.id === track?.id ? 'var(--surface)' : undefined, borderRadius: 6 }} onPointerDown={() => setTrackId(t.id)}>
            <input value={t.name} style={{ width: 110 }} onChange={(e) => setTrack(t.id, { name: e.target.value })} />
            <select value={t.instrument} onChange={(e) => setTrack(t.id, { instrument: e.target.value as Track['instrument'] })}>
              <option value="synth">Synth</option><option value="pluck">Pluck</option><option value="membrane">Percussão</option><option value="sampler">Quadrada</option>
            </select>
            <label className="field">Volume <input type="range" min={-30} max={6} step={1} value={t.volumeDb} onChange={(e) => setTrack(t.id, { volumeDb: +e.target.value })} /> {t.volumeDb} dB</label>
            <button style={t.muted ? { background: 'var(--orange)', color: '#fff' } : undefined} onClick={() => setTrack(t.id, { muted: !t.muted })}>M</button>
            <button style={t.solo ? { background: 'var(--blue)', color: '#fff' } : undefined} onClick={() => setTrack(t.id, { solo: !t.solo })}>S</button>
            <button onClick={() => { session.removeTrack(t.id); setTrackId(undefined); setSel(null) }}>Remover</button>
          </div>
        ))}
        <div className="row">
          <button onClick={() => { setTrackId(session.addTrack(`Faixa ${song.tracks.length + 1}`)); setSel(null) }}>+ Faixa</button>
          {selected && (
            <>
              <span className="note">Nota: {NAMES[selected.pitch % 12]}{Math.floor(selected.pitch / 12) - 1}</span>
              <label className="field">Intensidade <input type="range" min={0.1} max={1} step={0.05} value={selected.velocity} onChange={(e) => session.updateNote(track!.id, sel!, { velocity: +e.target.value })} /></label>
              <button onClick={remove}>Apagar nota</button>
            </>
          )}
        </div>
      </div>
      {!song.tracks.length ? (
        <p className="note">Adicione uma faixa. Clique na grade para criar notas e arraste para esticar; arraste uma nota para movê-la, pela borda direita para redimensionar; clique no teclado para ouvir; clique na régua para posicionar o cursor. Espaço toca, Delete apaga.</p>
      ) : (
        <div ref={scroller} style={{ overflow: 'auto', maxHeight: 420, border: '1px solid var(--line)', borderRadius: 8 }}>
          <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={up} style={{ cursor: 'crosshair', maxWidth: 'none', border: 0, borderRadius: 0, display: 'block', touchAction: 'none' }} />
        </div>
      )}
    </div>
  )
}
