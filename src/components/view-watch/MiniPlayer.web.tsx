// Web-only DOM overlay: text lives in DOM elements, not React Native <Text>.

import {useCallback, useEffect, useRef, useState} from 'react'
import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {stopMusic, toggleMusic, useMusic} from '#/state/music'
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
  const isAudio = mini.kind === 'audio'
  const playerH = isAudio ? ROW_H : PLAYER_H
  const [videoPlaying, setPlaying] = useState(false)
  const music = useMusic()
  const external = !!mini.external
  const playing = external ? music.playing : videoPlaying
  // Collapsed = just a black play circle; tapping it morphs into the player.
  const [collapsed, setCollapsed] = useState(false)
  // null = docked bottom-right; set once the person drags it somewhere.
  const [pos, setPos] = useState<{x: number; y: number} | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    px: number
    py: number
    x: number
    y: number
    moved: boolean
  } | null>(null)
  const [dragging, setDragging] = useState(false)
  // Where to start: read once when the source loads.
  const startTime = useRef(mini.time)

  useEffect(() => {
    const video = videoRef.current
    if (!video || external) return
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
  }, [mini.playlist, external])

  const clampPos = useCallback((x: number, y: number, w: number, h: number) => {
    const maxX = Math.max(8, window.innerWidth - w - 8)
    const maxY = Math.max(8, window.innerHeight - h - 8)
    return {
      x: Math.min(maxX, Math.max(8, x)),
      y: Math.min(maxY, Math.max(8, y)),
    }
  }, [])

  const setCollapsedAnchored = (next: boolean) => {
    const el = rootRef.current
    if (el && pos) {
      // Keep the right edge fixed so the circle grows out of / into its spot.
      const r = el.getBoundingClientRect()
      const w = next ? CIRCLE : Math.min(PLAYER_W, window.innerWidth - 40)
      const h = next ? CIRCLE : playerH
      setPos(clampPos(r.right - w, r.bottom - h, w, h))
    }
    setCollapsed(next)
  }

  useEffect(() => {
    const onResize = () => {
      const el = rootRef.current
      if (!el) return
      setPos(p => {
        if (!p) return p
        return clampPos(p.x, p.y, el.offsetWidth, el.offsetHeight)
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clampPos])

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    drag.current = {
      px: e.clientX,
      py: e.clientY,
      x: r.left,
      y: r.top,
      moved: false,
    }
    el.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    const el = rootRef.current
    if (!d || !el) return
    const dx = e.clientX - d.px
    const dy = e.clientY - d.py
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return
    if (!d.moved) {
      d.moved = true
      setDragging(true)
    }
    setPos(clampPos(d.x + dx, d.y + dy, el.offsetWidth, el.offsetHeight))
  }
  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    setDragging(false)
    // A tap (no drag) on the circle opens the player.
    if (d && !d.moved && collapsed) setCollapsedAnchored(false)
  }

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
      ref={rootRef}
      role="region"
      aria-label={`Miniplayer: ${mini.title}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: 'fixed',
        ...(pos ? {left: pos.x, top: pos.y} : {right: 20, bottom: 20}),
        width: collapsed ? CIRCLE : PLAYER_W,
        maxWidth: collapsed ? CIRCLE : 'calc(100vw - 40px)',
        height: collapsed ? CIRCLE : playerH,
        zIndex: 60,
        borderRadius: collapsed ? CIRCLE / 2 : isAudio ? ROW_H / 2 : 18,
        overflow: 'hidden',
        background: collapsed ? '#000000' : '#0F172A',
        boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
        fontFamily: 'inherit',
        cursor: dragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        touchAction: 'none',
        transition: dragging
          ? 'none'
          : 'width .38s cubic-bezier(.34,1.3,.5,1), height .38s cubic-bezier(.34,1.3,.5,1), border-radius .38s ease, background .2s',
      }}>
      {collapsed && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
            pointerEvents: 'none',
          }}>
          <svg width="22" height="22" viewBox="0 0 24 24">
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
        </div>
      )}
      <div
        style={{
          width: PLAYER_W,
          maxWidth: 'calc(100vw - 40px)',
          opacity: collapsed ? 0 : 1,
          pointerEvents: collapsed ? 'none' : 'auto',
          transition: collapsed ? 'opacity .1s' : 'opacity .2s .15s',
        }}>
        <div
          style={{
            position: 'relative',
            ...(isAudio ? {height: 0} : {aspectRatio: '16 / 9'}),
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
          {isAudio && (
            <img
              src={mini.thumbnail}
              alt=""
              aria-hidden="true"
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                objectFit: 'cover',
                background: '#D85A30',
                flexShrink: 0,
              }}
            />
          )}
          <button
            type="button"
            aria-label={playing ? 'Pausar' : 'Reproduzir'}
            onClick={() => {
              if (external) {
                toggleMusic()
                return
              }
              const v = videoRef.current
              if (!v) return
              if (v.paused) v.play().catch(() => {})
              else v.pause()
            }}
            style={iconButton}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              {playing ? (
                <>
                  <rect
                    x="6"
                    y="5"
                    width="4"
                    height="14"
                    rx="1"
                    fill="#FFFFFF"
                  />
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
            aria-label="Minimizar em círculo"
            onClick={() => setCollapsedAnchored(true)}
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
              <path d="M5 12h14" />
            </svg>
          </button>
          {!isAudio && (
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
          )}
          <button
            type="button"
            aria-label="Fechar miniplayer"
            onClick={external ? stopMusic : closeMiniPlayer}
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
    </div>
  )
}

const CIRCLE = 48
const PLAYER_W = 360
// 16:9 video at PLAYER_W plus the 56px control row.
const ROW_H = 56
const PLAYER_H = Math.round((PLAYER_W * 9) / 16) + ROW_H

const iconButton: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 6,
  display: 'flex',
  cursor: 'pointer',
  borderRadius: 999,
}
