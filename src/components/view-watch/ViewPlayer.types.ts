import {type AppBskyEmbedVideo} from '@atproto/api'

import {type Chapter} from '#/lib/view-watch/chapters'

export type ViewPlayerHandle = {
  /** Jumps to a position (seconds) and keeps playing if it was playing. */
  seek: (sec: number) => void
  /** Current position in seconds (0 when unknown). */
  getTime: () => number
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
}
