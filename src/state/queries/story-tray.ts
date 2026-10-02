import {useMemo} from 'react'
import {type AppBskyActorDefs, moderateProfile} from '@atproto/api'
import {useQueries, useQueryClient} from '@tanstack/react-query'

import {type StoryView} from '#/lib/stories/model'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {useProfileQuery} from '#/state/queries/profile'
import {useProfileFollowsQuery} from '#/state/queries/profile-follows'
import {fetchStories, RQKEY} from '#/state/queries/stories'
import {useAgent, useSession} from '#/state/session'

export type StoryAuthor =
  | AppBskyActorDefs.ProfileViewBasic
  | AppBskyActorDefs.ProfileViewDetailed

export type StoryGroup = {
  author: StoryAuthor
  isMe: boolean
  stories: StoryView[]
  uris: string[]
  latestAt: string
}

/** How many followed accounts are checked for stories (no indexer: one
 * listRecords per account, so this is capped). */
export const TRAY_LIMIT = 30

/**
 * People you follow who have an active story, plus your own. Muted,
 * blocked and moderation-filtered accounts never show up.
 */
export function useStoryTray() {
  const agent = useAgent()
  const queryClient = useQueryClient()
  const {currentAccount} = useSession()
  const moderationOpts = useModerationOpts()
  const me = useProfileQuery({did: currentAccount?.did})
  const follows = useProfileFollowsQuery(currentAccount?.did, {
    limit: TRAY_LIMIT,
  })

  const people = useMemo(() => {
    const list = (follows.data?.pages[0]?.follows ?? [])
      .slice(0, TRAY_LIMIT)
      .filter(p => {
        if (p.viewer?.muted || p.viewer?.blockedBy || p.viewer?.blocking) {
          return false
        }
        if (!moderationOpts) return true
        return !moderateProfile(p, moderationOpts).ui('profileList').filter
      })
    return list as StoryAuthor[]
  }, [follows.data, moderationOpts])

  const dids = useMemo(
    () => [
      ...(currentAccount ? [currentAccount.did] : []),
      ...people.map(p => p.did),
    ],
    [currentAccount, people],
  )

  const results = useQueries({
    queries: dids.map(did => ({
      queryKey: RQKEY(did, false),
      staleTime: 60_000,
      queryFn: () => fetchStories(agent, queryClient, did, false),
    })),
  })

  // Cheap to derive, and `results` is a new array every render anyway.
  const groups: StoryGroup[] = []
  dids.forEach((did, i) => {
    const stories = results[i]?.data ?? []
    const isMe = did === currentAccount?.did
    const author: StoryAuthor | undefined = isMe
      ? me.data
      : people.find(p => p.did === did)
    if (!author || (!stories.length && !isMe)) return
    groups.push({
      author,
      isMe,
      stories,
      uris: stories.map(s => s.uri),
      latestAt: stories[stories.length - 1]?.createdAt ?? '',
    })
  })

  return {groups, isLoading: follows.isLoading}
}
