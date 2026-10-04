import { useEffect, useRef, useState } from 'react'

import type { AudioSession } from 'aqua-runtime/src/adapters/audio'
import type { Pcm } from 'aqua-runtime/src/render/wav'

import { decodeAny, download, runtime, store } from '../hub'
import { UndoRedo, useSession } from './hooks'

const W = 900
const H = 140

export default function AudioPanel({ itemId }: { itemId: string }) {
  const { session, refresh } = useSession<AudioSession>(itemId)
  const [pcm, setPcm] = useState<Pcm | null>(null)
  const [sel, setSel] = useState<[number, number] | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const cv = useRef<HTMLCanvasElement>(null)
  const drag = useRef<number | null>(null)
  const edit = session?.state

  useEffect(() => {
    let dead = false
    if (!edit?.source) return void setPcm(null)
    store.get(edit.source).then((b) => b && decodeAny(b.bytes)).then((p) => !dead && p && setPcm(p)).catch((e) => setErr(String(e.message ?? e)))
    return () => { dead = true }
  }, [edit?.source])

  useEffect(() => {
    const c = cv.current
    if (!c || !edit) return
    c.width = W; c.height = H
    const g = c.getContext('2d')!
    g.clearRect(0, 0, W, H)
    if (!pcm) return
    const data = pcm.channels[0]
    const per = Math.max(1, Math.floor(data.length / W))
    g.fillStyle = '#002BEF'
    for (let x = 0; x < W; x++) {
      let lo = 0, hi = 0
      for (let i = x * per; i < Math.min(data.length, (x + 1) * per); i++) { lo = Math.min(lo, data[i]); hi = Math.max(hi, data[i]) }
      g.fillRect(x, H / 2 - hi * (H / 2), 1, Math.max(1, (hi - lo) * (H / 2)))
    }
    const x = (t: number) => (t / edit.durationSec) * W
    g.fillStyle = 'rgba(240,76,36,.25)'
    for (const r of edit.keep) g.fillRect(x(r.start), 0, x(r.end) - x(r.start), H)
    if (sel) { g.fillStyle = 'rgba(0,43,239,.2)'; g.fillRect(x(Math.min(...sel)), 0, x(Math.abs(sel[1] - sel[0])), H) }
  })

  if (!session || !edit) return <p className="note">Abrindo…</p>

  const t = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(edit.durationSec, ((e.clientX - r.left) / r.width) * edit.durationSec))
  }

  const load = async (file: File) => {
    setErr('')
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const p = await decodeAny(bytes)
      const ref = await store.put(bytes, file.type || 'audio/wav')
      session.setSource(ref.hash, p.channels[0].length / p.sampleRate)
    } catch (e) {
      setErr(`Não consegui abrir esse áudio: ${(e as Error).message}`)
    }
  }
  const preview = async () => {
    const out = await runtime.exportForLaunch(itemId, 'audio')
    if (out) setUrl(URL.createObjectURL(new Blob([out.bytes as BlobPart], { type: out.mime })))
  }

  return (
    <>
      <div className="row">
        <input type="file" accept="audio/*" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
        <UndoRedo itemId={itemId} refresh={refresh} />
      </div>
      {err && <p className="note" style={{ color: 'var(--orange)' }}>{err}</p>}
      {!edit.source ? <p className="note">Escolha um arquivo de áudio (WAV, MP3, M4A…).</p> : (
        <>
          <canvas ref={cv} style={{ width: '100%', cursor: 'col-resize' }}
            onMouseDown={(e) => { drag.current = t(e); setSel([drag.current, drag.current]) }}
            onMouseMove={(e) => drag.current !== null && setSel([drag.current, t(e)])}
            onMouseUp={() => (drag.current = null)} onMouseLeave={() => (drag.current = null)} />
          <p className="note">Arraste na onda para selecionar. Laranja = trechos mantidos (sem nenhum, fica tudo). Duração do resultado: {session.resultDuration().toFixed(1)} s</p>
          <div className="row">
            <button disabled={!sel || Math.abs(sel[1] - sel[0]) < 0.05} onClick={() => { session.keepRegion(sel![0], sel![1]); setSel(null) }}>Manter trecho</button>
            <button disabled={!edit.keep.length} onClick={() => session.update((d) => void (d.keep = []))}>Limpar trechos</button>
            <label className="field">Ganho (dB) <input type="number" step={1} value={edit.gainDb} style={{ width: 70 }} onChange={(e) => session.update((d) => void (d.gainDb = +e.target.value || 0))} /></label>
            <label className="field">Fade in (s) <input type="number" min={0} step={0.1} value={edit.fadeInSec} style={{ width: 70 }} onChange={(e) => session.update((d) => void (d.fadeInSec = Math.max(0, +e.target.value || 0)))} /></label>
            <label className="field">Fade out (s) <input type="number" min={0} step={0.1} value={edit.fadeOutSec} style={{ width: 70 }} onChange={(e) => session.update((d) => void (d.fadeOutSec = Math.max(0, +e.target.value || 0)))} /></label>
            <button onClick={preview}>Ouvir resultado</button>
            <button className="primary" onClick={async () => { const o = await runtime.exportForLaunch(itemId, 'audio'); if (o) download(o.bytes, 'audio.wav', o.mime) }}>Baixar WAV</button>
          </div>
          {url && <audio controls autoPlay src={url} />}
        </>
      )}
    </>
  )
}
