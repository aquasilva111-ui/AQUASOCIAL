import {useCallback, useMemo, useRef, useState} from 'react'
import {View} from 'react-native'
import type ViewShot from 'react-native-view-shot'
import {useQueryClient} from '@tanstack/react-query'

import {chapterPath, chapterToCards, partExcerpt} from '#/lib/books/model'
import {logger} from '#/logger'
import {
  type BookWithLatest,
  useChapterPostQuery,
  useFollowedBooksQuery,
  useRepostPartMutation,
  useToggleChapterLikeMutation,
} from '#/state/queries/books'
import {useProfileQuery} from '#/state/queries/profile'
import {useCreateStoryMutation} from '#/state/queries/stories'
import {useSession} from '#/state/session'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {BooksShell, Notice, PillLink, RetryNotice} from './shared'
import {StoryPartCard} from './StoryPartCard'

/**
 * Reads: a vertical feed of book "thread parts", Threads-style. Each card is
 * one part of the latest chapter of a book from someone you follow; you can
 * like it, repost it to the main feed or publish it as a story.
 */
export function ReadsFeedScreen() {
  const {hasSession} = useSession()
  const q = useFollowedBooksQuery()
  const cards = useMemo(
    () =>
      (q.data ?? []).flatMap(item =>
        item.latest
          ? chapterToCards(item.latest.uri, item.latest.chapter).map(part => ({
              item,
              part,
            }))
          : [],
      ),
    [q.data],
  )

  return (
    <BooksShell title="Reads" testID="readsFeedScreen">
      <View style={[a.p_lg, a.gap_lg]}>
        <View style={[a.flex_row, a.gap_sm, a.flex_wrap]}>
          <PillLink to="/books" label="Biblioteca" primary={false} />
          {hasSession && <PillLink to="/books/studio" label="Estúdio" />}
        </View>
        {!hasSession ? (
          <Notice
            title="Entre para ler Reads"
            body="Os livros de quem você segue aparecem aqui, parte por parte."
          />
        ) : q.isLoading ? (
          <Text>Carregando…</Text>
        ) : q.isError ? (
          <RetryNotice
            title="Não foi possível carregar o feed"
            onRetry={() => q.refetch()}
          />
        ) : cards.length === 0 ? (
          <Notice
            title="Nada para ler ainda"
            body="Siga autores que publicam no AQUA Reads ou publique o seu primeiro capítulo."
          />
        ) : (
          <View>
            {cards.map(({item, part}) => (
              <PartCard
                key={part.id}
                item={item}
                index={part.index}
                total={part.total}
                text={part.text}
              />
            ))}
          </View>
        )}
      </View>
    </BooksShell>
  )
}

function PartCard({
  item,
  index,
  total,
  text,
}: {
  item: BookWithLatest
  index: number
  total: number
  text: string
}) {
  const t = useTheme()
  const profile = useProfileQuery({did: item.did}).data
  const latest = item.latest!
  const threadUri = latest.chapter.threadUri
  const post = useChapterPostQuery(threadUri)
  const toggleLike = useToggleChapterLikeMutation(threadUri)
  const repost = useRepostPartMutation()
  const {mutateAsync: createStory} = useCreateStoryMutation()
  const shot = useRef<ViewShot>(null)
  const [storyBusy, setStoryBusy] = useState(false)
  const qc = useQueryClient()
  const handle = profile?.handle ?? item.did
  const liked = !!post.data?.likeUri

  const onLike = useCallback(() => {
    if (!post.data) {
      Toast.show('Este capítulo ainda não tem thread para curtir', 'error')
      return
    }
    toggleLike.mutate(post.data, {
      onError: () => Toast.show('Não foi possível curtir', 'error'),
    })
  }, [post.data, toggleLike])

  const onRepost = useCallback(() => {
    repost.mutate(
      {authorHandle: handle, item, index, text},
      {
        onSuccess: () => Toast.show('Thread republicada no feed'),
        onError: () =>
          Toast.show('Não foi possível republicar. Tente novamente.', 'error'),
      },
    )
  }, [repost, handle, item, index, text])

  const onStory = useCallback(async () => {
    if (storyBusy) return
    setStoryBusy(true)
    try {
      const uri = await shot.current?.capture?.()
      if (!uri) throw new Error('capture_failed')
      await createStory({
        path: uri,
        mime: 'image/jpeg',
        width: 1080,
        height: 1920,
        size: 0,
      })
      qc.invalidateQueries({queryKey: ['stories']})
      Toast.show('Publicado no seu story')
    } catch (e) {
      logger.error('Failed to publish part as story', {message: String(e)})
      Toast.show('Não foi possível publicar no story', 'error')
    } finally {
      setStoryBusy(false)
    }
  }, [storyBusy, createStory, qc])

  return (
    <View style={[a.flex_row, a.gap_sm]}>
      <View style={[a.align_center, {width: 36}]}>
        <UserAvatar type="user" size={32} avatar={profile?.avatar} />
        {index < total - 1 && (
          <View
            style={[a.flex_1, a.mt_xs, {width: 2}, t.atoms.bg_contrast_50]}
          />
        )}
      </View>
      <View style={[a.flex_1, a.pb_lg, a.gap_xs, {minWidth: 0}]}>
        <Link
          to={chapterPath(item.did, item.rkey, latest.rkey)}
          label={`${item.book.title}, capítulo ${latest.chapter.number}`}>
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            <Text style={[a.text_xs, a.font_bold]}>
              {profile?.displayName || handle}
            </Text>{' '}
            · {item.book.title} · cap. {latest.chapter.number} · parte{' '}
            {index + 1}/{total}
          </Text>
        </Link>
        <Text selectable style={[a.text_md, {lineHeight: 26}]}>
          {text}
        </Text>
        <View style={[a.flex_row, a.gap_sm, a.flex_wrap, a.pt_xs]}>
          <Button
            label={liked ? 'Descurtir' : 'Curtir'}
            size="small"
            color={liked ? 'primary' : 'secondary'}
            onPress={onLike}>
            <ButtonText>
              {liked ? '♥' : '♡'} {post.data?.likeCount ?? 0}
            </ButtonText>
          </Button>
          <Button
            label="Republicar thread"
            size="small"
            color="secondary"
            disabled={repost.isPending}
            onPress={onRepost}>
            <ButtonText>Republicar</ButtonText>
          </Button>
          <Button
            label="Publicar no story"
            size="small"
            color="secondary"
            disabled={storyBusy}
            onPress={onStory}>
            <ButtonText>{storyBusy ? 'Gerando…' : 'Story'}</ButtonText>
          </Button>
        </View>
      </View>
      {/* Off-screen render used only to capture the story image. */}
      <StoryPartCard
        ref={shot}
        title={item.book.title}
        author={profile?.displayName || handle}
        excerpt={partExcerpt(text, 420)}
      />
    </View>
  )
}
