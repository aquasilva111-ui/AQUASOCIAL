import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { MixClip, MixSession, MixTrack } from 'aqua-runtime/src/adapters/mix'
import { renderMix } from 'aqua-runtime/src/render/mix'
import type { Pcm } from 'aqua-runtime/src/render/wav'

import { decodeAny, download, runtime, store } from '../hub'
import { usePlayer } from './audio-play'
import { UndoRedo, useSession } from './hooks'

const HEAD = 200 // track header width, px
const LANE = 64 // track height, px
const BINS = 200 // peak bins per second
const COLORS = ['#ff5a8a', '#ffb703', '#2ee6a6', '#4cc9f0', '#b388ff', '#ff8a4c']
const MIN = 0.05

/** min/max per bin of the first channel, for drawing waveforms without touching the samples again. */
function peaksOf(pcm: Pcm): Float32Array {
  const ch = pcm.channels[0]
  const per = Math.max(1, Math.floor(pcm.sampleRate / BINS))
  const n = Math.ceil(ch.length / per)
  const out = new Float32Array(n * 2)
  for (let b = 0; b < n; b++) {
    let lo = 0
    let hi = 0
    for (let i = b * per; i < Math.min(ch.length, (b + 1) * per); i++) {
      lo = Math.min(lo, ch[i])
      hi = Math.max(hi, ch[i])
    }
    out[b * 2] = lo
    out[b * 2 + 1] = hi
  }
  return out
}

function Wave({ peaks, from, to, width, color }: { peaks?: Float32Array; from: number; to: number; width: number; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const w = Math.max(1, Math.min(4000, Math.floor(width)))
    c.width = w
    c.height = LANE - 8
    const g = c.getContext('2d')!
    g.clearRect(0, 0, w, c.height)
    if (!peaks) return
    g.fillStyle = color
    const mid = c.height / 2
    for (let x = 0; x < w; x++) {
      const a = Math.floor((from + ((to - from) * x) / w) * BINS)
      const b = Math.max(a + 1, Math.floor((from + ((to - from) * (x + 1)) / w) * BINS))
      let lo = 0
      let hi = 0
      for (let i = a; i < b && i * 2 + 1 < peaks.length; i++) {
        lo = Math.min(lo, peaks[i * 2])
        hi = Math.max(hi, peaks[i * 2 + 1])
      }
      g.fillRect(x, mid - hi * mid, 1, Math.max(1, (hi - lo) * mid))
    }
  }, [peaks, from, to, width, color])
  return <canvas ref={ref} style={{ width: '100%', height: LANE - 8, display: 'block', border: 0, borderRadius: 0, background: 'transparent', pointerEvents: 'none' }} />
}

