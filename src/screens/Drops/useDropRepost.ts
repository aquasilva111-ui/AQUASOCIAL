import {useCallback} from 'react'
import {type AppBskyFeedDefs} from '@atproto/api'

import {type Shadow} from '#/state/cache/types'
import {usePostRepostMutationQueue} from '#/state/queries/post'
import {useRequireAuth} from '#/state/session'
import {DROPS_FEED} from './useDropsFeed'

/** Real repost/unrepost of the drop's post, with the sign-in prompt for guests. */
export function useDropRepost(post: Shadow<AppBskyFeedDefs.PostView>) {
  const requireAuth = useRequireAuth()
  const [queueRepost, queueUnrepost] = usePostRepostMutationQueue(
    post,
    undefined,
    DROPS_FEED,
    'ImmersiveVideo',
  )
  const reposted = !!post.viewer?.repost
  const toggle = useCallback(() => {
    requireAuth(() => {
      const op = reposted ? queueUnrepost : queueRepost
      op().catch(() => {})
    })
  }, [requireAuth, reposted, queueRepost, queueUnrepost])
  return {reposted, repostCount: post.repostCount ?? 0, toggle}
}
