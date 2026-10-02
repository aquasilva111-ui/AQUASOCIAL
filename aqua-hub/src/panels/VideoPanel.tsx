import { useState } from 'react'

import { videoDuration, type VideoProject, type VideoSession } from 'aqua-runtime/src/adapters/video'

import { download, store } from '../hub'
import { UndoRedo, useSession } from './hooks'

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

export default function VideoPanel({ itemId }: { itemId: string }) {
  const { session, refresh } = useSession<VideoSession>(itemId)
  const [server, setServer] = useState(() => sessionStorage.getItem('aqua-render-url') ?? 'http://localhost:8788')
  const [token, setToken] = useState(() => sessionStorage.getItem('aqua-render-token') ?? '')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  if (!session) return <p className="note">Abrindo…</p>
  const p = session.state
  const total = videoDuration(p) || 1

  const add = async (file: File) => {
    setErr('')
    try {
      const dur = await probe(file)
      const ref = await store.put(new Uint8Array(await file.arrayBuffer()), file.type || 'video/mp4')
      session.addClip(ref.hash, dur)
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const render = async () => {
    setErr(''); setBusy('Renderizando no servidor…')
    sessionStorage.setItem('aqua-render-url', server); sessionStorage.setItem('aqua-render-token', token)
    try { download(await renderOnServer(p, server.replace(/\/$/, ''), token), 'video.mp4', 'video/mp4') }
    catch (e) { setErr((e as Error).message) }
    finally { setBusy('') }
  }

  return (
    <>
      <div className="row">
        <input type="file" accept="video/*" onChange={(e) => e.target.files?.[0] && add(e.target.files[0])} />
        <label className="field">Largura <input type="number" value={p.width} style={{ width: 80 }} onChange={(e) => session.update((d) => void (d.width = +e.target.value || 1080))} /></label>
        <label className="field">Altura <input type="number" value={p.height} style={{ width: 80 }} onChange={(e) => session.update((d) => void (d.height = +e.target.value || 1920))} /></label>
        <UndoRedo itemId={itemId} refresh={refresh} />
      </div>
      {err && <p className="note" style={{ color: 'var(--orange)' }}>{err}</p>}
      <div className="timeline">
        {p.clips.map((c, i) => (
          <div key={c.id} className="clip" style={{ width: `${((c.out - c.in) / total) * 100}%` }}>Clipe {i + 1} · {(c.out - c.in).toFixed(1)}s</div>
        ))}
      </div>
      {p.clips.map((c, i) => (
        <div className="row" key={c.id}>
          <b>Clipe {i + 1}</b>
          <label className="field">Início <input type="number" min={0} step={0.1} value={c.in} style={{ width: 80 }} onChange={(e) => { try { session.trim(c.id, +e.target.value, c.out) } catch { /* invalid range ignored */ } }} /></label>
          <label className="field">Fim <input type="number" min={0} step={0.1} value={c.out} style={{ width: 80 }} onChange={(e) => { try { session.trim(c.id, c.in, +e.target.value) } catch { /* invalid range ignored */ } }} /></label>
          <label className="field"><input type="checkbox" checked={c.audio} onChange={(e) => session.update((d) => void (d.clips[i].audio = e.target.checked))} /> áudio</label>
          <button disabled={i === 0} onClick={() => session.moveClip(c.id, i - 1)}>↑</button>
          <button disabled={i === p.clips.length - 1} onClick={() => session.moveClip(c.id, i + 1)}>↓</button>
          <button onClick={() => session.removeClip(c.id)}>Remover</button>
        </div>
      ))}
      <p className="note">Duração total: {videoDuration(p).toFixed(1)} s. A edição fica neste navegador; o render usa o servidor aqua-render (ffmpeg).</p>
      <div className="row">
        <label className="field">Servidor <input value={server} onChange={(e) => setServer(e.target.value)} /></label>
        <label className="field">Token <input type="password" value={token} onChange={(e) => setToken(e.target.value)} /></label>
        <button className="primary" disabled={!p.clips.length || !token || !!busy} onClick={render}>{busy || 'Renderizar MP4'}</button>
      </div>
    </>
  )
}
