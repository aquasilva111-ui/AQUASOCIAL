import {useMemo} from 'react'
import {moderateProfile} from '@atproto/api'

import {getPostMedia, getVideoExperience} from '#/lib/media/experiences'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {usePostQuery} from '#/state/queries/post'
import {usePostFeedQuery} from '#/state/queries/post-feed'
import {useProfileQuery} from '#/state/queries/profile'
import {useLiveUsersQuery} from '#/state/queries/streamplace'
import {channelBlobUrl, useViewChannelQuery} from '#/state/queries/view-channel'
import {useSession} from '#/state/session'

/**
 * Everything a channel page needs, all from existing AQUA sources:
 * profile (identity/avatar/followers), the channel record, the profile's
 * own video posts (AQUA content), Streamplace live status and AQUA
 * moderation. Nothing is duplicated into a channel store.
 */
export function useChannelData(handleOrDid: string | undefined) {
  const {currentAccount} = useSession()
  const moderationOpts = useModerationOpts()
  const profile = useProfileQuery({did: handleOrDid})
  const did = profile.data?.did
  const channelQ = useViewChannelQuery(did)
  const feed = usePostFeedQuery(`author|${did}|posts_with_media`, undefined, {
    enabled: !!did,
  })
  const liveQ = useLiveUsersQuery({enabled: !!did})
  const channel = channelQ.data?.channel
  const trailer = usePostQuery(channel?.trailerUri)
  const featured = usePostQuery(channel?.featuredUri)

  const {videos, drops} = useMemo(() => {
    const items =
      feed.data?.pages.flatMap(page =>
        page.slices.flatMap(slice => slice.items),
      ) ?? []
    const seen = new Set<string>()
    const v: typeof items = []
    const d: typeof items = []
    for (const item of items) {
      // Only the channel's own uploads (no reposts), not hidden by moderation.
      if (item.post.author.did !== did || seen.has(item.uri)) continue
      if (
        item.moderation.ui('contentList').filter ||
        item.moderation.ui('contentMedia').filter
      )
        continue
      const media = getPostMedia(item.post)
      if (media.type !== 'video') continue
      seen.add(item.uri)
      if (getVideoExperience({aspectRatio: media.view.aspectRatio}) === 'drops')
        d.push(item)
      else v.push(item)
    }
    return {videos: v, drops: d}
  }, [feed.data, did])

  const moderated = useMemo(() => {
    if (!profile.data || !moderationOpts) return false
    const labels = profile.data.labels ?? []
    return (
      labels.some(l => l.val === '!takedown' || l.val === '!suspend') ||
      moderateProfile(profile.data, moderationOpts).ui('profileView').filter
    )
  }, [profile.data, moderationOpts])

  const pdsUrl = channelQ.data?.pdsUrl
  return {
    profile,
    did,
    isOwner: !!did && did === currentAccount?.did,
    channelQuery: channelQ,
    channel,
    pdsUrl,
    bannerUrl: did ? channelBlobUrl(pdsUrl, did, channel?.banner) : undefined,
    watermarkUrl: did
      ? channelBlobUrl(pdsUrl, did, channel?.watermark)
      : undefined,
    videos,
    drops,
    feed,
    live: liveQ.data?.find(s => s.author.did === did),
    trailer: trailer.data,
    featured: featured.data,
    moderated,
  }
}
