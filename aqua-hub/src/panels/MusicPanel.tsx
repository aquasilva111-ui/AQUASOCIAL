import { useEffect, useRef, useState } from 'react'

import type { MusicSession, Song } from 'aqua-runtime/src/adapters/music'

import { download, runtime } from '../hub'
import { UndoRedo, useSession } from './hooks'

const LOW = 48
const HIGH = 84
const STEP = 0.5 // beats per grid cell
const CELL_W = 22
const CELL_H = 14

export default function MusicPanel({ itemId }: { itemId: string }) {
  const { session, refresh } = useSession<MusicSession>(itemId)
  const [track, setTrack] = useState<string | undefined>()
  const [url, setUrl] = useState<string | null>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const song: Song | undefined = session?.state
  const active = song?.tracks.find((t) => t.id === track) ?? song?.tracks[0]

  useEffect(() => {
    const c = cv.current
    if (!c || !song) return
    const cols = (song.bars * song.beatsPerBar) / STEP
    c.width = cols * CELL_W
    c.height = (HIGH - LOW) * CELL_H
    const g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    for (let p = LOW; p < HIGH; p++) {
      g.fillStyle = [1, 3, 6, 8, 10].includes(p % 12) ? '#EFF2F6' : '#fff'
      g.fillRect(0, (HIGH - 1 - p) * CELL_H, c.width, CELL_H)
    }
    g.strokeStyle = '#DCE2EA'
    for (let i = 0; i <= cols; i++) {
      g.lineWidth = i % (song.beatsPerBar / STEP) === 0 ? 2 : 1
      g.beginPath(); g.moveTo(i * CELL_W, 0); g.lineTo(i * CELL_W, c.height); g.stroke()
    }
    for (const t of song.tracks) {
      for (const n of t.notes) {
        g.fillStyle = t.id === active?.id ? '#002BEF' : 'rgba(0,43,239,.25)'
        g.fillRect((n.beat / STEP) * CELL_W + 1, (HIGH - 1 - n.pitch) * CELL_H + 1, (n.length / STEP) * CELL_W - 2, CELL_H - 2)
      }
    }
  })

  if (!session || !song) return <p className="note">Abrindo…</p>

  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!active) return
    const r = e.currentTarget.getBoundingClientRect()
    const beat = Math.floor(((e.clientX - r.left) * (e.currentTarget.width / r.width)) / CELL_W) * STEP
    const pitch = HIGH - 1 - Math.floor(((e.clientY - r.top) * (e.currentTarget.height / r.height)) / CELL_H)
    if (pitch < LOW || pitch >= HIGH) return
    const hit = active.notes.findIndex((n) => n.pitch === pitch && beat >= n.beat && beat < n.beat + n.length)
    if (hit >= 0) session.update((d) => void d.tracks.find((t) => t.id === active.id)!.notes.splice(hit, 1))
    else session.addNote(active.id, { beat, pitch, length: STEP })
  }

  const play = async () => {
    const out = await runtime.exportForLaunch(itemId, 'audio')
    if (out) setUrl(URL.createObjectURL(new Blob([out.bytes as BlobPart], { type: out.mime })))
  }

  return (
    <>
      <div className="row">
        <label className="field">BPM <input type="number" min={40} max={240} value={song.bpm} style={{ width: 70 }} onChange={(e) => session.update((d) => void (d.bpm = Math.max(40, Math.min(240, +e.target.value || 120))))} /></label>
        <label className="field">Compassos <input type="number" min={1} max={64} value={song.bars} style={{ width: 70 }} onChange={(e) => session.update((d) => void (d.bars = Math.max(1, Math.min(64, +e.target.value || 8))))} /></label>
        <button onClick={() => setTrack(session.addTrack(`Faixa ${song.tracks.length + 1}`))}>+ Faixa</button>
        {song.tracks.length > 0 && (
          <select value={active?.id} onChange={(e) => setTrack(e.target.value)}>
            {song.tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {active && (
          <select value={active.instrument} onChange={(e) => session.update((d) => void (d.tracks.find((t) => t.id === active.id)!.instrument = e.target.value as typeof active.instrument))}>
            <option value="synth">Synth</option><option value="pluck">Pluck</option><option value="membrane">Percussão</option><option value="sampler">Quadrada</option>
          </select>
        )}
        <UndoRedo itemId={itemId} refresh={refresh} />
        <button onClick={play}>Gerar áudio</button>
        <button className="primary" onClick={async () => {
          const out = await runtime.exportForLaunch(itemId, 'audio')
          if (out) download(out.bytes, 'musica.wav', out.mime)
        }}>Baixar WAV</button>
      </div>
      {url && <audio controls autoPlay src={url} />}
      {!song.tracks.length && <p className="note">Adicione uma faixa e clique na grade para criar notas; clique numa nota para apagar.</p>}
      <div style={{ overflow: 'auto' }}><canvas ref={cv} onClick={click} style={{ cursor: 'crosshair', maxWidth: 'none' }} /></div>
    </>
  )
}
