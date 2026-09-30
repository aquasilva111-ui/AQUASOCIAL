// Web-only DOM player (<video>, <button>, <span>): text lives in DOM
// elements, not React Native <Text>.
/* eslint-disable bsky-internal/avoid-unwrapped-text */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

import {chapterAt, formatTime} from '#/lib/view-watch/chapters'
import {type HlsInstance, loadHls} from './hls.web'
import {type ViewPlayerHandle, type ViewPlayerProps} from './ViewPlayer.types'

const COUNTDOWN_SEC = 8

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
const WHITE = '#FFFFFF'
const ACCENT = '#00A0FF'

type Menu = 'speed' | 'quality' | 'captions' | null

/**
 * The AQUA View player (web). Separate from the social feed's player on
 * purpose: the feed keeps its compact controls, the watch page gets the
 * full set. Same hls.js engine and the same HLS playlist from the post.
 */
export const ViewPlayer = forwardRef<ViewPlayerHandle, ViewPlayerProps>(
  function ViewPlayer(props, ref) {
    const {embed, chapters, startAt, watermarkUri, theater} = props
    const videoRef = useRef<HTMLVideoElement>(null)
    const boxRef = useRef<HTMLDivElement>(null)
    const hlsRef = useRef<HlsInstance | undefined>(undefined)
    const [playing, setPlaying] = useState(false)
    const [time, setTime] = useState(startAt ?? 0)
    const [duration, setDuration] = useState(0)
    const [muted, setMuted] = useState(false)
    const [speed, setSpeed] = useState(1)
    const [levels, setLevels] = useState<{index: number; height: number}[]>([])
    const [level, setLevel] = useState(-1)
    const [autoHeight, setAutoHeight] = useState<number>()
    const [tracks, setTracks] = useState<{index: number; name: string}[]>([])
    const [track, setTrack] = useState(-1)
    const [menu, setMenu] = useState<Menu>(null)
    const [error, setError] = useState<string>()
    const [fullscreen, setFullscreen] = useState(false)
    const [ended, setEnded] = useState(false)
    // Read once when the source loads; changing it later must not reload.
    const autoStartRef = useRef(props.autoStart)
    const [countdown, setCountdown] = useState<number | null>(null)

    useImperativeHandle(ref, () => ({
      seek(sec) {
        const v = videoRef.current
        if (!v) return
        v.currentTime = Math.max(0, sec)
        setTime(v.currentTime)
      },
      getTime: () => videoRef.current?.currentTime ?? 0,
      isPlaying: () => !!videoRef.current && !videoRef.current.paused,
      play: () => {
        videoRef.current?.play().catch(() => {})
      },
      pause: () => videoRef.current?.pause(),
    }))

    // ---------------------------------------------------------- hls setup
    useEffect(() => {
      const video = videoRef.current
      if (!video) return
      let cancelled = false
      let hls: HlsInstance | undefined
      loadHls.then(Hls => {
        if (cancelled) return
        if (!Hls.isSupported()) {
          // Safari plays HLS natively.
          if (video.canPlayType('application/vnd.apple.mpegurl'))
            video.src = embed.playlist
          else setError('Seu navegador não reproduz este vídeo.')
          return
        }
        hls = new Hls({maxMaxBufferLength: 30})
        hlsRef.current = hls
        hls.attachMedia(video)
        hls.loadSource(embed.playlist)
        if (autoStartRef.current)
          hls.once(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => {})
          })
        hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
          setLevels(
            data.levels
              .map((l, index) => ({index, height: l.height}))
              .filter(l => l.height > 0)
              .sort((x, y) => y.height - x.height),
          )
        })
        hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
          setAutoHeight(hls?.levels[data.level]?.height)
        })
        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_e, data) => {
          setTracks(
            data.subtitleTracks.map((t, index) => ({
              index,
              name: t.name || t.lang || `Legenda ${index + 1}`,
            })),
          )
        })
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal)
            setError(
              data.details === 'manifestLoadError'
                ? 'Vídeo não encontrado.'
                : 'Não foi possível reproduzir o vídeo.',
            )
        })
      })
      return () => {
        cancelled = true
        hls?.destroy()
        hlsRef.current = undefined
      }
    }, [embed.playlist])

    // Autoplay countdown after the video ends.
    const {upNext, autoplay, onPlayNext} = props
    useEffect(() => {
      if (!ended || !upNext || !autoplay || !onPlayNext) {
        setCountdown(null)
        return
      }
      setCountdown(COUNTDOWN_SEC)
      const started = Date.now()
      const timer = setInterval(() => {
        const left = COUNTDOWN_SEC - Math.floor((Date.now() - started) / 1000)
        if (left <= 0) {
          clearInterval(timer)
          setCountdown(null)
          onPlayNext()
        } else setCountdown(left)
      }, 250)
      return () => clearInterval(timer)
    }, [ended, upNext, autoplay, onPlayNext])

    useEffect(() => {
      if (startAt && videoRef.current) videoRef.current.currentTime = startAt
    }, [startAt])

    // React only applies `muted` on mount; keep the element in sync.
    useEffect(() => {
      if (videoRef.current) videoRef.current.muted = muted
    }, [muted])

    useEffect(() => {
      const onFs = () =>
        setFullscreen(document.fullscreenElement === boxRef.current)
      document.addEventListener('fullscreenchange', onFs)
      return () => document.removeEventListener('fullscreenchange', onFs)
    }, [])

    // ---------------------------------------------------------- actions
    const togglePlay = useCallback(() => {
      const v = videoRef.current
      if (!v) return
      if (v.paused) v.play().catch(() => {})
      else v.pause()
    }, [])

    const seekBy = useCallback((delta: number) => {
      const v = videoRef.current
      if (v)
        v.currentTime = Math.min(
          Math.max(0, v.currentTime + delta),
          v.duration || Infinity,
        )
    }, [])

    const pickSpeed = (s: number) => {
      if (videoRef.current) videoRef.current.playbackRate = s
      setSpeed(s)
      setMenu(null)
    }
    const pickLevel = (index: number) => {
      if (hlsRef.current) hlsRef.current.currentLevel = index
      setLevel(index)
      setMenu(null)
    }
    const pickTrack = (index: number) => {
      if (hlsRef.current) {
        hlsRef.current.subtitleTrack = index
        hlsRef.current.subtitleDisplay = index >= 0
      }
      setTrack(index)
      setMenu(null)
    }
    const togglePip = async () => {
      const v = videoRef.current
      if (!v) return
      try {
        if (document.pictureInPictureElement)
          await document.exitPictureInPicture()
        else await v.requestPictureInPicture()
      } catch {}
    }
    const toggleFullscreen = () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      else boxRef.current?.requestFullscreen().catch(() => {})
    }

    const onKeyDown = (e: React.KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON' && e.key === ' ')
        return
      const handled: Record<string, () => void> = {
        ' ': togglePlay,
        k: togglePlay,
        ArrowLeft: () => seekBy(-5),
        ArrowRight: () => seekBy(5),
        j: () => seekBy(-10),
        l: () => seekBy(10),
        m: () => setMuted(v => !v),
        f: toggleFullscreen,
        t: () => props.onToggleTheater?.(),
      }
      const fn = handled[e.key]
      if (fn) {
        e.preventDefault()
        fn()
      }
    }

    const onScrub = (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const ratio = Math.min(
        1,
        Math.max(0, (e.clientX - rect.left) / rect.width),
      )
      const v = videoRef.current
      if (v && duration) v.currentTime = ratio * duration
    }

    // ---------------------------------------------------------- render
    const chapterIndex = chapterAt(chapters, time)
    const segments =
      chapters.length && duration
        ? chapters.map((c, i) => {
            const end = chapters[i + 1]?.startSec ?? duration
            const len = Math.max(0.1, end - c.startSec)
            const done = Math.min(1, Math.max(0, (time - c.startSec) / len))
            return {key: c.startSec, grow: len, done}
          })
        : [{key: 0, grow: 1, done: duration ? time / duration : 0}]
    const qualityLabel =
      level === -1
        ? `Auto${autoHeight ? ` (${autoHeight}p)` : ''}`
        : `${levels.find(l => l.index === level)?.height ?? ''}p`
    const pipSupported =
      typeof document !== 'undefined' && !!document.pictureInPictureEnabled

    return (
      <div
        ref={boxRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label="Player de vídeo"
        role="region"
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: fullscreen ? undefined : '16 / 9',
          height: fullscreen ? '100%' : undefined,
          background: '#000',
          borderRadius: fullscreen || theater ? 0 : 20,
          overflow: 'hidden',
          outline: 'none',
        }}>
        <video
          ref={videoRef}
          poster={embed.thumbnail}
          playsInline
          muted={muted}
          onClick={togglePlay}
          onPlay={() => {
            setPlaying(true)
            setEnded(false)
            props.onPlayingChange?.(true)
          }}
          onPause={() => {
            setPlaying(false)
            props.onPlayingChange?.(false)
          }}
          onEnded={() => setEnded(true)}
          onTimeUpdate={e => {
            const t = e.currentTarget.currentTime
            setTime(t)
            props.onTimeUpdate?.(t)
          }}
          onLoadedMetadata={e => {
            const d = e.currentTarget.duration
            if (Number.isFinite(d)) {
              setDuration(d)
              props.onDuration?.(d)
            }
          }}
          aria-label={embed.alt || 'Vídeo'}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
          }}
        />

        {chapterIndex >= 0 && (
          <span
            style={{
              position: 'absolute',
              top: 14,
              left: 16,
              fontSize: 12,
              fontWeight: 700,
              padding: '5px 10px',
              borderRadius: 999,
              background: 'rgba(0,0,0,0.6)',
              color: WHITE,
              pointerEvents: 'none',
            }}>
            {chapters[chapterIndex].title}
          </span>
        )}

        {watermarkUri && (
          <img
            src={watermarkUri}
            alt=""
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: 16,
              bottom: 76,
              width: '7%',
              minWidth: 32,
              maxWidth: 72,
              aspectRatio: '1 / 1',
              objectFit: 'contain',
              opacity: 0.7,
              pointerEvents: 'none',
            }}
          />
        )}

        {error && (
          <div
            role="alert"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: WHITE,
              fontSize: 15,
              background: 'rgba(0,0,0,0.7)',
            }}>
            {error}
          </div>
        )}

        {ended && upNext && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.78)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              color: WHITE,
              padding: 24,
              textAlign: 'center',
            }}>
            <span style={{fontSize: 13, fontWeight: 600, opacity: 0.85}}>
              {countdown !== null ? `A seguir em ${countdown} s` : 'A seguir'}
            </span>
            {upNext.thumbnail && (
              <img
                src={upNext.thumbnail}
                alt=""
                style={{
                  width: 220,
                  maxWidth: '40%',
                  aspectRatio: '16 / 9',
                  objectFit: 'cover',
                  borderRadius: 12,
                }}
              />
            )}
            <span style={{fontSize: 17, fontWeight: 700, maxWidth: 520}}>
              {upNext.title}
            </span>
            <div style={{display: 'flex', gap: 10}}>
              {countdown !== null && (
                <button
                  type="button"
                  onClick={() => setEnded(false)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,0.5)',
                    background: 'transparent',
                    color: WHITE,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}>
                  Cancelar
                </button>
              )}
              <button
                type="button"
                onClick={() => onPlayNext?.()}
                style={{
                  padding: '9px 16px',
                  borderRadius: 999,
                  border: 'none',
                  background: WHITE,
                  color: '#0F172A',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}>
                Assistir agora
              </button>
            </div>
          </div>
        )}

        {!playing && !error && !(ended && upNext) && (
          <button
            type="button"
            aria-label="Reproduzir"
            onClick={togglePlay}
            style={{
              position: 'absolute',
              left: '50%',
              top: '45%',
              transform: 'translate(-50%, -50%)',
              width: 72,
              height: 72,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,0.92)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}>
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="#0F172A"
              aria-hidden="true">
              <path d="M8 5.5v13l10.5-6.5z" />
            </svg>
          </button>
        )}

        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: '12px 16px',
            background: 'linear-gradient(transparent, rgba(0,0,0,0.75))',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
          <div
            role="slider"
            aria-label="Progresso"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(time)}
            aria-valuetext={`${formatTime(time)} de ${formatTime(duration)}`}
            onClick={onScrub}
            style={{
              display: 'flex',
              gap: 3,
              height: 14,
              alignItems: 'center',
              cursor: 'pointer',
            }}>
            {segments.map(s => (
              <div
                key={s.key}
                style={{
                  flexGrow: s.grow,
                  flexBasis: 0,
                  height: 5,
                  borderRadius: 3,
                  background: 'rgba(255,255,255,0.35)',
                  overflow: 'hidden',
                }}>
                <div
                  style={{
                    width: `${s.done * 100}%`,
                    height: '100%',
                    background: ACCENT,
                  }}
                />
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              color: WHITE,
            }}>
            <IconButton
              label={playing ? 'Pausar' : 'Reproduzir'}
              onPress={togglePlay}>
              {playing ? (
                <>
                  <rect x="6" y="5" width="4" height="14" rx="1" fill={WHITE} />
                  <rect
                    x="14"
                    y="5"
                    width="4"
                    height="14"
                    rx="1"
                    fill={WHITE}
                  />
                </>
              ) : (
                <path d="M8 5.5v13l10.5-6.5z" fill={WHITE} />
              )}
            </IconButton>
            {upNext && onPlayNext && (
              <IconButton
                label={`Próximo: ${upNext.title}`}
                onPress={onPlayNext}>
                <path d="M6 6v12l8.5-6z" fill={WHITE} />
                <rect
                  x="16"
                  y="6"
                  width="2.5"
                  height="12"
                  rx="1"
                  fill={WHITE}
                />
              </IconButton>
            )}
            <IconButton
              label={muted ? 'Ativar som' : 'Silenciar'}
              onPress={() => setMuted(v => !v)}>
              <path
                d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"
                fill="none"
                stroke={WHITE}
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {muted ? (
                <path
                  d="M16 9l5 6M21 9l-5 6"
                  stroke={WHITE}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M15.5 9a4 4 0 0 1 0 6"
                  fill="none"
                  stroke={WHITE}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              )}
            </IconButton>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
              }}>
              {formatTime(time)} / {formatTime(duration)}
            </span>
            {chapterIndex >= 0 && (
              <span
                style={{
                  fontSize: 13,
                  opacity: 0.85,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                · {chapters[chapterIndex].title}
              </span>
            )}
            <span style={{flexGrow: 1}} />

            <MenuButton
              label="Velocidade"
              value={speed === 1 ? '1×' : `${String(speed).replace('.', ',')}×`}
              open={menu === 'speed'}
              onToggle={() => setMenu(m => (m === 'speed' ? null : 'speed'))}
              options={SPEEDS.map(s => ({
                key: String(s),
                label: s === 1 ? 'Normal' : `${String(s).replace('.', ',')}×`,
                selected: s === speed,
                onPick: () => pickSpeed(s),
              }))}
            />
            {tracks.length > 0 && (
              <MenuButton
                label="Legendas"
                value="CC"
                active={track >= 0}
                open={menu === 'captions'}
                onToggle={() =>
                  setMenu(m => (m === 'captions' ? null : 'captions'))
                }
                options={[
                  {
                    key: 'off',
                    label: 'Desativadas',
                    selected: track < 0,
                    onPick: () => pickTrack(-1),
                  },
                  ...tracks.map(t => ({
                    key: String(t.index),
                    label: t.name,
                    selected: t.index === track,
                    onPick: () => pickTrack(t.index),
                  })),
                ]}
              />
            )}
            {levels.length > 1 && (
              <MenuButton
                label="Qualidade"
                value={qualityLabel}
                open={menu === 'quality'}
                onToggle={() =>
                  setMenu(m => (m === 'quality' ? null : 'quality'))
                }
                options={[
                  {
                    key: 'auto',
                    label: `Auto${autoHeight ? ` (${autoHeight}p)` : ''}`,
                    selected: level === -1,
                    onPick: () => pickLevel(-1),
                  },
                  ...levels.map(l => ({
                    key: String(l.index),
                    label: `${l.height}p`,
                    selected: l.index === level,
                    onPick: () => pickLevel(l.index),
                  })),
                ]}
              />
            )}
            {props.onMiniPlayer && !fullscreen && (
              <IconButton label="Miniplayer" onPress={props.onMiniPlayer}>
                <rect
                  x="3"
                  y="5"
                  width="18"
                  height="14"
                  rx="2"
                  fill="none"
                  stroke={WHITE}
                  strokeWidth={2}
                />
                <rect x="11" y="11" width="8" height="6" rx="1" fill={WHITE} />
              </IconButton>
            )}
            {pipSupported && (
              <IconButton label="Picture-in-picture" onPress={togglePip}>
                <rect
                  x="3"
                  y="5"
                  width="18"
                  height="14"
                  rx="2"
                  fill="none"
                  stroke={WHITE}
                  strokeWidth={2}
                />
                <rect x="12" y="12" width="7" height="5" rx="1" fill={WHITE} />
              </IconButton>
            )}
            {props.onToggleTheater && !fullscreen && (
              <IconButton
                label={theater ? 'Sair do modo teatro' : 'Modo teatro'}
                onPress={props.onToggleTheater}>
                <rect
                  x="2"
                  y={theater ? 8 : 6}
                  width="20"
                  height={theater ? 8 : 12}
                  rx="2"
                  fill="none"
                  stroke={WHITE}
                  strokeWidth={2}
                />
              </IconButton>
            )}
            <IconButton
              label={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
              onPress={toggleFullscreen}>
              <path
                d={
                  fullscreen
                    ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5'
                    : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'
                }
                fill="none"
                stroke={WHITE}
                strokeWidth={2}
                strokeLinecap="round"
              />
            </IconButton>
          </div>
        </div>
      </div>
    )
  },
)

