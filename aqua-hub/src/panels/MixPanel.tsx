import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { clipRange, type MixClip, type MixSession, type MixTrack } from 'aqua-runtime/src/adapters/mix'
import { renderMix } from 'aqua-runtime/src/render/mix'
import type { Pcm } from 'aqua-runtime/src/render/wav'

import { decodeAny, download, runtime, store } from '../hub'
import { usePlayer } from './audio-play'
import { useSession } from './hooks'
import { Icon, IconButton } from './Icon'
import { Knob } from './Knob'

const HEAD = 188 // track header width, px
const ROW = 104 // track height, px
const BINS = 200 // waveform peaks per second
const COLORS = ['#ff6a2b', '#7c5cff', '#ff2d6f', '#2f8cff', '#19c37d', '#ffb703', '#17c3d9']
const MIN = 0.05
type Tool = 'select' | 'range' | 'split'
type Range = { clipId: string; from: number; to: number }
type Menu = { x: number; y: number; clipId?: string; trackId?: string; at: number }

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`
const isMedia = (f: File) => /^(audio|video)\//.test(f.type) || /\.(wav|mp3|m4a|aac|ogg|oga|flac|webm|mp4|mov|aif|aiff)$/i.test(f.name)
const hasFiles = (e: React.DragEvent) => [...e.dataTransfer.types].includes('Files')

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

/** Waveform as thin vertical bars with a soft glow, like the reference editors. */
function Wave({ peaks, from, to, width, height, color }: { peaks?: Float32Array; from: number; to: number; width: number; height: number; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const w = Math.max(1, Math.min(4000, Math.floor(width)))
    c.width = w
    c.height = height
    const g = c.getContext('2d')!
    g.clearRect(0, 0, w, height)
    if (!peaks) return
    const mid = height / 2
    const bar = 2
    const step = 3
    g.fillStyle = color
    g.shadowColor = color
    g.shadowBlur = 4
    for (let x = 0; x < w; x += step) {
      const a = Math.floor((from + ((to - from) * x) / w) * BINS)
      const b = Math.max(a + 1, Math.floor((from + ((to - from) * (x + step)) / w) * BINS))
      let amp = 0
      for (let i = a; i < b && i * 2 + 1 < peaks.length; i++) amp = Math.max(amp, -peaks[i * 2], peaks[i * 2 + 1])
      const h = Math.max(2, Math.min(1, amp * 1.15) * (height - 22))
      g.beginPath()
      g.roundRect(x, mid - h / 2 + 6, bar, h, 1)
      g.fill()
    }
  }, [peaks, from, to, width, height, color])
  return <canvas ref={ref} style={{ width: '100%', height, display: 'block', border: 0, borderRadius: 0, background: 'transparent', pointerEvents: 'none' }} />
}

export default function MixPanel({ itemId }: { itemId: string }) {
  const { session, refresh } = useSession<MixSession>(itemId)
  const [pcms, setPcms] = useState<Record<string, Pcm>>({})
  const [peaks, setPeaks] = useState<Record<string, Float32Array>>({})
  const [sel, setSel] = useState<string | null>(null)
  const [trackId, setTrackId] = useState<string | undefined>()
  const [pps, setPps] = useState(40)
  const [err, setErr] = useState('')
  const [tool, setTool] = useState<Tool>('select')
  const [range, setRange] = useState<Range | null>(null)
  const [clip, setClip] = useState<Omit<MixClip, 'id'> | null>(null) // clipboard
  const [menu, setMenu] = useState<Menu | null>(null)
  const [dropOver, setDropOver] = useState<{ trackId?: string } | null>(null)
  const [trackDrag, setTrackDrag] = useState<{ id: string; over: number } | null>(null)
  const [view, setView] = useState({ left: 0, width: 600 })
  const pcmRef = useRef(pcms)
  pcmRef.current = pcms
  const loading = useRef(new Map<string, Promise<Pcm | undefined>>())
  const lanes = useRef<Record<string, HTMLDivElement | null>>({})
  const scroller = useRef<HTMLDivElement>(null)
  const overview = useRef<HTMLCanvasElement>(null)
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

  const total = mix ? Math.max(session!.duration(), 10) : 10
  const track = mix?.tracks.find((t) => t.id === trackId) ?? mix?.tracks[0]
  const found = mix?.tracks.flatMap((t, ti) => t.clips.map((c) => ({ c, t, ti }))).find((x) => x.c.id === sel)

  // ───── overview minimap ─────
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const upd = () => setView({ left: el.scrollLeft, width: el.clientWidth })
    upd()
    el.addEventListener('scroll', upd)
    const ro = new ResizeObserver(upd)
    ro.observe(el)
    return () => (el.removeEventListener('scroll', upd), ro.disconnect())
  }, [!!mix?.tracks.length])
  useEffect(() => {
    const c = overview.current
    if (!c || !mix) return
    c.width = 1000
    c.height = 54
    const g = c.getContext('2d')!
    g.clearRect(0, 0, 1000, 54)
    const n = Math.max(1, mix.tracks.length)
    mix.tracks.forEach((t, ti) => {
      g.fillStyle = COLORS[ti % COLORS.length]
      for (const cl of t.clips) {
        const x = (cl.start / total) * 1000
        const w = Math.max(2, ((cl.out - cl.in) / total) * 1000)
        g.globalAlpha = 0.85
        g.beginPath()
        g.roundRect(x, 4 + (ti * 46) / n, w, Math.max(3, 46 / n - 3), 2)
        g.fill()
      }
    })
    g.globalAlpha = 1
    g.fillStyle = '#ff5a1f'
    g.fillRect((player.pos / total) * 1000, 0, 2, 54)
  })

  if (!session || !mix) return <p className="note">Abrindo…</p>

  // ───── helpers ─────
  const setTrack = (id: string, f: Partial<MixTrack>) => session.update((d) => void Object.assign(d.tracks.find((t) => t.id === id)!, f))
  const setClipProps = (id: string, f: Partial<MixClip>) =>
    session.update((d) => {
      for (const t of d.tracks) {
        const c = t.clips.find((x) => x.id === id)
        if (c) return void Object.assign(c, f)
      }
    })
  const srcLen = (c: MixClip) => (pcms[c.asset] ? pcms[c.asset].channels[0].length / pcms[c.asset].sampleRate : c.out)
  const colorOf = (ti: number) => COLORS[ti % COLORS.length]
  const trackAt = (y: number) => mix.tracks.find((t) => {
    const r = lanes.current[t.id]?.getBoundingClientRect()
    return r && y >= r.top && y <= r.bottom
  })
  const timeAt = (clientX: number, tid?: string) => {
    const el = lanes.current[tid ?? track?.id ?? '']
    return el ? Math.max(0, (clientX - el.getBoundingClientRect().left) / pps) : 0
  }
  const findClip = (id?: string) => mix.tracks.flatMap((t) => t.clips.map((c) => ({ c, t }))).find((x) => x.c.id === id)

  // ───── adding audio (button, drag and drop) ─────
  const addFiles = async (files: File[], onTrack: string | undefined, at: number) => {
    setErr('')
    const list = files.filter(isMedia)
    if (!list.length) return setErr('Solte arquivos de áudio ou vídeo (WAV, MP3, M4A, OGG, MP4…).')
    let first = true
    for (const file of list) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const pcm = await decodeAny(bytes)
        const ref = await store.put(bytes, file.type || 'audio/wav')
        const tid = first && onTrack ? onTrack : session.addTrack(file.name.replace(/\.[^.]+$/, '').slice(0, 24))
        first = false
        setTrackId(tid)
        setSel(session.addClip(tid, ref.hash, pcm.channels[0].length / pcm.sampleRate, at, file.name.replace(/\.[^.]+$/, '')))
      } catch (e) {
        setErr(`Não consegui abrir "${file.name}": ${(e as Error).message}`)
      }
    }
  }

  // ───── clip operations (used by the context menu and the keyboard) ─────
  const cut = (id: string) => (copy(id), remove(id))
  const copy = (id: string) => {
    const f = findClip(id)
    if (!f) return
    try {
      setClip(range && range.clipId === id ? clipRange(f.c, range.from, range.to) : (({ id: _i, ...rest }) => rest)(f.c))
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const remove = (id: string) => {
    try {
      if (range && range.clipId === id) session.removeRange(id, range.from, range.to)
      else session.removeClip(id)
      setRange(null)
      if (sel === id) setSel(null)
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const paste = (tid?: string, at?: number) => {
    const t = tid ?? track?.id
    if (!clip || !t) return
    setSel(session.pasteClip(t, clip, at ?? player.pos))
  }
  const duplicate = (id: string) => {
    const f = findClip(id)
    if (!f) return
    if (range && range.clipId === id) {
      const part = clipRange(f.c, range.from, range.to)
      setSel(session.pasteClip(f.t.id, part, range.to))
    } else setSel(session.duplicateClip(id))
  }
  const split = (id?: string, at = player.pos) => {
    const target = id ?? sel ?? mix.tracks.flatMap((t) => t.clips).find((c) => at > c.start && at < c.start + (c.out - c.in))?.id
    if (!target) return
    try {
      setSel(session.splitClip(target, at))
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  // ───── pointer interactions on clips ─────
  const startMove = (e: React.PointerEvent, c: MixClip) => {
    e.preventDefault()
    setSel(c.id)
    setRange(null)
    const x0 = e.clientX
    const s0 = c.start
    const move = (ev: PointerEvent) => session.moveClip(c.id, Math.max(0, +(s0 + (ev.clientX - x0) / pps).toFixed(3)), trackAt(ev.clientY)?.id)
    const up = () => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up))
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const startRange = (e: React.PointerEvent, c: MixClip, tid: string) => {
    e.preventDefault()
    setSel(c.id)
    const end = c.start + (c.out - c.in)
    const clampT = (t: number) => Math.max(c.start, Math.min(end, t))
    const a = clampT(timeAt(e.clientX, tid))
    setRange({ clipId: c.id, from: a, to: a })
    const move = (ev: PointerEvent) => setRange({ clipId: c.id, from: a, to: clampT(timeAt(ev.clientX, tid)) })
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const b = clampT(timeAt(ev.clientX, tid))
      setRange(Math.abs(b - a) < MIN ? null : { clipId: c.id, from: Math.min(a, b), to: Math.max(a, b) })
    }
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
  const clipPointerDown = (e: React.PointerEvent, c: MixClip, tid: string) => {
    if (e.button !== 0) return
    setMenu(null)
    if (tool === 'range') return startRange(e, c, tid)
    if (tool === 'split') {
      setSel(c.id)
      return split(c.id, timeAt(e.clientX, tid))
    }
    startMove(e, c)
  }

  const jump = (d: number) => {
    const p = Math.max(0, Math.min(total, player.pos + d))
    player.seek(p)
    if (player.playing) void player.play(p)
  }
  const seekOverview = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const el = scroller.current
    if (el) el.scrollLeft = ((e.clientX - r.left) / r.width) * (HEAD + total * pps) - el.clientWidth / 2
  }
  const ticks = Array.from({ length: Math.floor(total) + 1 }, (_, i) => i).filter((i) => i % (pps >= 40 ? 1 : pps >= 20 ? 2 : 5) === 0)
  const menuClip = menu?.clipId ? findClip(menu.clipId) : undefined
  const selRange = found && range && range.clipId === found.c.id ? range : null
  const spanStart = selRange ? selRange.from : found?.c.start ?? 0
  const spanEnd = selRange ? selRange.to : found ? found.c.start + (found.c.out - found.c.in) : 0
  const go = () => (player.playing ? player.stop() : void player.play(player.pos))

  return (
    <div
      className="studio"
      tabIndex={0}
      style={{ outline: 'none' }}
      onClick={() => menu && setMenu(null)}
      onKeyDown={(e) => {
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
        const mod = e.metaKey || e.ctrlKey
        const k = e.key.toLowerCase()
        if (e.key === ' ') (e.preventDefault(), go())
        else if (mod && k === 'c' && sel) (e.preventDefault(), copy(sel))
        else if (mod && k === 'x' && sel) (e.preventDefault(), cut(sel))
        else if (mod && k === 'v') (e.preventDefault(), paste())
        else if (mod && k === 'd' && sel) (e.preventDefault(), duplicate(sel))
        else if (!mod && k === 's') split()
        else if (e.key === 'Delete' || e.key === 'Backspace') sel && remove(sel)
        else if (e.key === 'Escape') (setRange(null), setMenu(null))
      }}
    >
      <div className="mx-top">
        <div className="mx-tools" role="toolbar" aria-label="Ferramentas">
          <IconButton variant="tool" icon="cursor" label="Selecionar e mover (V)" active={tool === 'select'} onClick={() => setTool('select')} />
          <IconButton variant="tool" icon="ibeam" label="Selecionar trecho dentro do clipe (I)" active={tool === 'range'} onClick={() => setTool('range')} />
          <IconButton variant="tool" icon="scissors" label="Dividir clicando no clipe" active={tool === 'split'} onClick={() => setTool('split')} />
        </div>
        <IconButton variant="pill" icon="plus" text="Faixa" label="Adicionar faixa" onClick={() => setTrackId(session.addTrack())} />
        <label className="pill">+ Áudio <input type="file" accept="audio/*,video/*" multiple onChange={(e) => e.target.files && addFiles([...e.target.files], track?.id, player.pos)} /></label>
        <span className="spacer" />
        <IconButton variant="primary" icon="download" text="Exportar WAV" label="Exportar WAV" disabled={!mix.tracks.some((t) => t.clips.length)} onClick={async () => {
          const out = await runtime.exportForLaunch(itemId, 'audio')
          if (out) download(out.bytes, 'mixagem.wav', out.mime)
        }} />
      </div>
      {err && <p className="note" style={{ color: '#ff8a6b', padding: '0 16px' }}>{err}</p>}

      <div className="mx-wrap">
      <div className="mx-main">
        <div
          className="mx-stage"
          onDragEnter={(e) => hasFiles(e) && e.preventDefault()}
          onDragOver={(e) => {
            if (!hasFiles(e)) return
            e.preventDefault()
            setDropOver({ trackId: trackAt(e.clientY)?.id })
          }}
          onDragLeave={(e) => e.currentTarget.contains(e.relatedTarget as Node) || setDropOver(null)}
          onDrop={(e) => {
            if (!hasFiles(e)) return
            e.preventDefault()
            const target = trackAt(e.clientY)?.id
            setDropOver(null)
            void addFiles([...e.dataTransfer.files], target, target ? timeAt(e.clientX, target) : 0)
          }}
        >
          {dropOver && <div className="mx-drop">{dropOver.trackId ? 'Solte para colocar nesta faixa' : 'Solte para criar uma faixa'}</div>}
          {!mix.tracks.length ? (
            <div className="empty-hint" style={{ margin: 16 }}>Arraste arquivos de áudio ou vídeo para cá, ou use “+ Áudio”. Cada arquivo vira uma faixa. Dentro da faixa: arraste clipes (também entre faixas), as bordas para cortar, use a ferramenta Ⅰ para selecionar um trecho, clique com o botão direito para o menu. Espaço toca.</div>
          ) : (
            <div className="mx-scroll" ref={scroller}>
              <div style={{ position: 'relative', width: HEAD + total * pps, minWidth: '100%' }}>
                <div className="mx-ruler" onPointerDown={(e) => {
                  const p = Math.max(0, (e.clientX - e.currentTarget.getBoundingClientRect().left - HEAD) / pps)
                  player.seek(p)
                  if (player.playing) void player.play(p)
                }}>
                  <div style={{ position: 'sticky', left: 0, width: HEAD, height: 26, background: '#0e0e12', zIndex: 6, display: 'inline-block' }} />
                  {ticks.map((i) => <span key={i} className="mx-tick" style={{ left: HEAD + i * pps }}>{String(Math.floor(i / 60)).padStart(2, '0')}:{String(i % 60).padStart(2, '0')}</span>)}
                </div>
                {mix.tracks.map((t, ti) => {
                  const c = colorOf(ti)
                  return (
                    <div className="mx-row" key={t.id} style={{ ['--c' as string]: c }}>
                      <div
                        className={'mx-head' + (trackDrag && trackDrag.over === ti && trackDrag.id !== t.id ? ' drop' : '')}
                        style={{ background: t.id === track?.id ? `linear-gradient(90deg, ${c}38, #121216 75%)` : undefined }}
                        onPointerDown={() => setTrackId(t.id)}
                        onDragOver={(e) => {
                          if (!trackDrag) return
                          e.preventDefault()
                          setTrackDrag({ ...trackDrag, over: ti })
                        }}
                        onDrop={(e) => {
                          if (!trackDrag) return
                          e.preventDefault()
                          session.moveTrack(trackDrag.id, ti)
                          setTrackDrag(null)
                        }}
                      >
                        <div className="row1">
                          <span
                            className="mx-grip" title="Arraste para reordenar a faixa" draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/x-aqua-track', t.id)
                              e.dataTransfer.effectAllowed = 'move'
                              setTrackDrag({ id: t.id, over: ti })
                            }}
                            onDragEnd={() => setTrackDrag(null)}
                          ><Icon name="grip" size={16} /></span>
                          <input className="mx-name" value={t.name} onChange={(e) => setTrack(t.id, { name: e.target.value })} />
                          <button className={'mx-pill m' + (t.muted ? ' on' : '')} title="Mudo" onClick={() => setTrack(t.id, { muted: !t.muted })}>M</button>
                          <button className={'mx-pill s' + (t.solo ? ' on' : '')} title="Solo" onClick={() => setTrack(t.id, { solo: !t.solo })}>S</button>
                        </div>
                        <div className="mx-knobs">
                          <Knob label="vol" compact size={36} value={t.volumeDb} min={-30} max={6} defaultValue={0} color={c} format={(v) => `${v}dB`} onChange={(v) => setTrack(t.id, { volumeDb: v })} />
                          <Knob label="pan" compact size={36} value={t.pan} min={-1} max={1} step={0.05} bipolar color={c} format={(v) => (Math.abs(v) < 0.03 ? 'C' : `${v < 0 ? 'L' : 'R'}${Math.round(Math.abs(v) * 100)}`)} onChange={(v) => setTrack(t.id, { pan: v })} />
                          <IconButton variant="round" className="sm danger" icon="trash" label="Remover faixa" style={{ marginLeft: 'auto' }} onClick={() => { session.removeTrack(t.id); setSel(null) }} />
                        </div>
                      </div>
                      <div
                        ref={(el) => void (lanes.current[t.id] = el)}
                        className="mx-lane"
                        style={{ opacity: t.muted ? 0.45 : 1 }}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setTrackId(t.id)
                          setMenu({ x: e.clientX, y: e.clientY, trackId: t.id, at: timeAt(e.clientX, t.id) })
                        }}
                      >
                        {t.clips.map((cl) => {
                          const w = (cl.out - cl.in) * pps
                          const r = range && range.clipId === cl.id ? range : null
                          return (
                            <div
                              key={cl.id}
                              className={'mx-clip' + (cl.id === sel ? ' sel' : '')}
                              style={{ left: cl.start * pps, width: Math.max(6, w), ['--c' as string]: c, cursor: tool === 'range' ? 'text' : tool === 'split' ? 'crosshair' : 'grab' }}
                              onPointerDown={(e) => clipPointerDown(e, cl, t.id)}
                              onContextMenu={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setSel(cl.id)
                                setTrackId(t.id)
                                setMenu({ x: e.clientX, y: e.clientY, clipId: cl.id, trackId: t.id, at: timeAt(e.clientX, t.id) })
                              }}
                            >
                              <span className="tag">{cl.name || 'Áudio'}</span>
                              <Wave peaks={peaks[cl.asset]} from={cl.in} to={cl.out} width={w} height={ROW - 14} color={c} />
                              <span className="edge" style={{ left: 0 }} onPointerDown={(e) => startTrim(e, cl, 'in')} />
                              <span className="edge" style={{ right: 0 }} onPointerDown={(e) => startTrim(e, cl, 'out')} />
                              {r && Math.abs(r.to - r.from) >= MIN && (
                                <span className="mx-range" style={{ left: (Math.min(r.from, r.to) - cl.start) * pps, width: Math.abs(r.to - r.from) * pps }}><i title="Limpar seleção" onPointerDown={(e) => (e.stopPropagation(), setRange(null))}><Icon name="close" size={11} /></i></span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                <div className="mx-add"><IconButton variant="pill" icon="plus" text="Adicionar faixa" label="Adicionar faixa" onClick={() => setTrackId(session.addTrack())} /></div>
                <div className="mx-playhead" style={{ left: HEAD + player.pos * pps }} />
              </div>
            </div>
          )}
        </div>

        <aside className="mx-inspector">
          <div className="mx-card">
            {tool === 'select' && <>↖<b>Selecionar e mover</b>Arraste clipes no tempo e entre faixas; arraste as bordas para cortar. Clique com o botão direito para copiar, recortar, colar e duplicar.</>}
            {tool === 'range' && <>Ⅰ<b>Seleção de trecho</b>Arraste dentro de um clipe para selecionar apenas uma parte; copie, recorte ou apague só ela.</>}
            {tool === 'split' && <>✂<b>Dividir</b>Clique num clipe no ponto onde quer dividir (ou use S no cursor).</>}
          </div>
          <div>
            <h5>Duração da seleção</h5>
            <div className="mx-fields">
              <label className="mx-field">Início <input type="number" step={0.01} min={0} disabled={!found} value={found ? +spanStart.toFixed(2) : 0}
                onChange={(e) => {
                  if (!found) return
                  const v = Math.max(0, +e.target.value || 0)
                  if (selRange) setRange({ ...selRange, from: Math.min(v, selRange.to - MIN) })
                  else session.moveClip(found.c.id, v)
                }} /></label>
              <label className="mx-field">Fim <input type="number" step={0.01} min={0} disabled={!found} value={found ? +spanEnd.toFixed(2) : 0}
                onChange={(e) => {
                  if (!found) return
                  const v = +e.target.value || 0
                  if (selRange) setRange({ ...selRange, to: Math.max(v, selRange.from + MIN) })
                  else {
                    try { session.trimClip(found.c.id, found.c.in, Math.min(srcLen(found.c), found.c.in + Math.max(MIN, v - found.c.start))) } catch { /* out of range */ }
                  }
                }} /></label>
            </div>
          </div>
          <div className="mx-sec">
            <h5>Níveis de som</h5>
            <div className="mx-knobrow">
              <Knob label="master" size={52} value={mix.masterDb} min={-24} max={6} defaultValue={0} format={(v) => `${v} dB`} onChange={(v) => session.update((d) => void (d.masterDb = v))} />
              {track && <Knob label="faixa" size={52} value={track.volumeDb} min={-30} max={6} defaultValue={0} color="#7c5cff" format={(v) => `${v} dB`} onChange={(v) => setTrack(track.id, { volumeDb: v })} />}
              {track && <Knob label="pan" size={52} value={track.pan} min={-1} max={1} step={0.05} bipolar color="#ff2d6f" format={(v) => (Math.abs(v) < 0.03 ? 'C' : `${v < 0 ? 'L' : 'R'}${Math.round(Math.abs(v) * 100)}`)} onChange={(v) => setTrack(track.id, { pan: v })} />}
            </div>
          </div>
          <div className="mx-sec">
            <h5>Clipe {found ? `· ${found.c.name || 'Áudio'}` : ''}</h5>
            {found ? (
              <div className="mx-knobrow">
                <Knob label="ganho" size={52} value={found.c.gainDb} min={-24} max={12} defaultValue={0} bipolar color={colorOf(found.ti)} format={(v) => `${v}dB`} onChange={(v) => setClipProps(found.c.id, { gainDb: v })} />
                <Knob label="fade in" size={52} value={found.c.fadeIn} min={0} max={Math.min(10, (found.c.out - found.c.in) / 2)} step={0.1} color={colorOf(found.ti)} format={(v) => `${v.toFixed(1)}s`} onChange={(v) => setClipProps(found.c.id, { fadeIn: v })} />
                <Knob label="fade out" size={52} value={found.c.fadeOut} min={0} max={Math.min(10, (found.c.out - found.c.in) / 2)} step={0.1} color={colorOf(found.ti)} format={(v) => `${v.toFixed(1)}s`} onChange={(v) => setClipProps(found.c.id, { fadeOut: v })} />
              </div>
            ) : <span className="note">Selecione um clipe para ajustar ganho e fades.</span>}
          </div>
          <div className="mx-sec">
            <h5>Atalhos</h5>
            <div className="note" style={{ lineHeight: 1.7 }}>Espaço toca · S divide · ⌘/Ctrl C X V D · Delete apaga · Esc limpa a seleção</div>
          </div>
        </aside>
      </div>

      </div>

      <div className="mx-overview" onPointerDown={(e) => { seekOverview(e); const mv = (ev: PointerEvent) => seekOverview(ev as unknown as React.PointerEvent<HTMLDivElement>); const up = () => (window.removeEventListener('pointermove', mv), window.removeEventListener('pointerup', up)); window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up) }}>
        <canvas ref={overview} />
        <div className="mx-window" style={{ left: `${Math.min(98, (view.left / (HEAD + total * pps)) * 100)}%`, width: `${Math.min(100, (view.width / (HEAD + total * pps)) * 100)}%` }} />
      </div>

      <div className="mx-bottom">
        <div className="mx-time">{clock(player.pos)} <span>/ {clock(total)}</span></div>
        <IconButton icon="undo" label="Desfazer" onClick={() => (runtime.undo(itemId), refresh())} />
        <IconButton icon="redo" label="Refazer" onClick={() => (runtime.redo(itemId), refresh())} />
        <div className="mx-transport">
          <IconButton icon="toStart" label="Voltar ao início" onClick={() => (player.stop(), player.seek(0))} />
          <IconButton icon="rewind" label="Voltar 5 segundos" onClick={() => jump(-5)} />
          <IconButton variant="play" icon={player.playing ? 'stop' : 'play'} label="Tocar / parar (espaço)" active={player.playing} onClick={go} />
          <IconButton icon="forward" label="Avançar 5 segundos" onClick={() => jump(5)} />
        </div>
        <div className="mx-zoom"><Icon name="minus" size={13} /><input type="range" min={10} max={160} value={pps} onChange={(e) => setPps(+e.target.value)} /><Icon name="plus" size={13} /></div>
      </div>
      <p className="note" style={{ padding: '10px 16px 0' }}>A pré-escuta usa o mesmo cálculo da exportação (WAV estéreo 44,1 kHz). Edições durante a reprodução reiniciam o som de onde estava.</p>

      {menu && (
        <div className="ctx" style={{ left: Math.min(menu.x, window.innerWidth - 230), top: Math.min(menu.y, window.innerHeight - 280) }} onClick={(e) => e.stopPropagation()}>
          <button disabled={!menuClip} onClick={() => (copy(menu.clipId!), setMenu(null))}>Copiar <kbd>⌘ C</kbd></button>
          <button disabled={!menuClip} onClick={() => (cut(menu.clipId!), setMenu(null))}>Recortar <kbd>⌘ X</kbd></button>
          <button disabled={!clip} onClick={() => (paste(menu.trackId, menu.at), setMenu(null))}>Colar <kbd>⌘ V</kbd></button>
          <button disabled={!menuClip} onClick={() => (duplicate(menu.clipId!), setMenu(null))}>Duplicar <kbd>⌘ D</kbd></button>
          <hr />
          <button disabled={!menuClip} onClick={() => (split(menu.clipId, menu.at), setMenu(null))}>Dividir aqui <kbd>S</kbd></button>
          <hr />
          <button disabled={!menuClip} onClick={() => (remove(menu.clipId!), setMenu(null))}>{range && range.clipId === menu.clipId ? 'Apagar trecho' : 'Apagar clipe'} <kbd>⌫</kbd></button>
        </div>
      )}
    </div>
  )
}
