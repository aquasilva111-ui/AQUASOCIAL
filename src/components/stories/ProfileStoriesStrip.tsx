import {ScrollView} from 'react-native'
import {type AppBskyActorDefs} from '@atproto/api'

import {useHighlightsQuery} from '#/state/queries/highlights'
import {useStoriesQuery} from '#/state/queries/stories'
import {atoms as a} from '#/alf'
import {HighlightsItems} from '#/components/stories/HighlightsRow'
import {StoriesItems} from '#/components/stories/StoriesRow'

/**
 * One horizontal strip under the bio: the person's active stories first,
 * then their highlights, all the same size and labelled. Hidden on other
 * people's profiles when they have neither.
 */
export function ProfileStoriesStrip({
  profile,
  isMe,
}: {
  profile: AppBskyActorDefs.ProfileViewDetailed
  isMe: boolean
}) {
  const {data: stories} = useStoriesQuery(profile.did)
  const {data: highlights} = useHighlightsQuery(profile.did)
  if (!isMe && !stories?.length && !highlights?.length) return null
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[a.gap_md, a.pb_xs, a.align_start]}>
      <StoriesItems profile={profile} isMe={isMe} />
      <HighlightsItems profile={profile} isMe={isMe} />
    </ScrollView>
  )
}
