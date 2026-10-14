import { useState } from 'react'

import type { MusicSession, Note, Track } from 'aqua-runtime/src/adapters/music'

import { download, runtime } from '../hub'
import { UndoRedo, useSession } from './hooks'
import { IconButton } from './Icon'
import MelodyLab from './MelodyLab'
import { useTonePlayer } from '../music/tone-player'
import PianoRoll from '../music/PianoRoll'
import Multitrack from '../music/Multitrack'
import Mixer from '../music/Mixer'
import { songToMidi, midiToSong } from '../music/midi'

const COLORS = ['#ff5a8a', '#ffb703', '#2ee6a6', '#4cc9f0', '#b388ff', '#ff8a4c']

export default function MusicPanel({ itemId }: { itemId: string }) {
  const { session, refresh } = useSession<MusicSession>(itemId)
  const [trackId, setTrackId] = useState<string | undefined>()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [clipboard, setClipboard] = useState<Note[]>([])
  const [snap, setSnap] = useState(0.25)
  const [bw, setBw] = useState(56)
  const [url, setUrl] = useState<string | null>(null)
  const [lab, setLab] = useState(false)

  const song = session?.state
  const track = song?.tracks.find((t) => t.id === trackId) ?? song?.tracks[0]
  const player = useTonePlayer(song)

  if (!session || !song) return <p className="note">Abrindo…</p>

  const setTrack = (id: string, f: Partial<Track>) =>
    session.update((d) => void Object.assign(d.tracks.find((t) => t.id === id)!, f))

  const go = () => (player.playing ? player.stop() : void player.play(player.position))

  return (
    <div className="studio" tabIndex={0} style={{ outline: 'none' }} onKeyDown={(e) => {
      if (['INPUT', 'SELECT'].includes((e.target as HTMLElement).tagName)) return
      if (e.key === ' ') { e.preventDefault(); go() }
    }}>
      <div className="transport">
        <IconButton icon="toStart" label="Voltar ao início" onClick={() => (player.stop(), player.seek(0))} />
        <IconButton variant="play" icon={player.playing ? 'stop' : 'play'} label="Tocar / parar (espaço)" active={player.playing} onClick={go} />
        <div className="lcd">{player.position.toFixed(1)} s</div>
        <label className="pill">BPM <input type="number" min={40} max={240} value={song.bpm} onChange={(e) => session.update((d) => void (d.bpm = Math.max(40, Math.min(240, +e.target.value || 120))))} /></label>
        <label className="pill">Compassos <input type="number" min={1} max={64} value={song.bars} onChange={(e) => session.update((d) => void (d.bars = Math.max(1, Math.min(64, +e.target.value || 8))))} /></label>
        <label className="pill">
          Loop
          <input type="checkbox" checked={!!player.loop?.enabled} onChange={(e) => {
            const enabled = e.target.checked
            player.setLoopRegion(enabled ? { start: 0, end: song.bars * song.beatsPerBar, enabled: true } : null)
          }} />
        </label>
        <label className="pill">Grade
          <select value={snap} onChange={(e) => setSnap(+e.target.value)}>
            <option value={1}>1/4</option><option value={0.5}>1/8</option><option value={0.25}>1/16</option><option value={0.125}>1/32</option>
          </select>
        </label>
        <label className="pill">Zoom <input type="range" min={24} max={140} value={bw} onChange={(e) => setBw(+e.target.value)} /></label>
        <span className="spacer" />
        <IconButton variant={lab ? 'primary' : 'pill'} icon="mic" text="Melody Lab" label="Melody Lab" active={lab} onClick={() => setLab((v) => !v)} />
        <UndoRedo itemId={itemId} refresh={refresh} />
        <button onClick={async () => {
          const out = await runtime.exportForLaunch(itemId, 'audio')
          if (out) setUrl(URL.createObjectURL(new Blob([out.bytes as BlobPart], { type: out.mime })))
        }}>Gerar áudio</button>
        <button className="primary" onClick={async () => {
          const out = await runtime.exportForLaunch(itemId, 'audio')
          if (out) download(out.bytes, 'musica.wav', out.mime)
        }}>Baixar WAV</button>
        <button onClick={() => {
          const bytes = songToMidi(song)
          download(bytes, 'musica.mid', 'audio/midi')
        }}>Exportar MIDI</button>
        <label className="pill" style={{ cursor: 'pointer' }}>
          Importar MIDI
          <input type="file" accept=".mid,.midi" style={{ display: 'none' }} onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const buf = await file.arrayBuffer()
            const imported = midiToSong(buf, file.name.replace(/\.mid(i)?$/i, ''))
            session.update((d) => {
              d.title = imported.title
              d.bpm = imported.bpm
              d.beatsPerBar = imported.beatsPerBar
              d.bars = imported.bars
              d.tracks = imported.tracks
            })
            setSelected(new Set())
            e.target.value = ''
          }} />
        </label>
      </div>
      {url && <div style={{ padding: '10px 16px 0' }}><audio controls src={url} style={{ width: '100%' }} /></div>}

      {lab && (
        <MelodyLab
          session={session}
          onClose={() => setLab(false)}
          onSent={(id) => { setTrackId(id); setSelected(new Set()) }}
        />
      )}

      {song.tracks.map((t, ti) => (
        <div className={'trackrow' + (t.id === track?.id ? ' on' : '')} key={t.id} style={{ ['--c' as string]: COLORS[ti % COLORS.length] }} onPointerDown={() => { setTrackId(t.id); setSelected(new Set()) }}>
          <input className="tname" value={t.name} onChange={(e) => setTrack(t.id, { name: e.target.value })} />
          <select value={t.instrument} onChange={(e) => setTrack(t.id, { instrument: e.target.value as Track['instrument'] })}>
            <option value="synth">Synth</option><option value="pluck">Pluck</option><option value="membrane">Percussão</option><option value="sampler">Quadrada</option>
          </select>
          <button className={'chip' + (t.muted ? ' on-m' : '')} title="Mudo" onClick={() => setTrack(t.id, { muted: !t.muted })}>M</button>
          <button className={'chip' + (t.solo ? ' on-s' : '')} title="Solo" onClick={() => setTrack(t.id, { solo: !t.solo })}>S</button>
          <label className="pill" style={{ border: 0, background: 'transparent' }}>vol <input type="range" min={-30} max={6} step={1} value={t.volumeDb} onChange={(e) => setTrack(t.id, { volumeDb: +e.target.value })} /> {t.volumeDb} dB</label>
          <span className="spacer" />
          <IconButton variant="round" className="sm danger" icon="trash" label="Remover faixa" onClick={() => { session.removeTrack(t.id); setTrackId(undefined); setSelected(new Set()) }} />
        </div>
      ))}

      <div className="transport" style={{ position: 'static', background: 'transparent', borderBottom: 0, paddingTop: 10 }}>
        <IconButton variant="pill" icon="plus" text="Adicionar faixa" label="Adicionar faixa" onClick={() => { setTrackId(session.addTrack(`Faixa ${song.tracks.length + 1}`)); setSelected(new Set()) }} />
      </div>

      {song.tracks.length > 0 && (
        <Multitrack
          song={song}
          session={session}
          selectedTrackId={track?.id}
          onSelectTrack={(id) => { setTrackId(id); setSelected(new Set()) }}
        />
      )}
      {!song.tracks.length ? (
        <div className="empty-hint">Adicione uma faixa para começar.</div>
      ) : track ? (
        <PianoRoll
          song={song}
          track={track}
          session={session}
          player={player}
          snap={snap}
          bw={bw}
          selected={selected}
          setSelected={setSelected}
          clipboard={clipboard}
          setClipboard={setClipboard}
        />
      ) : null}
      {song.tracks.length > 0 && (
        <Mixer song={song} session={session} selectedTrackId={track?.id} />
      )}
    </div>
  )
}
