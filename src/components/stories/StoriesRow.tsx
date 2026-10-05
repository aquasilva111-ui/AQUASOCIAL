import {useState} from 'react'
import {View} from 'react-native'
import {useNavigation} from '@react-navigation/native'
import {type AppBskyActorDefs} from '@atproto/api'

import {useIsStorySeen} from '#/lib/stories-seen'
import {type NavigationProp} from '#/lib/routes/types'
import {type StoryView} from '#/lib/stories/model'
import {useStoriesQuery} from '#/state/queries/stories'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon} from '#/components/Button'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {StoryPreview} from '#/components/stories/StoryFrame'
import {StoryViewer} from '#/components/stories/StoryViewer'
import {Text} from '#/components/Typography'

export const STRIP_SIZE = 64
const RING_SIZE = STRIP_SIZE

/**
 * Row of story circles for one profile, shown under the bio. Each circle
 * is one of the person's own active (< 24h old) stories; tapping one
 * opens the full-screen viewer starting there. On your own profile, a
 * leading "+" circle lets you add a new one.
 */
export function StoriesItems({
  profile,
  isMe,
}: {
  profile: AppBskyActorDefs.ProfileViewDetailed
  isMe: boolean
}) {
  const {data: stories} = useStoriesQuery(profile.did)
  const navigation = useNavigation<NavigationProp>()
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  if (!isMe && !stories?.length) return null

  return (
    <>
      {isMe && (
        <View style={[a.align_center, a.gap_xs, {width: RING_SIZE + 8}]}>
          <Button
            label="Adicionar story"
            onPress={() => navigation.navigate('StoryCreate')}
            style={[
              a.rounded_full,
              a.align_center,
              a.justify_center,
              a.border,
              {
                width: RING_SIZE,
                height: RING_SIZE,
                borderStyle: 'dashed',
              },
            ]}>
            <ButtonIcon icon={PlusIcon} />
          </Button>
          <StripLabelText>Story</StripLabelText>
        </View>
      )}
      {stories?.map((story, i) => (
        <StoryCircle
          key={story.uri}
          story={story}
          onPress={() => setViewerIndex(i)}
        />
      ))}

      {viewerIndex !== null && stories && stories[viewerIndex] && (
        <StoryViewer
          groups={[{author: profile, stories, isMe}]}
          initial={{group: 0, index: viewerIndex}}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </>
  )
}

export function StripLabelText({children}: {children: string}) {
  const t = useTheme()
  return (
    <Text
      numberOfLines={1}
      style={[
        a.text_xs,
        t.atoms.text_contrast_medium,
        {maxWidth: RING_SIZE + 8},
      ]}>
      {children}
    </Text>
  )
}

function StoryCircle({
  story,
  onPress,
}: {
  story: StoryView
  onPress: () => void
}) {
  const t = useTheme()
  const seen = useIsStorySeen(story.uri)

  return (
    <Button
      label="Ver story"
      onPress={onPress}
      style={[a.align_center, a.gap_xs, {width: RING_SIZE + 8}]}>
      <View
        style={[
          a.rounded_full,
          a.p_2xs,
          a.overflow_hidden,
          {
            width: RING_SIZE,
            height: RING_SIZE,
            borderWidth: 2,
            borderColor: seen
              ? t.atoms.border_contrast_low.borderColor
              : '#7C3AED',
          },
        ]}>
        <View style={[a.flex_1, a.rounded_full, a.overflow_hidden]}>
          <StoryPreview story={story} />
        </View>
      </View>
      <StripLabelText>{seen ? 'Visto' : 'Novo'}</StripLabelText>
    </Button>
  )
}
