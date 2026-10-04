import {useCallback, useEffect, useMemo, useRef} from 'react'
import {AppBskyEmbedVideo, AppBskyFeedPost} from '@atproto/api'

import {VIDEO_FEED_URI} from '#/lib/constants'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {
  type FeedPostSliceItem,
  usePostFeedQuery,
} from '#/state/queries/post-feed'
import {useSession} from '#/state/session'
import * as bsky from '#/types/bsky'
import {type Drop} from './data'

export const DROPS_FEED = `feedgen|${VIDEO_FEED_URI}` as const

/** Fewer than this many drops makes the feed fetch another page on its own. */
const MIN_BUFFER = 6

/**
 * A drop candidate: a video post that is vertical (or has no known ratio)
 * and passes moderation.
 */
function toDrop(item: FeedPostSliceItem): Drop | null {
  const embed = item.post.embed
  if (!AppBskyEmbedVideo.isView(embed)) return null
  if (
    item.moderation.ui('contentList').filter ||
    item.moderation.ui('contentMedia').filter
  )
    return null
  const ratio = embed.aspectRatio
  if (ratio && ratio.height < ratio.width) return null
  return {
    id: item.uri,
    playlist: embed.playlist,
    poster: embed.thumbnail,
    authorHandle: sanitizeHandle(item.post.author.handle),
    authorName: sanitizeDisplayName(
      item.post.author.displayName || item.post.author.handle,
    ),
    caption: bsky.dangerousIsType<AppBskyFeedPost.Record>(
      item.post.record,
      AppBskyFeedPost.isRecord,
    )
      ? item.post.record.text
      : '',
    post: item.post,
  }
}

/**
 * The short vertical videos of the platform: uploads from the people you
 * follow first, then the network-wide video feed, so fresh uploads play in
 * Drops even before the feed generator indexes them.
 */
export function useDropsFeed() {
  const {hasSession} = useSession()
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = usePostFeedQuery(DROPS_FEED)
  const {
    data: followingData,
    hasNextPage: followingHasNextPage,
    isFetchingNextPage: followingIsFetching,
    fetchNextPage: fetchFollowing,
  } = usePostFeedQuery('following', undefined, {enabled: hasSession})

  const drops = useMemo(() => {
    const seen = new Set<string>()
    const out: Drop[] = []
    for (const page of followingData?.pages ?? []) {
      for (const slice of page.slices) {
        const item = slice.items.find(i => i.uri === slice.feedPostUri)
        if (!item || seen.has(item.uri)) continue
        const drop = toDrop(item)
        if (!drop) continue
        seen.add(item.uri)
        out.push(drop)
      }
    }
    for (const page of data?.pages ?? []) {
      for (const slice of page.slices) {
        const item = slice.items.find(i => i.uri === slice.feedPostUri)
        if (!item || seen.has(item.uri)) continue
        const drop = toDrop(item)
        if (!drop) continue
        seen.add(item.uri)
        out.push(drop)
      }
    }
    return out
  }, [data, followingData])

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) {
      fetchNextPage()
    } else if (followingHasNextPage && !followingIsFetching) {
      fetchFollowing()
    }
  }, [
    hasNextPage,
    isFetchingNextPage,
    isError,
    fetchNextPage,
    followingHasNextPage,
    followingIsFetching,
    fetchFollowing,
  ])

  // The feeds mix in non-video posts, so a page can yield very few drops.
  const emptyScans = useRef(0)
  useEffect(() => {
    if (
      drops.length < MIN_BUFFER &&
      hasNextPage &&
      !isFetchingNextPage &&
      !isError &&
      emptyScans.current < 5
    ) {
      emptyScans.current++
      fetchNextPage()
    }
  }, [drops.length, hasNextPage, isFetchingNextPage, isError, fetchNextPage])

  return {drops, isLoading, isError, loadMore, refetch}
}
