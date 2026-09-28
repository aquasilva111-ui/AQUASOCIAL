import {useState} from 'react'
import {ScrollView, View} from 'react-native'
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

const RING_SIZE = 60

/**
 * Row of story circles for one profile, shown under the bio. Each circle
 * is one of the person's own active (< 24h old) stories; tapping one
 * opens the full-screen viewer starting there. On your own profile, a
 * leading "+" circle lets you add a new one.
 */
export function StoriesRow({
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[a.gap_md, a.pb_xs]}>
        {isMe && (
          <View style={[a.align_center, {width: RING_SIZE}]}>
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
      </ScrollView>

      {viewerIndex !== null && stories && stories[viewerIndex] && (
        <StoryViewer
          author={profile}
          stories={stories}
          initialIndex={viewerIndex}
          isMe={isMe}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </>
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
    <Button label="Ver story" onPress={onPress} style={[a.align_center]}>
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
    </Button>
  )
}
