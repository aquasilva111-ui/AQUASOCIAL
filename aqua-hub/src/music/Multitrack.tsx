import { useEffect, useRef, useState } from 'react'
import type { Song, Track, AudioClip } from 'aqua-runtime/src/adapters/music'
import type { MusicSession } from 'aqua-runtime/src/adapters/music'
import { decodeAny, store } from '../hub'
import type { Pcm } from 'aqua-runtime/src/render/wav'

const ROW = 64

function peaksOf(pcm: Pcm): Float32Array {
  const bins = 256
  const ch = pcm.channels[0]
  const step = Math.max(1, Math.floor(ch.length / bins))
  const peaks = new Float32Array(bins * 2)
  for (let i = 0; i < bins; i++) {
    let min = 0, max = 0
    for (let j = 0; j < step && i * step + j < ch.length; j++) {
      const v = ch[i * step + j]
      if (v < min) min = v
      if (v > max) max = v
    }
    peaks[i * 2] = min
    peaks[i * 2 + 1] = max
  }
  return peaks
}

function Wave({ peaks, width, height, color }: { peaks?: Float32Array; width: number; height: number; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c || !peaks) return
    c.width = width
    c.height = height
    const g = c.getContext('2d')!
    g.clearRect(0, 0, width, height)
    const mid = height / 2
    g.fillStyle = color
    for (let i = 0; i < peaks.length / 2; i++) {
      const x = (i / (peaks.length / 2)) * width
      const h = Math.max(2, (peaks[i * 2 + 1] - peaks[i * 2]) * mid * 0.9)
      g.fillRect(x, mid - h / 2, 2, h)
    }
  }, [peaks, width, height, color])
  return <canvas ref={ref} style={{ width, height, display: 'block' }} />
}

interface Props {
  song: Song
  session: MusicSession
  onSelectTrack: (id: string) => void
  selectedTrackId?: string
}

export default function Multitrack({ song, session, onSelectTrack, selectedTrackId }: Props) {
  const [pcms, setPcms] = useState<Record<string, Pcm>>({})
  const [peaks, setPeaks] = useState<Record<string, Float32Array>>({})
  const pps = 40 // pixels per second

  useEffect(() => {
    const hashes = new Set<string>()
    for (const t of song.tracks) {
      for (const c of t.audioClips ?? []) hashes.add(c.asset)
    }
    for (const h of hashes) {
      if (pcms[h]) continue
      store.get(h).then(async (got) => {
        if (!got?.bytes) return
        const pcm = await decodeAny(got.bytes)
        if (!pcm) return
        setPcms((m) => ({ ...m, [h]: pcm }))
        setPeaks((m) => ({ ...m, [h]: peaksOf(pcm) }))
      }).catch(() => {})
    }
  }, [song])

  const addAudioClip = async (trackId: string, file: File) => {
    const buf = new Uint8Array(await file.arrayBuffer())
    const ref = await store.put(buf, file.type || 'audio/wav')
    const pcm = await decodeAny(buf)
    const duration = pcm ? pcm.channels[0].length / pcm.sampleRate : 4
    session.update((d) => {
      const t = d.tracks.find((x) => x.id === trackId)
      if (!t) return
      if (!t.audioClips) t.audioClips = []
      const clip: AudioClip = {
        id: `clip_${Math.random().toString(36).slice(2, 8)}`,
        asset: ref.hash,
        name: file.name.replace(/\.[^.]+$/, ''),
        start: 0,
        duration,
        offset: 0,
        gainDb: 0,
        fadeIn: 0,
        fadeOut: 0,
      }
      t.audioClips.push(clip)
      t.type = 'audio'
    })
  }

  const moveClip = (trackId: string, clipId: string, newStart: number) => {
    session.update((d) => {
      const t = d.tracks.find((x) => x.id === trackId)
      const c = t?.audioClips?.find((x) => x.id === clipId)
      if (c) c.start = Math.max(0, newStart)
    })
  }

  return (
    <div style={{ borderTop: '1px solid #232c3c', background: '#0a0e14' }}>
      <div style={{ padding: '6px 12px', fontSize: 12, color: '#8a97ad', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span>Timeline</span>
        <button onClick={() => {
          const id = session.addTrack(`Audio ${song.tracks.length + 1}`)
          session.update((d) => {
            const t = d.tracks.find((x) => x.id === id)
            if (t) { t.type = 'audio'; t.audioClips = [] }
          })
          onSelectTrack(id)
        }}>+ Faixa de áudio</button>
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 280 }}>
        {song.tracks.map((t) => (
          <div
            key={t.id}
            onClick={() => onSelectTrack(t.id)}
            style={{
              display: 'flex',
              borderBottom: '1px solid #1b2230',
              background: t.id === selectedTrackId ? '#121820' : 'transparent',
              minHeight: ROW,
            }}
          >
            <div style={{ width: 140, padding: '8px 10px', fontSize: 13, borderRight: '1px solid #1b2230', flexShrink: 0 }}>
              {t.name}
              <div style={{ fontSize: 10, opacity: 0.5 }}>{t.type || 'midi'}</div>
            </div>
            <div style={{ position: 'relative', flex: 1, minHeight: ROW }}>
              {(t.audioClips ?? []).map((c) => {
                const w = Math.max(40, c.duration * pps)
                const left = c.start * pps
                return (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('clip', JSON.stringify({ trackId: t.id, clipId: c.id }))}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const data = JSON.parse(e.dataTransfer.getData('clip') || '{}')
                      const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect()
                      const newStart = Math.max(0, (e.clientX - rect.left) / pps)
                      moveClip(data.trackId, data.clipId, newStart)
                    }}
                    style={{
                      position: 'absolute',
                      left,
                      top: 6,
                      width: w,
                      height: ROW - 12,
                      background: '#1a3a4a',
                      border: '1px solid #4cc9f0',
                      borderRadius: 4,
                      overflow: 'hidden',
                      cursor: 'grab',
                    }}
                    title={c.name}
                  >
                    <Wave peaks={peaks[c.asset]} width={w} height={ROW - 14} color="#4cc9f0" />
                    <div style={{ position: 'absolute', top: 2, left: 4, fontSize: 10, color: '#fff', textShadow: '0 1px 2px #000' }}>
                      {c.name}
                    </div>
                  </div>
                )
              })}
              {t.type === 'audio' && (
                <label style={{ position: 'absolute', right: 8, top: 8, fontSize: 11, cursor: 'pointer', opacity: 0.7 }}>
                  + clipe
                  <input
                    type="file"
                    accept="audio/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void addAudioClip(t.id, f)
                      e.target.value = ''
                    }}
                  />
                </label>
              )}
              {!t.audioClips?.length && t.type !== 'audio' && (
                <div style={{ padding: '20px 12px', fontSize: 11, opacity: 0.4 }}>
                  {t.notes.length} nota(s) MIDI
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
