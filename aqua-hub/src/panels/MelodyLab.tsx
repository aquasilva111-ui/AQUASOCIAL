import { useEffect, useMemo, useRef, useState } from 'react'

import type { MusicSession, Song, Track } from 'aqua-runtime/src/adapters/music'
import {
  SCALE_SHAPES, analyzeMelody, barsFor, estimateBpm, estimateKey, findPatterns, hzToMidi, interpret, interpretationDelta, invert, makeScale, melodyFromAudio,
  melodyToSongNotes, noteName, pitchClassName, repeat, retrograde, reverseRhythm, rhythmOps, stretch, toMelody, transpose, GRIDS,
  type Melody, type PitchFrame, type RawNote
} from 'aqua-runtime/src/melody/index'
import { renderSong } from 'aqua-runtime/src/render/music'
import type { Pcm } from 'aqua-runtime/src/render/wav'

import { decodeAny } from '../hub'
import { audioContext, usePlayer } from './audio-play'

type Op = { id: number; label: string; run: (m: Melody) => Melody }
type Listen = 'take' | 'orig' | 'final'
const COLORS = ['#ff5a8a', '#ffb703', '#2ee6a6', '#4cc9f0', '#b388ff', '#ff8a4c']
const NOTE_PC = Array.from({ length: 12 }, (_, i) => pitchClassName(i))
const mono = (p: Pcm): Float32Array => {
  if (p.channels.length === 1) return p.channels[0]
  const out = new Float32Array(p.channels[0].length)
  for (const c of p.channels) for (let i = 0; i < out.length; i++) out[i] += c[i] / p.channels.length
  return out
}
const pct = (x: number) => `${Math.round(x * 100)}%`
const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`

interface Take {
  raw: RawNote[]
  frames: PitchFrame[]
  seconds: number
  pcm: Pcm
}

export default function MelodyLab({ session, onClose }: { session: MusicSession; onClose: () => void }) {
  const [tab, setTab] = useState<'sing' | 'math'>('sing')
  const [take, setTake] = useState<Take | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [level, setLevel] = useState(0)
  const [recording, setRecording] = useState(false)
  const [bpm, setBpm] = useState(session.state.bpm)
  const [align, setAlign] = useState(true)
  const [instrument, setInstrument] = useState<Track['instrument']>('synth')
  const [quantize, setQuantize] = useState(0)
  const [grid, setGrid] = useState<number>(GRIDS['1/8'])
  const [pitchCorrection, setPitchCorrection] = useState(0)
  const [humanity, setHumanity] = useState(0)
  const [scaleMode, setScaleMode] = useState<'free' | 'detected' | 'custom'>('free')
  const [tonic, setTonic] = useState(0)
  const [shape, setShape] = useState<keyof typeof SCALE_SHAPES>('maior')
  const [ops, setOps] = useState<Op[]>([])
  const [sent, setSent] = useState('')
  const [listen, setListen] = useState<Listen | null>(null)
  const listenRef = useRef<Listen>('final')
  const rec = useRef<{ stop: () => Promise<Blob> } | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const opId = useRef(0)

  // The sung take, positioned in beats. This is the ORIGINAL; nothing below ever changes it.
  const shift = take && align && take.raw.length ? take.raw[0].start : 0
  const base = useMemo(() => (take ? toMelody(take.raw.map((r) => ({ ...r, start: r.start - shift })), bpm, 4) : null), [take, bpm, shift])
  const key = useMemo(() => (base ? estimateKey(base) : undefined), [base])
  const scale = scaleMode === 'free' ? null : scaleMode === 'detected' ? (key ? makeScale(key.tonic, key.mode === 'maior' ? 'maior' : 'menor natural') : null) : makeScale(tonic, shape)
  const interpreted = useMemo(() => (base ? interpret(base, { quantize, grid, pitchCorrection, scale, humanity }) : null), [base, quantize, grid, pitchCorrection, scale, humanity])
  const final = useMemo(() => (interpreted ? ops.reduce((m, o) => o.run(m), interpreted) : null), [interpreted, ops])
  const analysis = useMemo(() => (final ? analyzeMelody(final) : null), [final])
  const patterns = useMemo(() => (final ? findPatterns(final) : []), [final])
  const delta = useMemo(() => (interpreted ? interpretationDelta(interpreted) : null), [interpreted])

  const songFor = (m: Melody): Song => ({ title: 'Melody Lab', bpm: m.bpm, beatsPerBar: 4, bars: barsFor(m), tracks: [{ id: 'lab', name: 'Melody Lab', instrument, volumeDb: 0, muted: false, notes: melodyToSongNotes(m) }] })
  const player = usePlayer(() => {
    if (!take || !base || !final) return null
    const which = listenRef.current
    if (which === 'take') return take.pcm
    return renderSong(songFor(which === 'orig' ? base : final))
  }, `${final?.notes.length}|${quantize}|${pitchCorrection}|${humanity}|${grid}|${scaleMode}|${tonic}|${shape}|${instrument}|${ops.length}`)

  const play = (which: Listen) => {
    if (player.playing && listen === which) return player.stop(), setListen(null)
    listenRef.current = which
    setListen(which)
    void player.play(0)
  }

  // ───── analysis of a recording or an imported file ─────
  const analyse = async (pcm: Pcm) => {
    setBusy('Analisando a voz…')
    setErr('')
    await new Promise((r) => setTimeout(r, 30)) // let the message paint before the heavy loop
    try {
      const x = mono(pcm)
      const { raw, frames } = melodyFromAudio(x, pcm.sampleRate, { bpm })
      if (!raw.length) setErr('Não encontrei notas. Cante uma nota por vez, perto do microfone, e tente de novo.')
      setTake({ raw, frames, seconds: x.length / pcm.sampleRate, pcm: { sampleRate: pcm.sampleRate, channels: [x] } })
      setOps([])
      setQuantize(0)
      setPitchCorrection(0)
      setHumanity(0)
      setSent('')
    } catch (e) {
      setErr(`Falha na análise: ${(e as Error).message}`)
    } finally {
      setBusy('')
    }
  }

  const startRec = async () => {
    setErr('')
    if (!navigator.mediaDevices?.getUserMedia) return setErr('Este navegador não dá acesso ao microfone. Importe um arquivo de áudio.')
    try {
      // Raw voice: the browser's voice processing would smear pitch and level.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      const ctx = audioContext()
      const src = ctx.createMediaStreamSource(stream)
      const an = ctx.createAnalyser()
      an.fftSize = 1024
      src.connect(an)
      const buf = new Float32Array(an.fftSize)
      let raf = 0
      const tick = () => {
        an.getFloatTimeDomainData(buf)
        let s = 0
        for (const v of buf) s += v * v
        setLevel(Math.min(1, Math.sqrt(s / buf.length) * 4))
        raf = requestAnimationFrame(tick)
      }
      tick()
      const mr = new MediaRecorder(stream)
      const chunks: Blob[] = []
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      const done = new Promise<Blob>((res) => (mr.onstop = () => res(new Blob(chunks, { type: mr.mimeType }))))
      mr.start()
      rec.current = {
        stop: async () => {
          mr.stop()
          cancelAnimationFrame(raf)
          src.disconnect()
          stream.getTracks().forEach((t) => t.stop())
          setLevel(0)
          return done
        }
      }
      setRecording(true)
    } catch (e) {
      const n = (e as DOMException).name
      setErr(n === 'NotAllowedError' ? 'O microfone foi bloqueado. Permita o acesso no navegador ou importe um arquivo de áudio.' : n === 'NotFoundError' ? 'Nenhum microfone encontrado. Importe um arquivo de áudio.' : `Não consegui gravar: ${(e as Error).message}`)
    }
  }
  const stopRec = async () => {
    const r = rec.current
    if (!r) return
    rec.current = null
    setRecording(false)
    setBusy('Preparando a gravação…')
    try {
      const blob = await r.stop()
      await analyse(await decodeAny(new Uint8Array(await blob.arrayBuffer())))
    } catch (e) {
      setErr(`Falha ao ler a gravação: ${(e as Error).message}`)
      setBusy('')
    }
  }
  useEffect(() => () => void rec.current?.stop(), [])

  // ───── drawing: sung pitch contour, original notes (hollow) and interpreted notes (filled) ─────
  useEffect(() => {
    const c = canvas.current
    if (!c || !base || !final || !take) return
    const W = 1000
    const H = 190
    c.width = W
    c.height = H
    const g = c.getContext('2d')!
    g.clearRect(0, 0, W, H)
    const spb = 60 / bpm
    const all = [...base.notes, ...final.notes]
    const lo = Math.floor(Math.min(...all.map((n) => Math.min(n.orig.pitch, n.pitch)))) - 2
    const hi = Math.max(lo + 11, Math.ceil(Math.max(...all.map((n) => Math.max(n.orig.pitch, n.pitch)))) + 2)
    const endBeat = Math.max(4, ...all.map((n) => n.beat + n.beats), ...all.map((n) => n.orig.beat + n.orig.beats))
    const total = Math.ceil(endBeat / 4) * 4
    const X = (b: number) => 8 + (b / total) * (W - 16)
    const Y = (p: number) => H - 14 - ((p - lo) / (hi - lo)) * (H - 28)
    for (let p = lo; p <= hi; p++) {
      g.fillStyle = [1, 3, 6, 8, 10].includes(((p % 12) + 12) % 12) ? '#0e1219' : '#121722'
      g.fillRect(8, Y(p + 0.5), W - 16, Y(p - 0.5) - Y(p + 0.5))
      if (p % 12 === 0) (g.fillStyle = '#8a97ad'), (g.font = '10px sans-serif'), g.fillText(noteName(p), 10, Y(p) + 3)
    }
    for (let b = 0; b <= total; b++) {
      g.strokeStyle = b % 4 === 0 ? '#3d4a63' : '#1d2433'
      g.beginPath()
      g.moveTo(X(b) + 0.5, 6)
      g.lineTo(X(b) + 0.5, H - 6)
      g.stroke()
    }
    // what the voice did, frame by frame
    g.fillStyle = '#4cc9f066'
    for (const f of take.frames) if (f.hz > 0 && f.confidence >= 0.6) g.fillRect(X((f.t - shift) / spb) - 1, Y(hzToMidi(f.hz)) - 1, 2, 2)
    // original notes: hollow, at the sung position and pitch
    g.lineWidth = 1.5
    g.strokeStyle = '#ffffff99'
    for (const n of base.notes) {
      g.beginPath()
      g.roundRect(X(n.orig.beat), Y(n.orig.pitch) - 6, Math.max(4, X(n.orig.beat + n.orig.beats) - X(n.orig.beat)), 12, 4)
      g.stroke()
    }
    // interpreted (and transformed) notes: filled
    final.notes.forEach((n, i) => {
      g.globalAlpha = 0.55 + n.velocity * 0.45
      g.fillStyle = COLORS[2]
      g.beginPath()
      g.roundRect(X(n.beat), Y(n.pitch) - 5, Math.max(4, X(n.beat + n.beats) - X(n.beat)), 10, 4)
      g.fill()
      g.globalAlpha = 1
      if (i < 40) (g.fillStyle = '#e8edf5'), (g.font = '10px sans-serif'), g.fillText(noteName(n.pitch), X(n.beat) + 3, Y(n.pitch) - 8)
    })
    if (player.playing) {
      const beat = listenRef.current === 'take' ? (player.pos - shift) / spb : player.pos / spb
      g.fillStyle = '#ff5a36'
      g.fillRect(X(beat), 0, 2, H)
    }
  })

  // ───── actions ─────
  const addOp = (label: string, run: Op['run']) => setOps((o) => [...o, { id: ++opId.current, label, run }])
  const sendToRoll = () => {
    if (!final) return
    const notes = melodyToSongNotes(final)
    const id = session.addTrack('Melody Lab', instrument)
    session.update((d) => {
      d.tracks.find((t) => t.id === id)!.notes = notes
      d.bpm = Math.max(40, Math.min(240, Math.round(bpm)))
      d.bars = Math.max(d.bars, barsFor(final))
    })
    setSent(`${notes.length} notas enviadas ao piano roll em uma nova faixa.`)
  }
  const importFile = async (f: File) => {
    setErr('')
    setBusy('Lendo o arquivo…')
    try {
      await analyse(await decodeAny(new Uint8Array(await f.arrayBuffer())))
    } catch (e) {
      setErr(`Não consegui abrir esse áudio: ${(e as Error).message}`)
      setBusy('')
    }
  }

  const slider = (label: string, value: number, set: (n: number) => void, extra?: React.ReactNode, ends?: [string, string]) => (
    <div className="lab-slider">
      <label>{label}<b>{pct(value)}</b></label>
      <input type="range" min={0} max={1} step={0.01} value={value} onChange={(e) => set(+e.target.value)} />
      {ends && <div className="ends"><span>{ends[0]}</span><span>{ends[1]}</span></div>}
      {extra}
    </div>
  )

  return (
    <div className="lab">
      <div className="lab-head">
        <h3>🎙 Melody Lab</h3>
        <div className="lab-tabs">
          <button className={'lab-tab' + (tab === 'sing' ? ' on' : '')} onClick={() => setTab('sing')}>🎙 Cantar</button>
          <button className={'lab-tab' + (tab === 'math' ? ' on' : '')} onClick={() => setTab('math')} disabled={!final}>🔢 Matemática</button>
        </div>
        <span className="spacer" />
        <span className="note">sua voz é o lápis: a gravação original nunca é alterada</span>
        <button className="chip" title="Fechar" onClick={onClose}>✕</button>
      </div>

      <div className="lab-body">
        <div className="lab-row">
          <button className={'rec' + (recording ? ' live' : '')} title={recording ? 'Parar e analisar' : 'Cantar ideia'} onClick={recording ? stopRec : startRec} disabled={!!busy}>{recording ? '■' : '●'}</button>
          <div style={{ flex: 1, minWidth: 140 }}>
            <b>{recording ? 'Gravando… cante uma nota por vez' : 'Cantar ideia'}</b>
            <div className="meter" style={{ marginTop: 8 }}><i style={{ width: `${level * 100}%` }} /></div>
          </div>
          <label className="pill">+ Importar áudio <input type="file" accept="audio/*" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} /></label>
        </div>
        {busy && <p className="note">{busy}</p>}
        {err && <p className="note" style={{ color: '#ff8a6b' }}>{err}</p>}

        {!take && !busy && <div className="empty-hint" style={{ margin: 0 }}>Cante a melodia ("naaa — na na — naaaa") ou importe um áudio. O sistema detecta altura, duração e dinâmica, mostra o que você fez e deixa você organizar com matemática, sem inventar nada.</div>}

        {take && base && final && interpreted && analysis && delta && tab === 'sing' && (
          <>
            <div className="lab-chips">
              <div className="lab-chip"><small>Tonalidade</small><b>{key ? `${key.tonicName} ${key.mode}` : '—'}</b>{key && <small style={{ textTransform: 'none' }}>confiança {pct(Math.max(0, key.confidence))}</small>}</div>
              <div className="lab-chip"><small>BPM</small><input type="number" min={40} max={240} value={bpm} onChange={(e) => setBpm(Math.max(40, Math.min(240, +e.target.value || 100)))} />
                <button style={{ padding: '0 8px', fontSize: 11 }} onClick={() => setBpm(Math.round(estimateBpm(take.raw)))}>adivinhar</button></div>
              <div className="lab-chip"><small>Compasso</small><b>4/4</b></div>
              <div className="lab-chip"><small>Extensão</small><b>{analysis.names.length ? `${noteName(analysis.range.low)}–${noteName(analysis.range.high)}` : '—'}</b></div>
              <div className="lab-chip"><small>Notas</small><b>{final.notes.length}</b><small style={{ textTransform: 'none' }}>{take.seconds.toFixed(1)} s</small></div>
            </div>

            <canvas ref={canvas} className="lab-view" />
            <div className="note">pontos azuis: o que a voz fez · contorno branco: original · verde: interpretada</div>

            <div className="lab-sliders">
              {slider('Quantização', quantize, setQuantize, (
                <div className="lab-row" style={{ marginTop: 6 }}>
                  <select value={grid} onChange={(e) => setGrid(+e.target.value)}>{Object.entries(GRIDS).map(([k, v]) => <option key={k} value={v}>{k}</option>)}</select>
                  <span className="note">deslocamento máx. {(delta.maxSecondsShift * 1000).toFixed(0)} ms</span>
                </div>))}
              {slider('Correção de afinação', pitchCorrection, setPitchCorrection, (
                <div className="lab-row" style={{ marginTop: 6 }}>
                  <select value={scaleMode} onChange={(e) => setScaleMode(e.target.value as typeof scaleMode)}>
                    <option value="free">semitons livres</option>
                    <option value="detected" disabled={!key}>{key ? `tonalidade detectada (${key.tonicName} ${key.mode})` : 'tonalidade detectada'}</option>
                    <option value="custom">escolher escala…</option>
                  </select>
                  {scaleMode === 'custom' && <>
                    <select value={tonic} onChange={(e) => setTonic(+e.target.value)}>{NOTE_PC.map((n, i) => <option key={n} value={i}>{n}</option>)}</select>
                    <select value={shape} onChange={(e) => setShape(e.target.value as typeof shape)}>{Object.keys(SCALE_SHAPES).map((k) => <option key={k}>{k}</option>)}</select>
                  </>}
                  <span className="note">máx. {delta.maxCents.toFixed(0)} cents</span>
                </div>))}
              {slider('Humano ←→ Matemático', 1 - humanity, (v) => setHumanity(1 - v), <span className="note">0% mantém microtempo e microtom como cantados</span>, ['Humano', 'Matemático'])}
            </div>

            <div className="lab-row">
              <label className="pill"><input type="checkbox" checked={align} onChange={(e) => setAlign(e.target.checked)} style={{ width: 'auto' }} /> começar na primeira nota</label>
              <label className="pill">Instrumento
                <select value={instrument} onChange={(e) => setInstrument(e.target.value as Track['instrument'])}>
                  <option value="synth">🎹 Synth</option><option value="pluck">🎸 Pluck</option><option value="membrane">🥁 Percussão</option><option value="sampler">🔔 Quadrada</option>
                </select>
              </label>
              <span className="spacer" />
              <button onClick={() => play('take')}>{player.playing && listen === 'take' ? '■' : '▶'} Gravação</button>
              <button onClick={() => play('orig')}>{player.playing && listen === 'orig' ? '■' : '▶'} Original</button>
              <button onClick={() => play('final')}>{player.playing && listen === 'final' ? '■' : '▶'} Interpretada</button>
              <button className="primary" onClick={sendToRoll} disabled={!final.notes.length}>Enviar ao piano roll</button>
            </div>
            {sent && <p className="note" style={{ color: '#2ee6a6' }}>{sent}</p>}
          </>
        )}

        {final && analysis && tab === 'math' && (
          <>
            <div className="lab-grid2">
              <div className="lab-sec">
                <h4>Intervalos</h4>
                <div className="lab-pills">
                  {analysis.intervals.map((iv, i) => <span key={i} className={'lab-pill ' + (iv.semitones > 0 ? 'up' : iv.semitones < 0 ? 'down' : '')} title={iv.name}>{signed(iv.semitones)}</span>)}
                  {!analysis.intervals.length && <span className="note">uma nota só</span>}
                </div>
                <div className="note" style={{ marginTop: 8 }}>{analysis.intervals.map((iv) => iv.name).join(' · ')}</div>
              </div>
              <div className="lab-sec">
                <h4>Ritmo</h4>
                <div className="lab-pills"><span className="lab-pill">{analysis.rhythm.ratios.join(' : ') || '—'}</span><span className="note">unidade {analysis.rhythm.unit} tempo</span></div>
                {analysis.rhythm.ratios.length > 0 && (
                  <div className="note" style={{ marginTop: 8, lineHeight: 1.7 }}>
                    ×2 → {rhythmOps.multiply(analysis.rhythm.ratios, 2).join(' : ')}<br />
                    ÷2 → {rhythmOps.divide(analysis.rhythm.ratios, 2).join(' : ')}<br />
                    inverso → {rhythmOps.reverse(analysis.rhythm.ratios).join(' : ')}
                  </div>)}
              </div>
            </div>

            <div className="lab-sec">
              <h4>Frequências e razões</h4>
              <table className="lab-table">
                <thead><tr><th>Nota</th><th>Hz (cantado)</th><th>Razão cantada</th><th>Razão temperada</th></tr></thead>
                <tbody>
                  {final.notes.slice(0, 16).map((n, i) => (
                    <tr key={i}><td>{analysis.names[i]}</td><td>{n.hz.toFixed(1)}</td><td>{analysis.sungRatios[i].toFixed(3)}</td><td>{analysis.tempered[i].toFixed(3)}</td></tr>
                  ))}
                </tbody>
              </table>
              {final.notes.length > 16 && <div className="note">mostrando as 16 primeiras de {final.notes.length}</div>}
            </div>

            <div className="lab-grid2">
              <div className="lab-sec">
                <h4>Harmonia sugerida (você decide)</h4>
                {analysis.chords.length ? analysis.chords.map((c) => (
                  <div key={c.name} style={{ marginBottom: 8 }}>
                    <b>{c.name}</b> <span className="note">cobre {pct(c.coverage)} da melodia</span>
                    <div className="lab-pills" style={{ marginTop: 4 }}>{c.roles.map((r) => <span className="lab-pill" key={r.note}>{r.note} · {r.role}</span>)}</div>
                  </div>)) : <span className="note">Preciso de pelo menos duas notas diferentes.</span>}
              </div>
              <div className="lab-sec">
                <h4>Estrutura e padrões</h4>
                {patterns.length ? patterns.slice(0, 5).map((p, i) => (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <span className="lab-pill">{p.kind === 'exact' ? 'repetição' : p.kind === 'melodic' ? 'mesma melodia, outro ritmo' : 'mesmo ritmo'}</span>{' '}
                    {p.length} notas em {p.positions.map((x) => x + 1).join(', ')}
                    {p.kind !== 'rhythmic' && p.shifts.some((s) => s !== 0) && <span className="note"> (transposta {p.shifts.map(signed).join(', ')} semitons)</span>}
                  </div>)) : <span className="note">Nenhuma repetição encontrada ainda.</span>}
              </div>
            </div>

            <div className="lab-sec">
              <h4>Transformações (aplicadas sobre a versão interpretada, reversíveis)</h4>
              <div className="lab-ops">
                <button onClick={() => addOp('transpor +1', (m) => transpose(m, 1))}>+1 semitom</button>
                <button onClick={() => addOp('transpor −1', (m) => transpose(m, -1))}>−1 semitom</button>
                <button onClick={() => addOp('transpor +12', (m) => transpose(m, 12))}>+1 oitava</button>
                <button onClick={() => addOp('transpor −12', (m) => transpose(m, -12))}>−1 oitava</button>
                <button onClick={() => addOp('espelhar', (m) => invert(m))}>Espelhar intervalos</button>
                <button onClick={() => addOp('retrógrada', (m) => retrograde(m))}>Retrógrada</button>
                <button onClick={() => addOp('ritmo inverso', (m) => reverseRhythm(m))}>Ritmo inverso</button>
                <button onClick={() => addOp('×2 duração', (m) => stretch(m, 2))}>×2</button>
                <button onClick={() => addOp('÷2 duração', (m) => stretch(m, 0.5))}>÷2</button>
                <button onClick={() => addOp('repetir ×2', (m) => repeat(m, 2))}>Repetir ×2</button>
              </div>
              {ops.length > 0 && (
                <div className="lab-pills" style={{ marginTop: 10 }}>
                  {ops.map((o) => <span className="lab-pill" key={o.id}>{o.label} <button className="chip" style={{ width: 18, height: 18, fontSize: 10 }} onClick={() => setOps((l) => l.filter((x) => x.id !== o.id))}>✕</button></span>)}
                  <button onClick={() => setOps([])}>limpar</button>
                </div>)}
            </div>
            <div className="lab-row">
              <button onClick={() => play('orig')}>{player.playing && listen === 'orig' ? '■' : '▶'} Original</button>
              <button onClick={() => play('final')}>{player.playing && listen === 'final' ? '■' : '▶'} Resultado</button>
              <span className="spacer" />
              <button className="primary" onClick={sendToRoll} disabled={!final.notes.length}>Enviar ao piano roll</button>
            </div>
            {sent && <p className="note" style={{ color: '#2ee6a6' }}>{sent}</p>}
          </>
        )}
      </div>
    </div>
  )
}
