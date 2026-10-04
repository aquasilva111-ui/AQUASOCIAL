import {type AppBskyFeedDefs} from '@atproto/api'

export type Drop = {
  id: string
  /** HLS playlist of the video. */
  playlist: string
  poster?: string
  authorHandle: string
  authorName: string
  caption: string
  post: AppBskyFeedDefs.PostView
}
