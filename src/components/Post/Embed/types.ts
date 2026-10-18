import {type ReactNode} from 'react'
import {type StyleProp, type ViewStyle} from 'react-native'
import {type AppBskyFeedDefs, type ModerationDecision} from '@atproto/api'

export enum PostEmbedViewContext {
  ThreadHighlighted = 'ThreadHighlighted',
  Feed = 'Feed',
  FeedImages = 'FeedImages',
  FeedEmbedRecordWithMedia = 'FeedEmbedRecordWithMedia',
}

export enum QuoteEmbedViewContext {
  FeedEmbedRecordWithMedia = PostEmbedViewContext.FeedEmbedRecordWithMedia,
}

export type CommonProps = {
  moderation?: ModerationDecision
  onOpen?: () => void
  style?: StyleProp<ViewStyle>
  viewContext?: PostEmbedViewContext
  isWithinQuote?: boolean
  allowNestedQuotes?: boolean
  /** White-notch chrome drawn over photos, video, and article covers. */
  mediaChrome?: ReactNode
  /**
   * Media sits flush with the post card. The card's own radius clips the
   * outer corners, so the embed itself is square and cover-cropped.
   */
  bleed?: boolean
}

export type EmbedProps = CommonProps & {
  embed?: AppBskyFeedDefs.PostView['embed']
}
