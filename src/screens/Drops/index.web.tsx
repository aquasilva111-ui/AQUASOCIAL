/* eslint-disable bsky-internal/avoid-unwrapped-text -- plain DOM elements, web only */
import {useEffect, useRef, useState} from 'react'
import {View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {POST_TOMBSTONE, usePostShadow} from '#/state/cache/post-shadow'
import {ThemeProvider, useBreakpoints} from '#/alf'
import {SearchInput} from '#/components/forms/SearchInput'
import {
  Heart2_Filled_Stroke2_Corner0_Rounded as HeartFilled,
  Heart2_Stroke2_Corner0_Rounded as Heart,
} from '#/components/icons/Heart2'
import {StoriesTray} from '#/components/stories/StoriesTray'
import {loadHls} from '#/components/view-watch/hls.web'
import {type Drop} from './data'
import {useDropLike} from './useDropLike'
import {useDropsFeed} from './useDropsFeed'

/** Web layout, like TikTok on desktop: a centered 9:16 card with the actions beside it. */

const LIKE = '#FF7A00'
const AQUA = '#1185FE'
/** The fixed bottom dock overlays the feed; keep the card clear of it. */
const DOCK_CLEARANCE = 128

const TRENDING = ['Jericoacoara', 'Neon', 'Trilha', 'Pôr do sol']

const compact = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)} mil` : String(n)

const circle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: '50%',
  border: 0,
  background: 'rgba(255,255,255,0.14)',
  color: '#fff',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  padding: 0,
}

function Slide(props: {
  drop: Drop
  active: boolean
  near: boolean
  muted: boolean
  onToggleMute: () => void
}) {
  const shadow = usePostShadow(props.drop.post)
  if (shadow === POST_TOMBSTONE) return null
  return <SlideInner {...props} post={shadow} />
}

function SlideInner({
  drop,
  active,
  near,
  muted,
  onToggleMute,
  post,
}: {
  drop: Drop
  active: boolean
  near: boolean
  muted: boolean
  onToggleMute: () => void
  post: Parameters<typeof useDropLike>[0]
}) {
  const {liked, likeCount, toggle} = useDropLike(post)
  const video = useRef<HTMLVideoElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)
  const [copied, setCopied] = useState(false)

  // Posts are HLS playlists: hls.js everywhere except Safari, which plays them natively.
  useEffect(() => {
    const v = video.current
    if (!v || !near) return
    let cancelled = false
    let hls: {destroy: () => void} | undefined
    loadHls.then(Hls => {
      if (cancelled) return
      if (Hls.isSupported()) {
        const instance = new Hls({maxMaxBufferLength: 20})
        hls = instance
        instance.attachMedia(v)
        instance.loadSource(drop.playlist)
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
        v.src = drop.playlist
      }
    })
    return () => {
      cancelled = true
      hls?.destroy()
    }
  }, [near, drop.playlist])

  useEffect(() => {
    const v = video.current
    if (!v) return
    v.muted = muted
    if (active) {
      v.play().catch(() => {})
      setPaused(false)
    } else {
      v.pause()
      v.currentTime = 0
    }
  }, [active, muted, near])

  const LikeIcon = liked ? HeartFilled : Heart
  const copyLink = () => {
    navigator.clipboard
      ?.writeText(`${window.location.origin}/drops`)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }

  return (
    <div
      style={{
        height: '100%',
        scrollSnapAlign: 'start',
        scrollSnapStop: 'always',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
        padding: `16px 0 ${DOCK_CLEARANCE}px`,
        boxSizing: 'border-box',
      }}>
      <div
        style={{
          height: '100%',
          aspectRatio: '9 / 16',
          maxWidth: 'calc(100% - 80px)',
          position: 'relative',
          borderRadius: 16,
          overflow: 'hidden',
          background: '#000',
        }}>
        {near ? (
          <video
            ref={video}
            poster={drop.poster}
            loop
            playsInline
            muted={muted}
            preload="auto"
            onTimeUpdate={e => {
              const v = e.currentTarget
              if (bar.current && v.duration)
                bar.current.style.width = `${(v.currentTime / v.duration) * 100}%`
            }}
            onClick={() => {
              const v = video.current
              if (!v) return
              if (v.paused) {
                v.play().catch(() => {})
                setPaused(false)
              } else {
                v.pause()
                setPaused(true)
              }
            }}
            onDoubleClick={() => toggle(true)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              cursor: 'pointer',
            }}
          />
        ) : (
          <img
            src={drop.poster ?? ''}
            alt=""
            style={{width: '100%', height: '100%', objectFit: 'cover'}}
          />
        )}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '35%',
            pointerEvents: 'none',
            background: 'linear-gradient(transparent, rgba(0,0,0,0.65))',
          }}
        />
        <button
          type="button"
          aria-label={muted ? 'Ativar som' : 'Silenciar'}
          onClick={onToggleMute}
          style={{
            ...circle,
            width: 36,
            height: 36,
            position: 'absolute',
            top: 12,
            left: 12,
            background: 'rgba(0,0,0,0.4)',
            fontSize: 16,
          }}>
          {muted ? '🔇' : '🔊'}
        </button>
        {paused ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              pointerEvents: 'none',
              color: '#fff',
              fontSize: 56,
              textShadow: '0 2px 12px rgba(0,0,0,0.5)',
            }}>
            ▶
          </div>
        ) : null}
        <div
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 16,
            color: '#fff',
            pointerEvents: 'none',
          }}>
          <div style={{fontWeight: 700, fontSize: 17}}>
            @{drop.authorHandle}
          </div>
          <div style={{fontSize: 14, lineHeight: 1.4, marginTop: 4}}>
            {drop.caption}
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 3,
            background: 'rgba(255,255,255,0.25)',
          }}>
          <div
            ref={bar}
            style={{
              height: '100%',
              width: 0,
              background: `linear-gradient(90deg, #002BEF, #009EFF)`,
            }}
          />
        </div>
      </div>

      <div
        style={{
          alignSelf: 'flex-end',
          marginBottom: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
          color: '#fff',
        }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: AQUA,
            border: '2px solid #fff',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 700,
            fontSize: 18,
            boxSizing: 'border-box',
          }}>
          {drop.authorName[0]?.toUpperCase() ?? '?'}
        </div>
        <div style={{display: 'grid', justifyItems: 'center', gap: 4}}>
          <button
            type="button"
            aria-label={liked ? 'Descurtir' : 'Curtir'}
            onClick={() => toggle()}
            style={circle}>
            <LikeIcon width={26} style={{color: liked ? LIKE : '#fff'}} />
          </button>
          <span style={{fontSize: 12, fontWeight: 600}}>
            {compact(likeCount)}
          </span>
        </div>
        <div style={{display: 'grid', justifyItems: 'center', gap: 4}}>
          <button
            type="button"
            aria-label="Copiar link"
            onClick={copyLink}
            style={{...circle, fontSize: 20}}>
            ↗
          </button>
          <span style={{fontSize: 12, fontWeight: 600}}>
            {copied ? 'Copiado' : 'Enviar'}
          </span>
        </div>
      </div>
    </div>
  )
}