export default function MixPanel({ itemId }: { itemId: string }) {
  const { session, refresh } = useSession<MixSession>(itemId)
  const [pcms, setPcms] = useState<Record<string, Pcm>>({})
  const [peaks, setPeaks] = useState<Record<string, Float32Array>>({})
  const [sel, setSel] = useState<string | null>(null)
  const [trackId, setTrackId] = useState<string | undefined>()
  const [pps, setPps] = useState(40)
  const [err, setErr] = useState('')
  const pcmRef = useRef(pcms)
  pcmRef.current = pcms
  const loading = useRef(new Map<string, Promise<Pcm | undefined>>())
  const lanes = useRef<Record<string, HTMLDivElement | null>>({})
  const mix = session?.state

  const load = useCallback((hash: string) => {
    let p = loading.current.get(hash)
    if (!p) {
      p = store
        .get(hash)
        .then((b) => (b ? decodeAny(b.bytes) : undefined))
        .then((pcm) => {
          if (pcm) {
            setPcms((m) => ({ ...m, [hash]: pcm }))
            setPeaks((m) => ({ ...m, [hash]: peaksOf(pcm) }))
          }
          return pcm
        })
        .catch(() => undefined)
      loading.current.set(hash, p)
    }
    return p
  }, [])
  const hashes = useMemo(() => [...new Set((mix?.tracks ?? []).flatMap((t) => t.clips.map((c) => c.asset)))], [mix])
  useEffect(() => void hashes.forEach(load), [hashes, load])

  const player = usePlayer(async () => {
    if (!session) return null
    await Promise.all(hashes.map(load))
    return renderMix(session.state, pcmRef.current)
  }, mix)

  if (!session || !mix) return <p className="note">Abrindo…</p>
  const total = Math.max(session.duration(), 10)
  const track = mix.tracks.find((t) => t.id === trackId) ?? mix.tracks[0]
  const found = mix.tracks.flatMap((t, ti) => t.clips.map((c) => ({ c, t, ti }))).find((x) => x.c.id === sel)
  const setTrack = (id: string, f: Partial<MixTrack>) => session.update((d) => void Object.assign(d.tracks.find((t) => t.id === id)!, f))
  const setClip = (id: string, f: Partial<MixClip>) =>
    session.update((d) => {
      for (const t of d.tracks) {
        const c = t.clips.find((x) => x.id === id)
        if (c) return void Object.assign(c, f)
      }
    })
  const srcLen = (c: MixClip) => (pcms[c.asset] ? pcms[c.asset].channels[0].length / pcms[c.asset].sampleRate : c.out)

  const addFile = async (file: File) => {
    setErr('')
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const pcm = await decodeAny(bytes)
      const ref = await store.put(bytes, file.type || 'audio/wav')
      const tid = track?.id ?? session.addTrack()
      setTrackId(tid)
      setSel(session.addClip(tid, ref.hash, pcm.channels[0].length / pcm.sampleRate, player.pos))
    } catch (e) {
      setErr(`Não consegui abrir esse áudio: ${(e as Error).message}`)
    }
  }
  const split = () => {
    const f = found ?? mix.tracks.flatMap((t) => t.clips).map((c) => ({ c })).find((x) => player.pos > x.c.start && player.pos < x.c.start + (x.c.out - x.c.in))
    if (!f) return
    try {
      setSel(session.splitClip(f.c.id, player.pos))
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const remove = () => {
    if (!sel) return
    session.removeClip(sel)
    setSel(null)
  }

  const trackAt = (y: number) => mix.tracks.find((t) => {
    const r = lanes.current[t.id]?.getBoundingClientRect()
    return r && y >= r.top && y <= r.bottom
  })
  const startMove = (e: React.PointerEvent, c: MixClip) => {
    e.preventDefault()
    setSel(c.id)
    const x0 = e.clientX
    const s0 = c.start
    const move = (ev: PointerEvent) => session.moveClip(c.id, Math.max(0, +(s0 + (ev.clientX - x0) / pps).toFixed(3)), trackAt(ev.clientY)?.id)
    const up = () => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up))
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const startTrim = (e: React.PointerEvent, c: MixClip, edge: 'in' | 'out') => {
    e.stopPropagation()
    e.preventDefault()
    setSel(c.id)
    const x0 = e.clientX
    const [in0, out0] = [c.in, c.out]
    const move = (ev: PointerEvent) => {
      const d = (ev.clientX - x0) / pps
      try {
        if (edge === 'in') session.trimClip(c.id, Math.max(0, Math.min(in0 + d, out0 - MIN)), out0)
        else session.trimClip(c.id, in0, Math.min(srcLen(c), Math.max(out0 + d, in0 + MIN)))
      } catch {
        /* clamped above */
      }
    }
    const up = () => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up))
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const ticks = Array.from({ length: Math.floor(total) + 1 }, (_, i) => i).filter((i) => i % (pps >= 40 ? 1 : pps >= 20 ? 2 : 5) === 0)

  return (
    <div
      className="studio"
      tabIndex={0}
      style={{ outline: 'none' }}
      onKeyDown={(e) => {
        if (['INPUT', 'SELECT'].includes((e.target as HTMLElement).tagName)) return
        if (e.key === ' ') (e.preventDefault(), player.playing ? player.stop() : void player.play(player.pos))
        else if (e.key.toLowerCase() === 's') split()
        else if (e.key === 'Delete' || e.key === 'Backspace') remove()
      }}
    >
      <div className="transport">
        <button className="round" title="Voltar ao início" onClick={() => (player.stop(), player.seek(0))}>⏮</button>
        <button className="play" title="Tocar / parar (espaço)" onClick={() => (player.playing ? player.stop() : void player.play(player.pos))}>{player.playing ? '■' : '▶'}</button>
        <div className="lcd">{Math.floor(player.pos / 60)}:{(player.pos % 60).toFixed(1).padStart(4, '0')}<small>de {Math.floor(total / 60)}:{(total % 60).toFixed(0).padStart(2, '0')}</small></div>
        <button onClick={() => setTrackId(session.addTrack())}>＋ Faixa</button>
        <label className="pill">+ Áudio <input type="file" accept="audio/*" onChange={(e) => e.target.files?.[0] && addFile(e.target.files[0])} /></label>
        <button disabled={!mix.tracks.length} onClick={split}>Dividir (S)</button>
        <button disabled={!sel} onClick={remove}>Apagar clipe</button>
        <span className="spacer" />
        <UndoRedo itemId={itemId} refresh={refresh} />
        <label className="pill">Zoom <input type="range" min={10} max={160} value={pps} onChange={(e) => setPps(+e.target.value)} /></label>
        <label className="pill">Master <input type="range" min={-24} max={6} step={1} value={mix.masterDb} onChange={(e) => session.update((d) => void (d.masterDb = +e.target.value))} /> {mix.masterDb} dB</label>
        <button className="primary" disabled={!mix.tracks.some((t) => t.clips.length)} onClick={async () => {
          const out = await runtime.exportForLaunch(itemId, 'audio')
          if (out) download(out.bytes, 'mixagem.wav', out.mime)
        }}>Baixar WAV</button>
      </div>
      {err && <p className="note" style={{ color: '#ff8a6b', padding: '0 16px' }}>{err}</p>}

      {/* Always rendered with a fixed height: selecting a clip must not shift the tracks mid-drag. */}
      <div className="transport" style={{ position: 'static', background: 'transparent', borderBottom: 0, minHeight: 52 }}>
        {!found && <span className="note">Selecione um clipe para ajustar ganho e fades.</span>}
        {found && (<>
          <b>Clipe</b>
          <label className="field">Ganho (dB) <input type="number" step={1} value={found.c.gainDb} style={{ width: 64 }} onChange={(e) => setClip(found.c.id, { gainDb: +e.target.value || 0 })} /></label>
          <label className="field">Fade in (s) <input type="number" min={0} step={0.1} value={found.c.fadeIn} style={{ width: 64 }} onChange={(e) => setClip(found.c.id, { fadeIn: Math.max(0, +e.target.value || 0) })} /></label>
          <label className="field">Fade out (s) <input type="number" min={0} step={0.1} value={found.c.fadeOut} style={{ width: 64 }} onChange={(e) => setClip(found.c.id, { fadeOut: Math.max(0, +e.target.value || 0) })} /></label>
          <span className="note">{(found.c.out - found.c.in).toFixed(2)} s</span>
        </>)}
      </div>

      {!mix.tracks.length ? (
        <p className="empty-hint">Adicione uma faixa e um arquivo de áudio. Arraste os clipes (também entre faixas) e as bordas para cortar; S divide no cursor; clique na régua para posicionar. Volume, pan, M (mudo) e S (solo) valem na pré-escuta e na exportação.</p>
      ) : (
        <div className="mixlanes">
          <div style={{ position: 'relative', width: HEAD + total * pps, minWidth: '100%' }}>
            <div
              style={{ display: 'flex', height: 22, background: '#10141b', cursor: 'pointer' }}
              onPointerDown={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                const p = Math.max(0, (e.clientX - r.left - HEAD) / pps)
                player.seek(p)
                if (player.playing) void player.play(p)
              }}
            >
              <div style={{ width: HEAD, flex: 'none', position: 'sticky', left: 0, background: '#10141b', zIndex: 3 }} />
              <div style={{ position: 'relative', flex: 1 }}>
                {ticks.map((i) => <span key={i} style={{ position: 'absolute', left: i * pps, fontSize: 10, color: '#8a97ad', borderLeft: '1px solid #263042', paddingLeft: 2, height: 22 }}>{i}s</span>)}
              </div>
            </div>
            {mix.tracks.map((t, ti) => (
              <div key={t.id} style={{ display: 'flex', height: LANE, borderTop: '1px solid #263042' }}>
                <div onPointerDown={() => setTrackId(t.id)} style={{ width: HEAD, flex: 'none', position: 'sticky', left: 0, zIndex: 3, background: t.id === track?.id ? '#1d2430' : '#161b24', borderRight: `4px solid ${COLORS[ti % COLORS.length]}`, padding: '4px 8px', fontSize: 12 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input value={t.name} style={{ width: 80, fontSize: 12 }} onChange={(e) => setTrack(t.id, { name: e.target.value })} />
                    <button style={{ padding: '0 6px', ...(t.muted ? { background: 'var(--orange)', color: '#fff' } : {}) }} onClick={() => setTrack(t.id, { muted: !t.muted })}>M</button>
                    <button style={{ padding: '0 6px', ...(t.solo ? { background: 'var(--blue)', color: '#fff' } : {}) }} onClick={() => setTrack(t.id, { solo: !t.solo })}>S</button>
                    <button style={{ padding: '0 6px' }} title="Remover faixa" onClick={() => { session.removeTrack(t.id); setSel(null) }}>✕</button>
                  </div>
                  <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>vol <input type="range" min={-30} max={6} value={t.volumeDb} style={{ width: 90 }} onChange={(e) => setTrack(t.id, { volumeDb: +e.target.value })} /> {t.volumeDb}</label>
                  <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>pan <input type="range" min={-1} max={1} step={0.1} value={t.pan} style={{ width: 90 }} onChange={(e) => setTrack(t.id, { pan: +e.target.value })} /></label>
                </div>
                <div ref={(el) => void (lanes.current[t.id] = el)} style={{ position: 'relative', flex: 1, background: t.muted ? 'repeating-linear-gradient(45deg,transparent 0 6px,#1b2230 6px 12px)' : undefined }}>
                  {t.clips.map((c) => (
                    <div
                      key={c.id}
                      onPointerDown={(e) => startMove(e, c)}
                      style={{ position: 'absolute', left: c.start * pps, width: Math.max(4, (c.out - c.in) * pps), top: 3, height: LANE - 6, borderRadius: 6, overflow: 'hidden', cursor: 'grab', background: COLORS[ti % COLORS.length] + '26', border: `1px solid ${COLORS[ti % COLORS.length]}`, outline: c.id === sel ? '2px solid #fff' : undefined, opacity: t.muted ? 0.4 : 1 }}
                    >
                      <Wave peaks={peaks[c.asset]} from={c.in} to={c.out} width={(c.out - c.in) * pps} color={COLORS[ti % COLORS.length]} />
                      <span onPointerDown={(e) => startTrim(e, c, 'in')} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, cursor: 'ew-resize', background: '#0003' }} />
                      <span onPointerDown={(e) => startTrim(e, c, 'out')} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'ew-resize', background: '#0003' }} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: HEAD + player.pos * pps, width: 2, background: '#ff5a36', pointerEvents: 'none', zIndex: 4 }} />
          </div>
        </div>
      )}
      <p className="note" style={{ padding: "10px 16px" }}>A pré-escuta usa o mesmo cálculo da exportação (WAV estéreo 44,1 kHz). Edições durante a reprodução reiniciam o som de onde estava.</p>
    </div>
  )
}
