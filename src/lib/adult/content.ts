import {
  type AppBskyFeedDefs,
  type AppBskyFeedPost,
  ComAtprotoLabelDefs,
} from '@atproto/api'

import {
  type AccessControlledResource,
  type AccessPolicy,
} from '#/lib/adult/entitlements'
import {getPostMedia} from '#/lib/media/experiences'
import {type FeedPostSliceItem} from '#/state/queries/post-feed'

/** AT Protocol self-labels that mark adult content. */
const ADULT_SELF_LABELS = new Set(['porn', 'sexual', 'nudity', 'graphic-media'])

export type AdultPostVisibility =
  | 'public_adult'
  | 'followers'
  | 'subscribers'
  | 'tier'
  | 'ppv'
  | 'private'

/**
 * An AQUA post seen through the adult lens. Same underlying object — this is
 * a projection, never a copy. What it deliberately omits from the network
 * object: anything financial and any engagement identity.
 */
export type AdultPost = {
  id: string
  uri: string
  cid: string
  creatorId: string
  creator: AppBskyFeedDefs.PostView['author']
  createdAt: string
  visibility: AdultPostVisibility
  accessPolicy: AccessPolicy
  text: string
  tags: string[]
  contentRating?: string
  commentsEnabled: boolean
  likeCount: number
  commentCount: number
  moderation: FeedPostSliceItem['moderation']
  item: FeedPostSliceItem
}

function getSelfLabels(record: AppBskyFeedPost.Record): string[] {
  const labels = record.labels
  if (!labels || !ComAtprotoLabelDefs.isSelfLabels(labels)) return []
  return labels.values.map(v => v.val)
}

/**
 * Eligibility for the +18 feed: the post self-identifies as adult content
 * and is not filtered by moderation (blocks, mutes, tombstones, disabled
 * adult-content prefs all still apply inside the adult environment).
 */
export function isAdultContent(item: FeedPostSliceItem): boolean {
  if (
    item.moderation.ui('contentList').filter ||
    item.moderation.ui('contentMedia').filter
  )
    return false
  if (!item.record || item.record.$type !== 'app.bsky.feed.post') return false
  return getSelfLabels(item.record as AppBskyFeedPost.Record).some(label =>
    ADULT_SELF_LABELS.has(label),
  )
}

/**
 * Access policy of the underlying object. Native AT posts are public, so
 * they map to `free` — gated policies (subscriber/tier/ppv) arrive with the
 * AQUA media lexicons and are read here, never inferred by components.
 */
export function getAdultAccessPolicy(_record: AppBskyFeedPost.Record): {
  policy: AccessPolicy
  visibility: AdultPostVisibility
} {
  return {policy: 'free', visibility: 'public_adult'}
}

export function toAdultPost(item: FeedPostSliceItem): AdultPost | null {
  if (!isAdultContent(item)) return null
  const record = item.record as AppBskyFeedPost.Record
  const {policy, visibility} = getAdultAccessPolicy(record)
  const rating = getSelfLabels(record).find(label =>
    ADULT_SELF_LABELS.has(label),
  )
  return {
    id: item.uri,
    uri: item.post.uri,
    cid: item.post.cid,
    creatorId: item.post.author.did,
    creator: item.post.author,
    createdAt: record.createdAt ?? item.post.indexedAt,
    visibility,
    accessPolicy: policy,
    text: record.text ?? '',
    tags: record.tags ?? [],
    contentRating: rating,
    commentsEnabled: true,
    likeCount: item.post.likeCount ?? 0,
    commentCount: item.post.replyCount ?? 0,
    moderation: item.moderation,
    item,
  }
}

export function toAdultPosts(candidates: FeedPostSliceItem[]): AdultPost[] {
  const seen = new Set<string>()
  const posts: AdultPost[] = []
  for (const item of candidates) {
    if (seen.has(item.uri)) continue
    seen.add(item.uri)
    const post = toAdultPost(item)
    if (post) posts.push(post)
  }
  return posts
}

/**
 * The resource descriptor the Entitlements engine evaluates. Contains the
 * policy and integrity flags — never the media payload.
 */
export function toAccessControlledResource(
  post: AdultPost,
): AccessControlledResource {
  return {
    id: post.uri,
    type: 'post',
    creatorId: post.creatorId,
    policy: post.accessPolicy,
  }
}

/**
 * Media authorization split. The full assets are returned ONLY when the
 * entitlement decision allows them; otherwise the caller receives whatever
 * the creator authorized as preview — for native public posts both are the
 * same, for gated content the protected payload is never present here.
 */
export function getAuthorizedMedia(
  post: AdultPost,
  allowed: boolean,
): {
  preview: AppBskyFeedDefs.PostView['embed']
  protectedMedia: AppBskyFeedDefs.PostView['embed'] | undefined
} {
  if (!allowed) {
    return {preview: undefined, protectedMedia: undefined}
  }
  return {preview: post.item.post.embed, protectedMedia: post.item.post.embed}
}

export {getPostMedia}
