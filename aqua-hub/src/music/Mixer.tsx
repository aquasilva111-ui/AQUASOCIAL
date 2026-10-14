import type { Song, Track, AudioEffect } from 'aqua-runtime/src/adapters/music'
import type { MusicSession } from 'aqua-runtime/src/adapters/music'
import { defaultParams } from './effects'

const EFFECT_TYPES: AudioEffect['type'][] = ['eq', 'compressor', 'reverb', 'delay', 'chorus', 'distortion', 'filter', 'limiter']

interface Props {
  song: Song
  session: MusicSession
  selectedTrackId?: string
}

export default function Mixer({ song, session, selectedTrackId }: Props) {
  const updateTrack = (id: string, patch: Partial<Track>) =>
    session.update((d) => {
      const t = d.tracks.find((x) => x.id === id)
      if (t) Object.assign(t, patch)
    })

  const addEffect = (trackId: string, type: AudioEffect['type']) => {
    session.update((d) => {
      const t = d.tracks.find((x) => x.id === trackId)
      if (!t) return
      if (!t.effects) t.effects = []
      if (t.effects.length >= 4) return
      t.effects.push({
        id: `fx_${Math.random().toString(36).slice(2, 8)}`,
        type,
        enabled: true,
        params: defaultParams(type),
      })
    })
  }

  const updateEffect = (trackId: string, fxId: string, patch: Partial<AudioEffect>) => {
    session.update((d) => {
      const t = d.tracks.find((x) => x.id === trackId)
      const fx = t?.effects?.find((e) => e.id === fxId)
      if (fx) Object.assign(fx, patch)
    })
  }

  const removeEffect = (trackId: string, fxId: string) => {
    session.update((d) => {
      const t = d.tracks.find((x) => x.id === trackId)
      if (t?.effects) t.effects = t.effects.filter((e) => e.id !== fxId)
    })
  }

  const updateMaster = (patch: Partial<NonNullable<Song['master']>>) => {
    session.update((d) => {
      if (!d.master) d.master = { volumeDb: 0, effects: [] }
      Object.assign(d.master, patch)
    })
  }

  const master = song.master ?? { volumeDb: 0, effects: [] }

  return (
    <div style={{ borderTop: '1px solid #232c3c', background: '#0c1018', padding: '10px 12px' }}>
      <div style={{ fontSize: 12, color: '#8a97ad', marginBottom: 8 }}>Mixer</div>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
        {song.tracks.map((t) => (
          <div
            key={t.id}
            style={{
              minWidth: 140,
              background: t.id === selectedTrackId ? '#161c28' : '#10141c',
              border: '1px solid #232c3c',
              borderRadius: 6,
              padding: 8,
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{t.name}</div>
            <label style={{ display: 'block', marginBottom: 4 }}>
              Vol {t.volumeDb} dB
              <input type="range" min={-40} max={6} step={1} value={t.volumeDb} onChange={(e) => updateTrack(t.id, { volumeDb: +e.target.value })} style={{ width: '100%' }} />
            </label>
            <label style={{ display: 'block', marginBottom: 4 }}>
              Pan {t.pan?.toFixed(2) ?? 0}
              <input type="range" min={-1} max={1} step={0.01} value={t.pan ?? 0} onChange={(e) => updateTrack(t.id, { pan: +e.target.value })} style={{ width: '100%' }} />
            </label>
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              <button className={t.muted ? 'on-m' : ''} onClick={() => updateTrack(t.id, { muted: !t.muted })}>M</button>
              <button className={t.solo ? 'on-s' : ''} onClick={() => updateTrack(t.id, { solo: !t.solo })}>S</button>
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>Effects ({t.effects?.length ?? 0}/4)</div>
            {(t.effects ?? []).map((fx) => (
              <div key={fx.id} style={{ background: '#0a0e14', padding: 4, borderRadius: 4, marginBottom: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{fx.type}</span>
                  <button onClick={() => updateEffect(t.id, fx.id, { enabled: !fx.enabled })}>{fx.enabled ? 'on' : 'off'}</button>
                  <button onClick={() => removeEffect(t.id, fx.id)}>×</button>
                </div>
                {Object.entries(fx.params).slice(0, 2).map(([k, v]) => (
                  <label key={k} style={{ display: 'block', fontSize: 10 }}>
                    {k} {typeof v === 'number' ? v.toFixed(2) : v}
                    <input
                      type="range"
                      min={k === 'wet' || k === 'feedback' ? 0 : k.includes('threshold') ? -40 : 0}
                      max={k === 'wet' || k === 'feedback' ? 1 : k === 'decay' ? 8 : 20}
                      step={0.01}
                      value={v}
                      onChange={(e) => updateEffect(t.id, fx.id, { params: { ...fx.params, [k]: +e.target.value } })}
                      style={{ width: '100%' }}
                    />
                  </label>
                ))}
              </div>
            ))}
            {(t.effects?.length ?? 0) < 4 && (
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) addEffect(t.id, e.target.value as AudioEffect['type'])
                  e.target.value = ''
                }}
                style={{ width: '100%', fontSize: 11 }}
              >
                <option value="">+ efeito</option>
                {EFFECT_TYPES.map((ty) => <option key={ty} value={ty}>{ty}</option>)}
              </select>
            )}
          </div>
        ))}

        {/* Master */}
        <div style={{ minWidth: 140, background: '#1a1220', border: '1px solid #ff5a8a', borderRadius: 6, padding: 8, fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: '#ff5a8a' }}>Master</div>
          <label style={{ display: 'block' }}>
            Vol {master.volumeDb} dB
            <input type="range" min={-20} max={6} step={1} value={master.volumeDb} onChange={(e) => updateMaster({ volumeDb: +e.target.value })} style={{ width: '100%' }} />
          </label>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>Limiter + effects no master (próxima fatia)</div>
        </div>
      </div>
    </div>
  )
}
