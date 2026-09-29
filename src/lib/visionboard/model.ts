import {type AppBskyFeedDefs, type AppBskyFeedPost} from '@atproto/api'
import {type ModerationDecision} from '@atproto/api'

import {getPostMedia, getRelatedMedia} from '#/lib/media/experiences'
import {type FeedPostSliceItem} from '#/state/queries/post-feed'

/**
 * Visionboard is a view/lens over AQUA content, not a separate database.
 * A VisionboardItem normalizes one image of an existing AQUA post for the
 * masonry renderer. The underlying object stays the AQUA post (`item`).
 */
export type VisionboardItem = {
  id: string
  uri: string
  cid: string
  imageIndex: number
  imageUrl: string
  thumbnailUrl: string
  width?: number
  height?: number
  altText: string
  title: string
  description: string
  creator: AppBskyFeedDefs.PostView['author']
  creatorAvatar?: string
  createdAt: string
  saved: boolean
  source: {
    type: 'social_post'
    uri: string
  }
  moderation: ModerationDecision
  item: FeedPostSliceItem
}

/**
 * Visual eligibility: an AQUA post belongs on the Visionboard when it carries
 * image media and survives list/media moderation (hidden, muted, blocked,
 * filtered labels). Text-only posts never qualify.
 */
export function isVisionboardEligible(item: FeedPostSliceItem): boolean {
  if (
    item.moderation.ui('contentList').filter ||
    item.moderation.ui('contentMedia').filter
  )
    return false
  const media = getPostMedia(item.post)
  return media.type === 'images' && media.view.images.length > 0
}

/**
 * AQUA content → Visionboard renderer input. Galleries flatten into one item
 * per image; provenance is preserved via `source`/`uri`/`imageIndex`.
 * Nothing is persisted — this is a pure projection of the existing objects.
 */
export function toVisionboardItems(
  candidates: FeedPostSliceItem[],
): VisionboardItem[] {
  const seen = new Set<string>()
  const items: VisionboardItem[] = []
  for (const item of candidates) {
    if (seen.has(item.uri) || !isVisionboardEligible(item)) continue
    seen.add(item.uri)
    const media = getPostMedia(item.post)
    if (media.type !== 'images') continue
    const record = item.record as AppBskyFeedPost.Record
    media.view.images.forEach((image, imageIndex) => {
      const imageUrl = image.fullsize ?? image.thumb
      if (!imageUrl) return
      items.push({
        id: `${item.uri}#${imageIndex}`,
        uri: item.post.uri,
        cid: item.post.cid,
        imageIndex,
        imageUrl,
        thumbnailUrl: image.thumb ?? imageUrl,
        width: image.aspectRatio?.width,
        height: image.aspectRatio?.height,
        altText: image.alt ?? '',
        title: record.text ?? '',
        description: record.text ?? '',
        creator: item.post.author,
        creatorAvatar: item.post.author.avatar,
        createdAt: record.createdAt ?? item.post.indexedAt,
        saved: Boolean(item.post.viewer?.bookmarked),
        source: {type: 'social_post', uri: item.post.uri},
        moderation: item.moderation,
        item,
      })
    })
  }
  return items
}

/**
 * Related images reuse the existing AQUA affinity ranking (shared hashtags,
 * same creator) over the current candidate pool — the donor project's
 * scikit-learn recommender stays a behavior reference only.
 */
export function getRelatedVisionboardItems(
  current: AppBskyFeedDefs.PostView,
  candidates: FeedPostSliceItem[],
): VisionboardItem[] {
  return toVisionboardItems(getRelatedMedia(current, candidates, 'images'))
}
