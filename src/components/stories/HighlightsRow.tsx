import {useState} from 'react'
import {View} from 'react-native'
import {Image} from 'expo-image'
import {type AppBskyActorDefs} from '@atproto/api'

import {type HighlightView} from '#/lib/stories/model'
import {useHighlightsQuery} from '#/state/queries/highlights'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon} from '#/components/Button'
import {useDialogControl} from '#/components/Dialog'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {HighlightEditorDialog} from '#/components/stories/HighlightEditorDialog'
import {
  STRIP_SIZE as SIZE,
  StripLabelText,
} from '#/components/stories/StoriesRow'
import {StoryViewer} from '#/components/stories/StoryViewer'

/**
 * Permanent story albums ("destaques") under the profile's active stories.
 * Tap plays it; on your own profile a long-press edits it and a leading
 * "+" creates a new one.
 */
export function HighlightsItems({
  profile,
  isMe,
}: {
  profile: AppBskyActorDefs.ProfileViewDetailed
  isMe: boolean
}) {
  const t = useTheme()
  const {data: highlights} = useHighlightsQuery(profile.did)
  const editor = useDialogControl()
  const [editing, setEditing] = useState<HighlightView | undefined>()
  const [playing, setPlaying] = useState<HighlightView | undefined>()

  if (!isMe && !highlights?.length) return null

  return (
    <>
      {isMe && (
        <View style={[a.align_center, a.gap_xs, {width: SIZE + 8}]}>
          <Button
            label="Novo destaque"
            onPress={() => {
              setEditing(undefined)
              editor.open()
            }}
            style={[
              a.rounded_full,
              a.align_center,
              a.justify_center,
              a.border,
              {width: SIZE, height: SIZE, borderStyle: 'dashed'},
            ]}>
            <ButtonIcon icon={PlusIcon} />
          </Button>
          <StripLabelText>Destaque</StripLabelText>
        </View>
      )}
      {highlights?.map(h => (
        <Button
          key={h.uri}
          label={`Destaque ${h.title}`}
          onPress={() => setPlaying(h)}
          onLongPress={
            isMe
              ? () => {
                  setEditing(h)
                  editor.open()
                }
              : undefined
          }
          style={[a.align_center, a.gap_xs, {width: SIZE + 8}]}>
          <View
            style={[
              a.rounded_full,
              a.p_2xs,
              a.overflow_hidden,
              a.border,
              t.atoms.border_contrast_low,
              {width: SIZE, height: SIZE},
            ]}>
            <Image
              accessibilityIgnoresInvertColors
              accessibilityHint=""
              accessibilityLabel={h.title}
              source={{uri: h.coverUrl}}
              style={[a.flex_1, a.rounded_full]}
              contentFit="cover"
            />
          </View>
          <StripLabelText>{h.title}</StripLabelText>
        </Button>
      ))}
      {isMe && (
        <HighlightEditorDialog
          control={editor}
          did={profile.did}
          highlight={editing}
        />
      )}
      {playing && (
        <StoryViewer
          author={profile}
          stories={playing.items}
          initialIndex={0}
          isMe={isMe}
          allowDelete={false}
          onClose={() => setPlaying(undefined)}
        />
      )}
    </>
  )
}
