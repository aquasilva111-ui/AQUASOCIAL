import {type AppBskyEmbedVideo} from '@atproto/api'

import {type Chapter} from '#/lib/view-watch/chapters'

export type ViewPlayerHandle = {
  /** Jumps to a position (seconds) and keeps playing if it was playing. */
  seek: (sec: number) => void
  /** Current position in seconds (0 when unknown). */
  getTime: () => number
  isPlaying: () => boolean
  play: () => void
  pause: () => void
}

export type ViewPlayerProps = {
  embed: AppBskyEmbedVideo.View
  chapters: Chapter[]
  /** Position to start from (share-at-time links). */
  startAt?: number
  /** Channel watermark, drawn over the player — never burned into the file. */
  watermarkUri?: string
  theater?: boolean
  onToggleTheater?: () => void
  onTimeUpdate?: (sec: number) => void
  onDuration?: (sec: number) => void
  onPlayingChange?: (playing: boolean) => void
  /** Start playing as soon as it can (resuming from the miniplayer). */
  autoStart?: boolean
  /** What plays next; shown at the end with an autoplay countdown. */
  upNext?: {title: string; thumbnail?: string}
  autoplay?: boolean
  onPlayNext?: () => void
  /** Keeps playing in the miniplayer and leaves the page. */
  onMiniPlayer?: () => void
}
