import {useEffect, useState} from 'react'
import {Modal, Pressable, View} from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import {Image} from 'expo-image'
import {type AppBskyActorDefs} from '@atproto/api'

import {markStorySeen} from '#/lib/stories-seen'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {type StoryView, useDeleteStoryMutation} from '#/state/queries/stories'
import {TimeElapsed} from '#/view/com/util/TimeElapsed'
import * as Toast from '#/view/com/util/Toast'
import {PreviewableUserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a} from '#/alf'
import {Button, ButtonIcon} from '#/components/Button'
import {TimesLarge_Stroke2_Corner0_Rounded as CloseIcon} from '#/components/icons/Times'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import {Text} from '#/components/Typography'

const STORY_DURATION_MS = 5000

export function StoryViewer({
  author,
  stories,
  initialIndex,
  isMe,
  allowDelete = isMe,
  onClose,
}: {
  author:
    | AppBskyActorDefs.ProfileViewBasic
    | AppBskyActorDefs.ProfileViewDetailed
  stories: StoryView[]
  initialIndex: number
  isMe: boolean
  /** Hide the trash button (e.g. when playing a highlight). */
  allowDelete?: boolean
  onClose: () => void
}) {
  const [index, setIndex] = useState(initialIndex)
  const [paused, setPaused] = useState(false)
  const progress = useSharedValue(0)
  const {mutate: deleteStory} = useDeleteStoryMutation()
  const current = stories[index]

  useEffect(() => {
    if (current) markStorySeen(current.uri)
  }, [current])

  useEffect(() => {
    if (!current || paused) return
    progress.set(0)
    progress.set(
      withTiming(1, {duration: STORY_DURATION_MS, easing: Easing.linear}),
    )
    const timer = setTimeout(() => {
      goNext()
    }, STORY_DURATION_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, paused, current])

  function goNext() {
    if (index >= stories.length - 1) {
      onClose()
      return
    }
    setIndex(i => i + 1)
  }

  function goPrev() {
    if (index <= 0) {
      onClose()
      return
    }
    setIndex(i => i - 1)
  }

  if (!current) return null

  return (
    <Modal
      visible
      animationType="fade"
      transparent={false}
      onRequestClose={onClose}>
      <View style={[a.flex_1, {backgroundColor: '#000'}]}>
        <Image
          key={current.uri}
          accessibilityIgnoresInvertColors
          accessibilityHint="Conteúdo do story"
          source={{uri: current.mediaUrl}}
          style={[a.absolute, a.inset_0]}
          contentFit="contain"
          accessibilityLabel="Story"
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Story anterior"
          accessibilityHint=""
          onPress={goPrev}
          onPressIn={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
          style={[a.absolute, a.inset_0, {right: '35%'}]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Próximo story"
          accessibilityHint=""
          onPress={goNext}
          onPressIn={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
          style={[a.absolute, a.inset_0, {left: '35%'}]}
        />

        <View
          style={[
            a.absolute,
            a.w_full,
            a.flex_row,
            a.gap_2xs,
            {top: 10, paddingHorizontal: 8},
          ]}>
          {stories.map((s, i) => (
            <ProgressSegment
              key={s.uri}
              progress={i === index ? progress : undefined}
              filled={i < index}
            />
          ))}
        </View>

        <View
          style={[
            a.absolute,
            a.w_full,
            a.flex_row,
            a.align_center,
            a.gap_sm,
            {top: 24, paddingHorizontal: 12},
          ]}>
          <PreviewableUserAvatar size={32} profile={author} />
          <View style={[a.flex_1, {minWidth: 0}]}>
            <Text
              numberOfLines={1}
              style={[a.text_sm, a.font_bold, {color: '#fff'}]}>
              {sanitizeDisplayName(
                author.displayName || sanitizeHandle(author.handle),
              )}
            </Text>
            <TimeElapsed timestamp={current.createdAt}>
              {({timeElapsed}) => (
                <Text style={[a.text_xs, {color: 'rgba(255,255,255,0.7)'}]}>
                  {timeElapsed}
                </Text>
              )}
            </TimeElapsed>
          </View>
          {allowDelete && (
            <Button
              label="Excluir story"
              size="small"
              variant="ghost"
              color="secondary"
              onPress={() => {
                deleteStory(current.rkey)
                Toast.show('Story excluído')
                if (stories.length <= 1) onClose()
                else goNext()
              }}>
              <ButtonIcon icon={TrashIcon} />
            </Button>
          )}
          <Button
            label="Fechar"
            size="small"
            variant="ghost"
            color="secondary"
            onPress={onClose}>
            <ButtonIcon icon={CloseIcon} />
          </Button>
        </View>
      </View>
    </Modal>
  )
}

function ProgressSegment({
  progress,
  filled,
}: {
  progress: ReturnType<typeof useSharedValue<number>> | undefined
  filled: boolean
}) {
  const style = useAnimatedStyle(() => ({
    width: `${(progress ? progress.get() : filled ? 1 : 0) * 100}%`,
  }))
  return (
    <View
      style={[
        a.flex_1,
        a.rounded_full,
        a.overflow_hidden,
        {height: 2.5, backgroundColor: 'rgba(255,255,255,0.35)'},
      ]}>
      <Animated.View
        style={[{height: '100%', backgroundColor: '#fff'}, style]}
      />
    </View>
  )
}
