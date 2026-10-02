import {useCallback} from 'react'
import {type AppBskyFeedDefs} from '@atproto/api'

import {type Shadow} from '#/state/cache/types'
import {usePostLikeMutationQueue} from '#/state/queries/post'
import {useRequireAuth} from '#/state/session'
import {DROPS_FEED} from './useDropsFeed'

/** Real like/unlike of the drop's post, with the sign-in prompt for guests. */
export function useDropLike(post: Shadow<AppBskyFeedDefs.PostView>) {
  const requireAuth = useRequireAuth()
  const [queueLike, queueUnlike] = usePostLikeMutationQueue(
    post,
    undefined,
    DROPS_FEED,
    'ImmersiveVideo',
  )
  const liked = !!post.viewer?.like
  const toggle = useCallback(
    (force?: boolean) => {
      requireAuth(() => {
        if (force && liked) return
        const op = liked ? queueUnlike : queueLike
        op().catch(() => {})
      })
    },
    [requireAuth, liked, queueLike, queueUnlike],
  )
  return {liked, likeCount: post.likeCount ?? 0, toggle}
}
