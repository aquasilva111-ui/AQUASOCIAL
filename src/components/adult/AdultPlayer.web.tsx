import {useEffect, useRef} from 'react'
import Hls from 'hls.js'

import {type AdultPlayerProps} from './AdultPlayer.types'

/**
 * HLS player for protected +18 media. Nothing loads until the API has
 * authorized playback; when the short-lived authorization expires mid-play
 * (403), it asks for a fresh one and resumes at the same position.
 */
export function AdultPlayer({
  authorize,
  onProgress,
  autoPlay,
}: AdultPlayerProps) {
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = video.current
    if (!el) return
    let hls: Hls | undefined
    let cancelled = false
    let refreshing = false

    const load = async (resumeAt = 0) => {
      const url = await authorize()
      if (cancelled || !url) return
      if (Hls.isSupported()) {
        hls?.destroy()
        hls = new Hls()
        hls.on(Hls.Events.ERROR, async (_e, data) => {
          if (data.response?.code === 403 && !refreshing) {
            refreshing = true
            await load(el.currentTime)
            refreshing = false
          }
        })
        hls.loadSource(url)
        hls.attachMedia(el)
      } else {
        el.src = url // Safari: native HLS
      }
      el.currentTime = resumeAt
      if (autoPlay) el.play().catch(() => {})
    }
    load()

    const tick = setInterval(() => {
      if (!el.paused && onProgress)
        onProgress(
          Math.round(el.currentTime * 1000),
          el.duration ? Math.round(el.duration * 1000) : undefined,
        )
    }, 10_000)
    return () => {
      cancelled = true
      clearInterval(tick)
      hls?.destroy()
      el.removeAttribute('src')
    }
  }, [authorize, onProgress, autoPlay])

  return (
    <video
      ref={video}
      controls
      playsInline
      controlsList="nodownload"
      style={{
        width: '100%',
        aspectRatio: '16 / 9',
        background: '#000',
        borderRadius: 16,
      }}
    />
  )
}
