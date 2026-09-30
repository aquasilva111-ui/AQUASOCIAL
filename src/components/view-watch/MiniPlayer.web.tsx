// Web-only DOM overlay: text lives in DOM elements, not React Native <Text>.

import {useEffect, useRef, useState} from 'react'
import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {
  closeMiniPlayer,
  getViewPlayback,
  type MiniPlayerState,
  noteMiniPlayerTime,
  openMiniPlayer,
  useViewPlayback,
} from '#/state/view-playback'
import {type HlsInstance, loadHls} from './hls.web'

/**
 * Floating player that keeps a View video going while the person browses
 * the rest of AQUA. Expanding returns to the watch page at the same time.
 */
export function ViewMiniPlayer() {
  const {mini} = useViewPlayback()
  if (!mini) return null
  return <Mini key={mini.uri} mini={mini} />
}

function Mini({mini}: {mini: MiniPlayerState}) {
  const navigation = useNavigation<NavigationProp>()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  // Where to start: read once when the source loads.
  const startTime = useRef(mini.time)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let hls: HlsInstance | undefined
    let cancelled = false
    const start = () => {
      video.currentTime = startTime.current
      video.play().catch(() => {})
    }
    loadHls.then(Hls => {
      if (cancelled) return
      if (!Hls.isSupported()) {
        video.src = mini.playlist
        video.addEventListener('loadedmetadata', start, {once: true})
        return
      }
      hls = new Hls({maxMaxBufferLength: 20, startPosition: startTime.current})
      hls.attachMedia(video)
      hls.loadSource(mini.playlist)
      hls.once(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
    })
    return () => {
      cancelled = true
      hls?.destroy()
    }
  }, [mini.playlist])

  const expand = () => {
    const time = Math.floor(videoRef.current?.currentTime ?? mini.time)
    // Keep the resume point; the watch page takes over and closes this.
    openMiniPlayer({...getViewPlayback().mini!, time})
    navigation.push('VideoWatch', {
      name: mini.did,
      rkey: mini.rkey,
      t: String(time),
    })
  }

  return (
    <div
      role="region"
      aria-label={`Miniplayer: ${mini.title}`}
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        width: 360,
        maxWidth: 'calc(100vw - 40px)',
        zIndex: 60,
        borderRadius: 18,
        overflow: 'hidden',
        background: '#0F172A',
        boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
        fontFamily: 'inherit',
      }}>
      <div
        style={{
          position: 'relative',
          aspectRatio: '16 / 9',
          background: '#000',
        }}>
        <video
          ref={videoRef}
          poster={mini.thumbnail}
          playsInline
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={e =>
            noteMiniPlayerTime(mini.uri, e.currentTarget.currentTime)
          }
          aria-label={mini.title}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
          }}
        />
        {mini.watermarkUri && (
          <img
            src={mini.watermarkUri}
            alt=""
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: 10,
              bottom: 10,
              width: 28,
              height: 28,
              objectFit: 'contain',
              opacity: 0.7,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          color: '#FFFFFF',
        }}>
        <button
          type="button"
          aria-label={playing ? 'Pausar' : 'Reproduzir'}
          onClick={() => {
            const v = videoRef.current
            if (!v) return
            if (v.paused) v.play().catch(() => {})
            else v.pause()
          }}
          style={iconButton}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            {playing ? (
              <>
                <rect x="6" y="5" width="4" height="14" rx="1" fill="#FFFFFF" />
                <rect
                  x="14"
                  y="5"
                  width="4"
                  height="14"
                  rx="1"
                  fill="#FFFFFF"
                />
              </>
            ) : (
              <path d="M8 5.5v13l10.5-6.5z" fill="#FFFFFF" />
            )}
          </svg>
        </button>
        <div
          style={{
            flexGrow: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
          }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
            {mini.title}
          </span>
          <span
            style={{
              fontSize: 12,
              opacity: 0.75,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
            {mini.author}
          </span>
        </div>
        <button
          type="button"
          aria-label="Abrir página do vídeo"
          onClick={expand}
          style={iconButton}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true">
            <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Fechar miniplayer"
          onClick={closeMiniPlayer}
          style={iconButton}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  )
}

const iconButton: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 6,
  display: 'flex',
  cursor: 'pointer',
  borderRadius: 999,
}
