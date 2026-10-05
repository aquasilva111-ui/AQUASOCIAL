import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
  AppState,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import {Image} from 'expo-image'

import {type StoryView} from '#/lib/stories/model'
import {
  HOLD_MS,
  REACTIONS,
  REPLY_MAX,
  resolveTap,
  stepPosition,
  STORY_DURATION_MS,
  type StoryPos,
} from '#/lib/stories/player'
import {markStorySeen} from '#/lib/stories-seen'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {logger} from '#/logger'
import {useDeleteStoryMutation} from '#/state/queries/stories'
import {useSendStoryReply} from '#/state/queries/story-reply'
import {type StoryAuthor} from '#/state/queries/story-tray'
import {TimeElapsed} from '#/view/com/util/TimeElapsed'
import * as Toast from '#/view/com/util/Toast'
import {PreviewableUserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {TimesLarge_Stroke2_Corner0_Rounded as CloseIcon} from '#/components/icons/Times'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import {frameSize, StoryFrame} from '#/components/stories/StoryFrame'
import {Text} from '#/components/Typography'

export type ViewerGroup = {
  author: StoryAuthor
  stories: StoryView[]
  isMe: boolean
}

/**
 * Full-screen story player over one or more people's stories. Behaviour
 * (patterns from react-native-story-view and deebov/stories, both MIT):
 * - progress starts only once the image has loaded;
 * - holding pauses and hides the chrome, and resuming continues from the
 *   same point; a hold never counts as a tap;
 * - tap right/left for next/previous, running on into the next person;
 * - swipe down (or Esc) to close; arrows/space on web;
 * - pauses when the app is backgrounded or while typing a reply;
 * - the next image is prefetched.
 */
export function StoryViewer({
  groups,
  initial = {group: 0, index: 0},
  allowDelete,
  allowReply = true,
  onClose,
}: {
  groups: ViewerGroup[]
  initial?: StoryPos
  /** Defaults to "the viewer is the author" (per group). */
  allowDelete?: boolean
  allowReply?: boolean
  onClose: () => void
}) {
  const {width, height} = useWindowDimensions()
  const frame = frameSize(width, height)
  const [removed, setRemoved] = useState<Set<string>>(() => new Set())
  const [pos, setPos] = useState<StoryPos>(initial)
  const [loadedUri, setLoadedUri] = useState<string>()
  const [failedUri, setFailedUri] = useState<string>()
  const [holding, setHolding] = useState(false)
  const [background, setBackground] = useState(false)
  const [replying, setReplying] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const progress = useSharedValue(0)
  const translateY = useSharedValue(0)
  const {mutate: deleteStory} = useDeleteStoryMutation()

  const visible = useMemo(
    () =>
      groups.map(g => ({
        ...g,
        stories: g.stories.filter(s => !removed.has(s.uri)),
      })),
    [groups, removed],
  )
  const sizes = useMemo(() => visible.map(g => g.stories.length), [visible])
  const group = visible[pos.group]
  const current = group?.stories[pos.index]

  // Text-only stories have nothing to wait for.
  const loaded = !!current && (!current.mediaUrl || loadedUri === current.uri)
  const failed = !!current && !!current.mediaUrl && failedUri === current.uri
  const paused = holding || background || replying || confirmDelete || failed

  const move = useCallback(
    (dir: 1 | -1) => {
      setConfirmDelete(false)
      const next = stepPosition(sizes, pos, dir)
      if (next === 'close') onClose()
      else setPos(next)
    },
    [sizes, pos, onClose],
  )
  const moveRef = useRef(move)
  useEffect(() => {
    moveRef.current = move
  }, [move])
  const finished = useCallback(() => moveRef.current(1), [])

  // The story under the cursor is gone (deleted): move on, or close.
  useEffect(() => {
    if (current) return
    const from = {
      group: pos.group,
      index: Math.min(pos.index, sizes[pos.group] ?? 0) - 1,
    }
    const next = stepPosition(sizes, from, 1)
    if (next === 'close') onClose()
    else setPos(next)
  }, [current, sizes, pos, onClose])

  // Reset the bar whenever the story changes.
  useEffect(() => {
    progress.set(0)
  }, [pos.group, pos.index, progress])

  // Run/pause the bar. Resuming continues from the current fill.
  useEffect(() => {
    if (!current || paused || !loaded) {
      cancelAnimation(progress)
      return
    }
    const remaining = Math.max(0, (1 - progress.get()) * STORY_DURATION_MS)
    progress.set(
      withTiming(
        1,
        {duration: remaining, easing: Easing.linear},
        isFinished => {
          if (isFinished) runOnJS(finished)()
        },
      ),
    )
    return () => cancelAnimation(progress)
  }, [current, paused, loaded, progress, finished])

  useEffect(() => {
    if (current && loaded) markStorySeen(current.uri)
  }, [current, loaded])

  // Prefetch the next story's image.
  useEffect(() => {
    const next = stepPosition(sizes, pos, 1)
    if (next === 'close') return
    const url = visible[next.group]?.stories[next.index]?.mediaUrl
    if (url) Image.prefetch(url).catch(() => {})
  }, [sizes, pos, visible])

  useEffect(() => {
    const sub = AppState.addEventListener('change', s =>
      setBackground(s !== 'active'),
    )
    return () => sub.remove()
  }, [])

  useEffect(() => {
    if (Platform.OS !== 'web') return
    const onKey = (e: KeyboardEvent) => {
      if (replying) return
      if (e.key === 'ArrowRight') moveRef.current(1)
      else if (e.key === 'ArrowLeft') moveRef.current(-1)
      else if (e.key === 'Escape') onClose()
      else if (e.key === ' ') {
        e.preventDefault()
        setHolding(h => !h)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [replying, onClose])

  // ---- gestures: tap / hold on the media, swipe down to close
  const pressStart = useRef(0)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const onPressIn = () => {
    pressStart.current = Date.now()
    clearTimeout(holdTimer.current)
    holdTimer.current = setTimeout(() => setHolding(true), HOLD_MS)
  }
  const onPressOut = (e: {nativeEvent: {pageX?: number}}) => {
    clearTimeout(holdTimer.current)
    const heldMs = Date.now() - pressStart.current
    setHolding(false)
    const action = resolveTap(e.nativeEvent.pageX ?? width, width, heldMs)
    if (action === 'next') move(1)
    else if (action === 'prev') move(-1)
  }
  useEffect(() => () => clearTimeout(holdTimer.current), [])

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          g.dy > 14 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
        onPanResponderGrant: () => {
          clearTimeout(holdTimer.current)
          setHolding(true)
        },
        onPanResponderMove: (_, g) => {
          translateY.set(Math.max(0, g.dy))
        },
        onPanResponderRelease: (_, g) => {
          setHolding(false)
          if (g.dy > height * 0.15 || g.vy > 0.9) onClose()
          else translateY.set(withTiming(0, {duration: 180}))
        },
        onPanResponderTerminate: () => {
          setHolding(false)
          translateY.set(withTiming(0, {duration: 180}))
        },
      }),
    [height, onClose, translateY],
  )
  const dragStyle = useAnimatedStyle(() => ({
    transform: [{translateY: translateY.get()}],
    opacity: 1 - Math.min(0.5, translateY.get() / (height * 1.5)),
  }))

  if (!current || !group) return null
  const canDelete = allowDelete ?? group.isMe
  const canReply = allowReply && !group.isMe

  return (
    <Modal
      visible
      animationType="fade"
      transparent={false}
      onRequestClose={onClose}>
      <Animated.View
        style={[a.flex_1, {backgroundColor: '#000'}, dragStyle]}
        {...pan.panHandlers}>
        <View
          pointerEvents="none"
          style={[a.absolute, a.inset_0, a.align_center, a.justify_center]}>
          <StoryFrame
            key={current.uri}
            story={current}
            width={frame.width}
            onLoad={() => setLoadedUri(current.uri)}
            onError={() => setFailedUri(current.uri)}
          />
        </View>

        {failed && (
          <View
            style={[
              a.absolute,
              a.inset_0,
              a.align_center,
              a.justify_center,
              a.gap_md,
            ]}>
            <Text style={[a.text_md, {color: '#fff'}]}>
              Não foi possível carregar este story
            </Text>
            <Button
              label="Tentar de novo"
              size="small"
              color="secondary"
              onPress={() => setFailedUri(undefined)}>
              <ButtonText>Tentar de novo</ButtonText>
            </Button>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tocar para avançar ou voltar; segure para pausar"
          accessibilityHint=""
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          style={[a.absolute, a.inset_0]}
        />

        <View
          pointerEvents="box-none"
          style={[a.absolute, a.inset_0, {opacity: holding ? 0 : 1}]}>
          <View
            pointerEvents="none"
            style={[
              a.absolute,
              a.w_full,
              a.flex_row,
              a.gap_2xs,
              {top: 10, paddingHorizontal: 8},
            ]}>
            {group.stories.map((s, i) => (
              <ProgressSegment
                key={s.uri}
                progress={i === pos.index ? progress : undefined}
                filled={i < pos.index}
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
            <PreviewableUserAvatar size={32} profile={group.author} />
            <View style={[a.flex_1, {minWidth: 0}]}>
              <Text
                numberOfLines={1}
                style={[a.text_sm, a.font_bold, {color: '#fff'}]}>
                {sanitizeDisplayName(
                  group.author.displayName ||
                    sanitizeHandle(group.author.handle),
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
            {canDelete && (
              <Button
                label={
                  confirmDelete
                    ? 'Confirmar exclusão do story'
                    : 'Excluir story'
                }
                size="small"
                variant={confirmDelete ? 'solid' : 'ghost'}
                color={confirmDelete ? 'negative' : 'secondary'}
                onPress={() => {
                  if (!confirmDelete) return setConfirmDelete(true)
                  setConfirmDelete(false)
                  deleteStory(current.rkey, {
                    onError: () =>
                      Toast.show('Não foi possível excluir o story', 'error'),
                  })
                  setRemoved(prev => new Set(prev).add(current.uri))
                  Toast.show('Story excluído')
                }}>
                {confirmDelete ? (
                  <ButtonText>Excluir?</ButtonText>
                ) : (
                  <ButtonIcon icon={TrashIcon} />
                )}
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

          {canReply && (
            <ReplyBar
              authorDid={group.author.did}
              authorName={sanitizeDisplayName(
                group.author.displayName || sanitizeHandle(group.author.handle),
              )}
              onFocusChange={setReplying}
            />
          )}
        </View>
      </Animated.View>
    </Modal>
  )
}

function ReplyBar({
  authorDid,
  authorName,
  onFocusChange,
}: {
  authorDid: string
  authorName: string
  onFocusChange: (focused: boolean) => void
}) {
  const [text, setText] = useState('')
  const {mutateAsync: send, isPending} = useSendStoryReply()

  const submit = async (kind: 'reply' | 'reaction', body: string) => {
    try {
      await send({did: authorDid, kind, body})
      Toast.show(kind === 'reaction' ? 'Reação enviada' : 'Resposta enviada')
      if (kind === 'reply') setText('')
    } catch (e: any) {
      logger.error('Failed to send story reply', {message: String(e)})
      Toast.show(
        'Não foi possível enviar. A pessoa pode não aceitar mensagens suas.',
        'error',
      )
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      pointerEvents="box-none"
      style={[a.absolute, a.w_full, {bottom: 0}]}>
      <View style={[a.gap_sm, a.p_md]}>
        <View style={[a.flex_row, a.justify_center, a.gap_md]}>
          {REACTIONS.map(emoji => (
            <Pressable
              key={emoji}
              accessibilityRole="button"
              accessibilityLabel={`Reagir com ${emoji}`}
              accessibilityHint="Envia uma mensagem para a pessoa"
              disabled={isPending}
              onPress={() => submit('reaction', emoji)}>
              <Text style={[a.text_2xl]}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
        <View style={[a.flex_row, a.align_center, a.gap_sm]}>
          <TextInput
            value={text}
            onChangeText={setText}
            onFocus={() => onFocusChange(true)}
            onBlur={() => onFocusChange(false)}
            maxLength={REPLY_MAX}
            placeholder={`Responder a ${authorName}`}
            placeholderTextColor="rgba(255,255,255,0.6)"
            accessibilityLabel={`Responder ao story de ${authorName}`}
            accessibilityHint="A resposta vai por mensagem direta"
            returnKeyType="send"
            onSubmitEditing={() => text.trim() && submit('reply', text)}
            style={[
              a.flex_1,
              a.rounded_full,
              a.px_lg,
              a.text_md,
              {
                height: 44,
                color: '#fff',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.5)',
                backgroundColor: 'rgba(0,0,0,0.35)',
              },
            ]}
          />
          <Button
            label="Enviar resposta"
            size="small"
            color="secondary"
            disabled={!text.trim() || isPending}
            onPress={() => submit('reply', text)}>
            <ButtonText>Enviar</ButtonText>
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
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