export function DropsScreen() {
  const scroller = useRef<HTMLDivElement>(null)
  const {drops, isLoading, isError, loadMore, refetch} = useDropsFeed()
  const [index, setIndex] = useState(0)
  const [muted, setMuted] = useState(true)
  const [query, setQuery] = useState('')
  const navigation = useNavigation<NavigationProp>()
  const {gtMobile} = useBreakpoints()
  const goSearch = (text: string) => {
    const q = text.trim()
    navigation.navigate('Search', q ? {q} : {})
  }
  const goTo = (i: number) => {
    const el = scroller.current
    if (!el) return
    el.scrollTo({
      top: Math.max(0, i) * el.clientHeight,
      behavior: 'smooth',
    })
  }

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    const i = Math.round(el.scrollTop / el.clientHeight)
    if (i !== index) setIndex(i)
    if (i >= drops.length - 4) loadMore()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') goTo(index + 1)
      else if (e.key === 'ArrowUp') goTo(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const arrow: React.CSSProperties = {
    ...circle,
    width: 44,
    height: 44,
    fontSize: 18,
  }

  return (
    <View style={{flex: 1, flexDirection: 'row', backgroundColor: '#000'}}>
      <View style={{flex: 1, position: 'relative'}}>
        <div
          ref={scroller}
          onScroll={onScroll}
          style={{
            position: 'absolute',
            inset: 0,
            overflowY: 'scroll',
            scrollSnapType: 'y mandatory',
            scrollbarWidth: 'none',
          }}>
          {drops.length === 0 ? (
            <div
              style={{
                height: '100%',
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                textAlign: 'center',
                fontSize: 15,
              }}>
              {isError ? (
                <div style={{display: 'grid', gap: 12, justifyItems: 'center'}}>
                  Não foi possível carregar os drops.
                  <button
                    type="button"
                    onClick={() => refetch()}
                    style={{
                      background: AQUA,
                      color: '#fff',
                      border: 0,
                      borderRadius: 99,
                      padding: '10px 20px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}>
                    Tentar de novo
                  </button>
                </div>
              ) : (
                <span>
                  {isLoading ? 'Carregando drops…' : 'Buscando drops…'}
                </span>
              )}
            </div>
          ) : null}
          {drops.map((drop, i) => (
            <Slide
              key={drop.id}
              drop={drop}
              active={i === index}
              near={Math.abs(i - index) <= 1}
              muted={muted}
              onToggleMute={() => setMuted(m => !m)}
            />
          ))}
        </div>
        <div
          style={{
            position: 'absolute',
            right: 16,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'grid',
            gap: 12,
          }}>
          <button
            type="button"
            aria-label="Drop anterior"
            disabled={index === 0}
            onClick={() => goTo(index - 1)}
            style={{...arrow, opacity: index === 0 ? 0.35 : 1}}>
            ▲
          </button>
          <button
            type="button"
            aria-label="Próximo drop"
            onClick={() => goTo(index + 1)}
            style={arrow}>
            ▼
          </button>
        </div>
      </View>
      {gtMobile ? (
        <div
          style={{
            width: 280,
            flexShrink: 0,
            borderLeft: '1px solid rgba(255,255,255,0.09)',
            padding: '18px 16px',
            paddingBottom: DOCK_CLEARANCE,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            boxSizing: 'border-box',
          }}>
          <button
            type="button"
            aria-label="Ir para a Home"
            onClick={() => navigation.navigate('Home')}
            style={{
              background: 'none',
              border: 0,
              padding: 0,
              textAlign: 'left',
              color: '#fff',
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: -0.8,
              cursor: 'pointer',
            }}>
            Aqua<span style={{color: AQUA}}>.</span>
          </button>
          <ThemeProvider theme="dark">
            <SearchInput
              value={query}
              onChangeText={setQuery}
              onClearText={() => setQuery('')}
              onSubmitEditing={() => goSearch(query)}
              label="Pesquisar"
            />
            <div style={{margin: '0 -16px'}}>
              <StoriesTray />
            </div>
          </ThemeProvider>
          <span
            style={{
              fontSize: 12,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: '#98a2b8',
              fontWeight: 700,
            }}>
            Em alta
          </span>
          <div style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>
            {TRENDING.map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => goSearch(tag)}
                style={{
                  background: '#151a25',
                  color: '#98a2b8',
                  border: 0,
                  borderRadius: 99,
                  padding: '6px 12px',
                  fontSize: 12.5,
                  cursor: 'pointer',
                }}>
                {tag}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </View>
  )
}