function IconButton({
  label,
  onPress,
  children,
}: {
  label: string
  onPress: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onPress}
      style={{
        background: 'none',
        border: 'none',
        padding: 4,
        display: 'flex',
        cursor: 'pointer',
      }}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        {children}
      </svg>
    </button>
  )
}

function MenuButton({
  label,
  value,
  open,
  active,
  onToggle,
  options,
}: {
  label: string
  value: string
  open: boolean
  active?: boolean
  onToggle: () => void
  options: {key: string; label: string; selected: boolean; onPick: () => void}[]
}) {
  return (
    <div style={{position: 'relative'}}>
      <button
        type="button"
        aria-label={`${label}: ${value}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
        style={{
          background: active ? ACCENT : 'rgba(255,255,255,0.16)',
          color: active ? '#00131F' : WHITE,
          border: 'none',
          borderRadius: 8,
          padding: '4px 9px',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}>
        {value}
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          style={{
            position: 'absolute',
            right: 0,
            bottom: 34,
            minWidth: 150,
            padding: 6,
            borderRadius: 14,
            background: 'rgba(15,23,42,0.96)',
            display: 'flex',
            flexDirection: 'column',
          }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.7)',
              padding: '6px 10px',
            }}>
            {label}
          </span>
          {options.map(o => (
            <button
              key={o.key}
              type="button"
              role="menuitemradio"
              aria-checked={o.selected}
              onClick={o.onPick}
              style={{
                textAlign: 'left',
                background: o.selected
                  ? 'rgba(255,255,255,0.14)'
                  : 'transparent',
                color: WHITE,
                border: 'none',
                borderRadius: 10,
                padding: '8px 10px',
                fontSize: 13,
                fontWeight: o.selected ? 700 : 500,
                cursor: 'pointer',
              }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
