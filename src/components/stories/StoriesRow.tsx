import {useState} from 'react'
import {View} from 'react-native'
import {Image} from 'expo-image'
import {type AppBskyActorDefs} from '@atproto/api'

import {openPicker} from '#/lib/media/picker.shared'
import {useIsStorySeen} from '#/lib/stories-seen'
import {logger} from '#/logger'
import {useCreateStoryMutation, useStoriesQuery} from '#/state/queries/stories'
import * as Toast from '#/view/com/util/Toast'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon} from '#/components/Button'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {Loader} from '#/components/Loader'
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
  const {mutateAsync: createStory, isPending: isUploading} =
    useCreateStoryMutation()
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  if (!isMe && !stories?.length) return null

  const onPressAdd = async () => {
    try {
      const [image] = await openPicker({selectionLimit: 1})
      if (!image) return
      await createStory(image)
      Toast.show('Story publicado')
    } catch (e: any) {
      logger.error('Failed to create story', {message: String(e)})
      Toast.show('Não foi possível publicar o story', 'error')
    }
  }

  return (
    <>
      {isMe && (
        <View style={[a.align_center, a.gap_xs, {width: RING_SIZE + 8}]}>
          <Button
            label="Adicionar story"
            onPress={onPressAdd}
            disabled={isUploading}
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
            <ButtonIcon icon={isUploading ? Loader : PlusIcon} />
          </Button>
          <StripLabelText>Story</StripLabelText>
        </View>
      )}
      {stories?.map((story, i) => (
        <StoryCircle
          key={story.uri}
          uri={story.mediaUrl}
          storyUri={story.uri}
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
  uri,
  storyUri,
  onPress,
}: {
  uri: string
  storyUri: string
  onPress: () => void
}) {
  const t = useTheme()
  const seen = useIsStorySeen(storyUri)

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
        <Image
          accessibilityIgnoresInvertColors
          accessibilityHint="Abre o story"
          source={{uri}}
          style={[a.flex_1, a.rounded_full]}
          contentFit="cover"
          accessibilityLabel="Story"
        />
      </View>
      <StripLabelText>{seen ? 'Visto' : 'Novo'}</StripLabelText>
    </Button>
  )
}
