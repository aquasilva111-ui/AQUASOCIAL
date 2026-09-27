import {type AppBskyFeedDefs, AppBskyFeedPost} from '@atproto/api'

import {type FeedPostSliceItem} from '#/state/queries/post-feed'
import * as bsky from '#/types/bsky'
import {parseEmbed} from '#/types/bsky/post'

export type MediaExperience = 'images' | 'video'
export type VideoExperience = 'drops' | 'video' | 'both'
export type VideoMetadata = {
  creatorMode?: 'drop' | 'video' | 'auto'
  durationSeconds?: number
  aspectRatio?: {width: number; height: number}
}
export const VIDEO_POLICY = {shortMaxSeconds: 90, longMinSeconds: 180}

// Unknown duration remains eligible for both; orientation alone is not intent.
export function getVideoExperience(
  meta: VideoMetadata,
  policy = VIDEO_POLICY,
): VideoExperience {
  if (meta.creatorMode === 'video') return 'video'
  if (meta.creatorMode === 'drop') return 'drops'
  const duration = meta.durationSeconds
  if (duration === undefined || !Number.isFinite(duration) || duration <= 0)
    return 'both'
  if (duration >= policy.longMinSeconds) return 'video'
  if (
    duration <= policy.shortMaxSeconds &&
    meta.aspectRatio &&
    meta.aspectRatio.height > meta.aspectRatio.width
  )
    return 'drops'
  return 'both'
}

export function getPostMedia(post: AppBskyFeedDefs.PostView) {
  const embed = parseEmbed(post.embed)
  return embed.type === 'post_with_media' ? embed.media : embed
}

export function isMediaPost(item: FeedPostSliceItem, mode: MediaExperience) {
  if (
    item.moderation.ui('contentList').filter ||
    item.moderation.ui('contentMedia').filter
  )
    return false
  const media = getPostMedia(item.post)
  if (mode === 'images')
    return media.type === 'images' && media.view.images.length > 0
  return (
    media.type === 'video' &&
    getVideoExperience({aspectRatio: media.view.aspectRatio}) !== 'drops'
  )
}

export function getPostTopics(post: AppBskyFeedDefs.PostView): string[] {
  if (
    !bsky.dangerousIsType<AppBskyFeedPost.Record>(
      post.record,
      AppBskyFeedPost.isRecord,
    )
  )
    return []
  const tags = [...(post.record.tags ?? [])]
  for (const facet of post.record.facets ?? []) {
    for (const feature of facet.features) {
      if (
        feature.$type === 'app.bsky.richtext.facet#tag' &&
        'tag' in feature &&
        typeof feature.tag === 'string'
      )
        tags.push(feature.tag)
    }
  }
  return Array.from(new Set(tags.map(tag => tag.toLocaleLowerCase())))
}

// Candidate order is the existing feed ranking. Only related results add affinity.
export function getRelatedMedia(
  current: AppBskyFeedDefs.PostView,
  candidates: FeedPostSliceItem[],
  mode: MediaExperience,
) {
  const tags = new Set(getPostTopics(current))
  const seen = new Set([current.uri])
  return candidates
    .filter(item => {
      if (seen.has(item.uri) || !isMediaPost(item, mode)) return false
      seen.add(item.uri)
      return true
    })
    .map((item, index) => ({
      item,
      index,
      score:
        getPostTopics(item.post).filter(tag => tags.has(tag)).length * 2 +
        Number(item.post.author.did === current.author.did),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({item}) => item)
}

// Collections reference canonical content, irrespective of media type. Persistence
// is intentionally owned by a future shared relationship service, not this UI.
export interface ContentCollection {
  uri: string
  ownerDid: string
  name: string
  subjects: {uri: string; cid: string}[]
}
