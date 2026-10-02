import {useCallback, useEffect, useMemo, useRef} from 'react'
import {AppBskyEmbedVideo, AppBskyFeedPost} from '@atproto/api'

import {VIDEO_FEED_URI} from '#/lib/constants'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {usePostFeedQuery} from '#/state/queries/post-feed'
import {type Drop} from './data'

export const DROPS_FEED = `feedgen|${VIDEO_FEED_URI}` as const

/** Fewer than this many drops makes the feed fetch another page on its own. */
const MIN_BUFFER = 6

/**
 * The short vertical videos of the platform: the video feed, filtered to
 * video posts that are vertical (or have no known ratio) and pass moderation.
 */
export function useDropsFeed() {
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = usePostFeedQuery(DROPS_FEED)

  const drops = useMemo(() => {
    const seen = new Set<string>()
    const out: Drop[] = []
    for (const page of data?.pages ?? []) {
      for (const slice of page.slices) {
        const item = slice.items.find(i => i.uri === slice.feedPostUri)
        if (!item || seen.has(item.uri)) continue
        const embed = item.post.embed
        if (!AppBskyEmbedVideo.isView(embed)) continue
        if (
          item.moderation.ui('contentList').filter ||
          item.moderation.ui('contentMedia').filter
        )
          continue
        const ratio = embed.aspectRatio
        if (ratio && ratio.height < ratio.width) continue
        seen.add(item.uri)
        out.push({
          id: item.uri,
          playlist: embed.playlist,
          poster: embed.thumbnail,
          authorHandle: sanitizeHandle(item.post.author.handle),
          authorName: sanitizeDisplayName(
            item.post.author.displayName || item.post.author.handle,
          ),
          caption: AppBskyFeedPost.isRecord(item.post.record)
            ? item.post.record.text
            : '',
          post: item.post,
        })
      }
    }
    return out
  }, [data])

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage])

  // The feed mixes in non-video posts, so a page can yield very few drops.
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
