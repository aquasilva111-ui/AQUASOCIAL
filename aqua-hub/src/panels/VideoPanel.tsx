import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { videoDuration, type VideoClip, type VideoProject, type VideoSession } from 'aqua-runtime/src/adapters/video'

import { download, store } from '../hub'
import { UndoRedo, useSession } from './hooks'

const MIN = 0.1 // shortest clip, seconds

/** Blob URLs and durations of the assets this project uses, loaded from the browser store. */
function useMedia(hashes: string[]) {
  const [media, setMedia] = useState<Record<string, { url: string; duration: number }>>({})
  const key = hashes.join(',')
  useEffect(() => {
    let dead = false
    for (const h of hashes) {
      if (media[h]) continue
      store.get(h).then((b) => {
        if (!b || dead) return
        const url = URL.createObjectURL(new Blob([b.bytes as BlobPart], { type: b.ref.mime }))
        const v = document.createElement('video')
        v.preload = 'metadata'
        v.onloadedmetadata = () => !dead && setMedia((m) => ({ ...m, [h]: { url, duration: v.duration } }))
        v.src = url
      })
    }
    return () => void (dead = true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return media
}

function probe(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => (URL.revokeObjectURL(v.src), resolve(v.duration))
    v.onerror = () => reject(new Error('Formato de vídeo não reconhecido pelo navegador'))
    v.src = URL.createObjectURL(file)
  })
}

async function renderOnServer(p: VideoProject, base: string, token: string): Promise<Uint8Array> {
  const auth = { authorization: `Bearer ${token}` }
  for (const hash of new Set([...p.clips.map((c) => c.asset), ...p.audioTracks.map((a) => a.asset)])) {
    const blob = await store.get(hash)
    if (!blob) throw new Error('Arquivo de mídia não está mais neste navegador')
    const r = await fetch(`${base}/assets/${hash}`, { method: 'PUT', body: blob.bytes as BodyInit, headers: auth })
    if (!r.ok) throw new Error(`Envio falhou (${r.status})`)
  }
  const r = await fetch(`${base}/render`, { method: 'POST', body: JSON.stringify(p), headers: auth })
  if (!r.ok) throw new Error(`Render falhou (${r.status}): ${(await r.json().catch(() => ({ error: '' }))).error}`)
  return new Uint8Array(await r.arrayBuffer())
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`

export default function VideoPanel({ itemId }: { itemId: string }) {
  const { session, refresh } = useSession<VideoSession>(itemId)
  const [server, setServer] = useState(() => sessionStorage.getItem('aqua-render-url') ?? 'http://localhost:8788')
  const [token, setToken] = useState(() => sessionStorage.getItem('aqua-render-token') ?? '')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [t, setT] = useState(0) // playhead, seconds on the timeline
  const [playing, setPlaying] = useState(false)
  const [pps, setPps] = useState(60) // pixels per second
  const video = useRef<HTMLVideoElement>(null)
  const dragId = useRef<string | null>(null)
  const tRef = useRef(0)
  tRef.current = t

  const p = session?.state
  const media = useMedia(p ? p.clips.map((c) => c.asset) : [])
  const total = p ? videoDuration(p) : 0

  // Clip start times on the timeline.
  const starts = useMemo(() => {
    let acc = 0
    return (p?.clips ?? []).map((c) => {
      const s = acc
      acc += c.out - c.in
      return s
    })
  }, [p])
  const at = useCallback(
    (time: number) => {
      const clips = p?.clips ?? []
      let i = starts.findLastIndex((s) => s <= time + 1e-6)
      if (i < 0) i = 0
      return clips[i] ? { clip: clips[i], start: starts[i], index: i } : null
    },
    [p, starts]
  )

  const here = at(t)
  const clipMedia = here && media[here.clip.asset]

  // Keep the <video> on the right source and frame.
  useEffect(() => {
    const v = video.current
    if (!v || !here || !clipMedia) return
    if (v.src !== clipMedia.url) v.src = clipMedia.url
    const want = here.clip.in + (t - here.start)
    if (!playing && Math.abs(v.currentTime - want) > 0.05) v.currentTime = want
  }, [t, here?.clip.id, clipMedia?.url, playing]) // eslint-disable-line react-hooks/exhaustive-deps

  // Playback: follow the video element, jump to the next clip when the current one ends.
  useEffect(() => {
    const v = video.current
    if (!playing || !v || !here) return
    let raf = 0
    const cur = here
    v.muted = !cur.clip.audio
    // Entering a clip while playing: the element still sits at the previous clip's time, so seek first.
    const want = cur.clip.in + (tRef.current - cur.start)
    if (Math.abs(v.currentTime - want) > 0.1) v.currentTime = want
    v.play().catch(() => setPlaying(false)) // e.g. the browser refused to start playback
    const tick = () => {
      const time = cur.start + (v.currentTime - cur.clip.in)
      if (v.currentTime >= cur.clip.out - 0.03) {
        v.pause()
        const next = p!.clips[cur.index + 1]
        if (next) setT(starts[cur.index + 1])
        else setPlaying(false)
        return
      }
      setT(time)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      v.pause()
    }
  }, [playing, here?.clip.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!session || !p) return <p className="note">Abrindo…</p>
  const selected = p.clips.find((c) => c.id === sel)
  const maxOut = (c: VideoClip) => media[c.asset]?.duration ?? c.out

  const add = async (file: File) => {
    setErr('')
    try {
      const dur = await probe(file)
      const ref = await store.put(new Uint8Array(await file.arrayBuffer()), file.type || 'video/mp4')
      setSel(session.addClip(ref.hash, dur))
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const addMusic = async (file: File) => {
    const ref = await store.put(new Uint8Array(await file.arrayBuffer()), file.type || 'audio/mpeg')
    session.addAudio(ref.hash, 0, -6)
  }
  const patch = (c: VideoClip, f: Partial<VideoClip>) => session.update((d) => void Object.assign(d.clips.find((x) => x.id === c.id)!, f))
  const split = () => {
    if (!here) return
    try {
      setSel(session.splitClip(here.clip.id, t - here.start))
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const remove = () => {
    if (!selected) return
    session.removeClip(selected.id)
    setSel(null)
  }

  // Trim by dragging a clip edge. The delta is applied to the values at the start of the drag.
  const startTrim = (e: React.PointerEvent, c: VideoClip, edge: 'in' | 'out') => {
    e.stopPropagation()
    e.preventDefault()
    setSel(c.id)
    const x0 = e.clientX
    const [in0, out0] = [c.in, c.out]
    const move = (ev: PointerEvent) => {
      const d = (ev.clientX - x0) / pps
      try {
        if (edge === 'in') session.trim(c.id, Math.max(0, Math.min(in0 + d, out0 - MIN)), out0)
        else session.trim(c.id, in0, Math.min(maxOut(c), Math.max(out0 + d, in0 + MIN)))
      } catch {
        /* out-of-range drags are clamped above; anything else is ignored */
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const render = async () => {
    setErr('')
    setBusy('Renderizando no servidor…')
    sessionStorage.setItem('aqua-render-url', server)
    sessionStorage.setItem('aqua-render-token', token)
    try {
      download(await renderOnServer(p, server.replace(/\/$/, ''), token), 'video.mp4', 'video/mp4')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  // Approximate preview of the clip's look and fade (the render is the reference).
  const c = here?.clip
  const local = c ? t - here!.start : 0
  const len = c ? c.out - c.in : 1
  const fade = c ? Math.min(1, c.fadeIn ? local / c.fadeIn : 1, c.fadeOut ? (len - local) / c.fadeOut : 1) : 1
  const aspect = p.width / p.height
  const boxH = 340

  return (
    <div
      tabIndex={0}
      style={{ outline: 'none' }}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT') return
        if (e.key === ' ') (e.preventDefault(), setPlaying((v) => !v))
        else if (e.key.toLowerCase() === 's') split()
        else if (e.key === 'Delete' || e.key === 'Backspace') remove()
      }}
    >
      <div className="row">
        <input type="file" accept="video/*" onChange={(e) => e.target.files?.[0] && add(e.target.files[0])} />
        <label className="field">Largura <input type="number" value={p.width} style={{ width: 80 }} onChange={(e) => session.update((d) => void (d.width = +e.target.value || 1080))} /></label>
        <label className="field">Altura <input type="number" value={p.height} style={{ width: 80 }} onChange={(e) => session.update((d) => void (d.height = +e.target.value || 1920))} /></label>
        <UndoRedo itemId={itemId} refresh={refresh} />
      </div>
      {err && <p className="note" style={{ color: 'var(--orange)' }}>{err}</p>}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '10px 0' }}>
        <div style={{ position: 'relative', height: boxH, width: boxH * aspect, maxWidth: '100%', background: '#000', borderRadius: 8, overflow: 'hidden', flex: 'none' }}>
          <video
            ref={video}
            playsInline
            onLoadedMetadata={(e) => {
              if (here) e.currentTarget.currentTime = here.clip.in + (tRef.current - here.start)
            }}
            style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: fade, filter: c ? `brightness(${1 + (c.brightness ?? 0)}) contrast(${c.contrast ?? 1}) saturate(${c.saturation ?? 1})` : undefined }}
          />
          {(p.texts ?? []).filter((x) => t >= x.start && t <= x.end).map((x) => (
            <div key={x.id} style={{ position: 'absolute', left: `${x.x * 100}%`, top: `${x.y * 100}%`, transform: 'translate(-50%,-50%)', color: x.color, fontSize: x.size * boxH, fontWeight: 700, textShadow: '0 1px 3px #0008', whiteSpace: 'pre-wrap', textAlign: 'center', pointerEvents: 'none' }}>{x.text}</div>
          ))}
          {!p.clips.length && <div className="empty" style={{ color: '#fff' }}>Adicione um vídeo</div>}
        </div>

        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="row">
            <button disabled={!p.clips.length} onClick={() => (t >= total - 0.05 && setT(0), setPlaying((v) => !v))}>{playing ? 'Pausar' : 'Tocar'}</button>
            <button disabled={!here} onClick={split}>Dividir (S)</button>
            <button disabled={!selected} onClick={remove}>Apagar clipe</button>
            <span className="note">{fmt(t)} / {fmt(total)}</span>
          </div>
          {selected ? (
            <div>
              <b>Clipe selecionado</b>
              <div className="row">
                <label className="field"><input type="checkbox" checked={selected.audio} onChange={(e) => patch(selected, { audio: e.target.checked })} /> áudio</label>
                <label className="field">Fade in (s) <input type="number" min={0} max={10} step={0.1} value={selected.fadeIn ?? 0} style={{ width: 64 }} onChange={(e) => patch(selected, { fadeIn: Math.max(0, +e.target.value || 0) })} /></label>
                <label className="field">Fade out (s) <input type="number" min={0} max={10} step={0.1} value={selected.fadeOut ?? 0} style={{ width: 64 }} onChange={(e) => patch(selected, { fadeOut: Math.max(0, +e.target.value || 0) })} /></label>
              </div>
              <div className="row">
                <label className="field">Brilho <input type="range" min={-0.5} max={0.5} step={0.05} value={selected.brightness ?? 0} onChange={(e) => patch(selected, { brightness: +e.target.value })} /></label>
                <label className="field">Contraste <input type="range" min={0.5} max={1.5} step={0.05} value={selected.contrast ?? 1} onChange={(e) => patch(selected, { contrast: +e.target.value })} /></label>
                <label className="field">Saturação <input type="range" min={0} max={2} step={0.05} value={selected.saturation ?? 1} onChange={(e) => patch(selected, { saturation: +e.target.value })} /></label>
              </div>
            </div>
          ) : (
            <p className="note">Clique num clipe para ajustar fade e cor. Arraste as bordas para cortar, arraste o clipe para reordenar. Espaço toca, S divide.</p>
          )}
        </div>
      </div>

      <label className="field">Zoom <input type="range" min={20} max={200} value={pps} onChange={(e) => setPps(+e.target.value)} /></label>
      <div style={{ overflowX: 'auto', paddingBottom: 6 }}>
        <div
          style={{ position: 'relative', width: Math.max(total * pps, 200), cursor: 'text' }}
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setPlaying(false)
            setT(Math.max(0, Math.min(total, (e.clientX - r.left) / pps)))
          }}
        >
          <div style={{ display: 'flex', height: 54, border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', margin: '8px 0 4px' }}>
            {p.clips.map((cl, i) => (
              <div
                key={cl.id}
                draggable
                onDragStart={() => (dragId.current = cl.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dragId.current && dragId.current !== cl.id && session.moveClip(dragId.current, i)}
                onPointerDown={(e) => (e.stopPropagation(), setSel(cl.id))}
                className="clip"
                style={{ position: 'relative', flex: 'none', width: (cl.out - cl.in) * pps, cursor: 'grab', outline: cl.id === sel ? '2px solid var(--orange)' : undefined, outlineOffset: -2 }}
              >
                Clipe {i + 1} · {(cl.out - cl.in).toFixed(1)}s{!cl.audio && ' 🔇'}
                <span onPointerDown={(e) => startTrim(e, cl, 'in')} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 7, cursor: 'ew-resize', background: '#fff6' }} />
                <span onPointerDown={(e) => startTrim(e, cl, 'out')} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 7, cursor: 'ew-resize', background: '#fff6' }} />
              </div>
            ))}
          </div>
          {(p.texts ?? []).map((x) => (
            <div key={x.id} title={x.text} style={{ marginLeft: x.start * pps, width: Math.max(8, (x.end - x.start) * pps), height: 18, background: 'var(--orange)', color: '#fff', fontSize: 11, borderRadius: 4, marginBottom: 2, overflow: 'hidden', whiteSpace: 'nowrap', padding: '0 4px' }}>{x.text}</div>
          ))}
          {p.audioTracks.map((a) => (
            <div key={a.id} style={{ marginLeft: a.start * pps, width: 120, height: 18, background: '#405168', color: '#fff', fontSize: 11, borderRadius: 4, marginBottom: 2, padding: '0 4px' }}>♪ música</div>
          ))}
          <div style={{ position: 'absolute', left: t * pps, top: 0, bottom: 0, width: 2, background: 'var(--orange)', pointerEvents: 'none' }} />
        </div>
      </div>

      <h3 style={{ margin: '14px 0 4px', fontSize: 14 }}>Textos</h3>
      {(p.texts ?? []).map((x) => (
        <div className="row" key={x.id}>
          <input value={x.text} maxLength={200} onChange={(e) => session.update((d) => void (d.texts!.find((y) => y.id === x.id)!.text = e.target.value || ' '))} />
          <label className="field">de <input type="number" min={0} step={0.1} value={x.start} style={{ width: 64 }} onChange={(e) => session.update((d) => void (d.texts!.find((y) => y.id === x.id)!.start = Math.max(0, Math.min(+e.target.value || 0, x.end - 0.1))))} /></label>
          <label className="field">até <input type="number" min={0} step={0.1} value={x.end} style={{ width: 64 }} onChange={(e) => session.update((d) => void (d.texts!.find((y) => y.id === x.id)!.end = Math.max(x.start + 0.1, +e.target.value || 0)))} /></label>
          <label className="field">Y <input type="range" min={0.05} max={0.95} step={0.05} value={x.y} onChange={(e) => session.update((d) => void (d.texts!.find((y) => y.id === x.id)!.y = +e.target.value))} /></label>
          <label className="field">Tamanho <input type="range" min={0.02} max={0.15} step={0.01} value={x.size} onChange={(e) => session.update((d) => void (d.texts!.find((y) => y.id === x.id)!.size = +e.target.value))} /></label>
          <input type="color" value={x.color} onChange={(e) => session.update((d) => void (d.texts!.find((y) => y.id === x.id)!.color = e.target.value))} />
          <button onClick={() => session.removeText(x.id)}>Remover</button>
        </div>
      ))}
      <div className="row">
        <button disabled={!p.clips.length} onClick={() => session.addText('Seu texto', t, Math.min(total, t + 3) || t + 3)}>+ Texto no cursor</button>
        <label className="field">+ Música <input type="file" accept="audio/*" onChange={(e) => e.target.files?.[0] && addMusic(e.target.files[0])} /></label>
      </div>
      {p.audioTracks.map((a) => (
        <div className="row" key={a.id}>
          <span>♪ música</span>
          <label className="field">Começa em (s) <input type="number" min={0} step={0.1} value={a.start} style={{ width: 70 }} onChange={(e) => session.update((d) => void (d.audioTracks.find((y) => y.id === a.id)!.start = Math.max(0, +e.target.value || 0)))} /></label>
          <label className="field">Ganho (dB) <input type="number" step={1} value={a.gainDb} style={{ width: 70 }} onChange={(e) => session.update((d) => void (d.audioTracks.find((y) => y.id === a.id)!.gainDb = +e.target.value || 0))} /></label>
          <button onClick={() => session.update((d) => void (d.audioTracks = d.audioTracks.filter((y) => y.id !== a.id)))}>Remover</button>
        </div>
      ))}
      <p className="note">A pré-visualização é aproximada (fade e cor) e não toca a música. O MP4 final vem do servidor aqua-render (ffmpeg).</p>
      <div className="row">
        <label className="field">Servidor <input value={server} onChange={(e) => setServer(e.target.value)} /></label>
        <label className="field">Token <input type="password" value={token} onChange={(e) => setToken(e.target.value)} /></label>
        <button className="primary" disabled={!p.clips.length || !token || !!busy} onClick={render}>{busy || 'Renderizar MP4'}</button>
      </div>
    </div>
  )
}
