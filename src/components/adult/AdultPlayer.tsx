import {useEffect, useState} from 'react'
import {useVideoPlayer, VideoView} from 'expo-video'

import {atoms as a} from '#/alf'
import {type AdultPlayerProps} from './AdultPlayer.types'

/** Native player (expo-video) for authorized, signed HLS URLs. */
export function AdultPlayer({
  authorize,
  onProgress,
  autoPlay,
}: AdultPlayerProps) {
  const [url, setUrl] = useState<string>()
  const player = useVideoPlayer(url ?? null, p => {
    if (autoPlay) p.play()
  })

  useEffect(() => {
    let cancelled = false
    authorize().then(u => !cancelled && setUrl(u))
    return () => {
      cancelled = true
    }
  }, [authorize])

  useEffect(() => {
    const tick = setInterval(() => {
      if (player.playing && onProgress)
        onProgress(
          Math.round(player.currentTime * 1000),
          player.duration ? Math.round(player.duration * 1000) : undefined,
        )
    }, 10_000)
    return () => clearInterval(tick)
  }, [player, onProgress])

  return (
    <VideoView
      player={player}
      nativeControls
      contentFit="contain"
      style={[
        a.w_full,
        a.rounded_md,
        {aspectRatio: 16 / 9, backgroundColor: '#000'},
      ]}
    />
  )
}
