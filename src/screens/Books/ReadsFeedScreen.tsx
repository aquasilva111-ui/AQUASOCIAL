import {useCallback, useMemo, useRef, useState} from 'react'
import {Pressable, ScrollView, View} from 'react-native'
import type ViewShot from 'react-native-view-shot'
import {useQueryClient} from '@tanstack/react-query'

import {
  bookPath,
  chapterPath,
  chapterToCards,
  filterByGenre,
  genreLabel,
  GENRES,
  partExcerpt,
  STATUS_LABELS,
} from '#/lib/books/model'
import {logger} from '#/logger'
import {
  type BookWithLatest,
  coverUrl,
  type ReadingEntry,
  useAddToReadingMutation,
  useAuthorPdsQuery,
  useChapterPostQuery,
  useFollowedBooksQuery,
  useReadingQuery,
  useRemoveFromReadingMutation,
  useRepostPartMutation,
  useToggleChapterLikeMutation,
} from '#/state/queries/books'
import {useProfileQuery} from '#/state/queries/profile'
import {useCreateStoryMutation} from '#/state/queries/stories'
import {useSession} from '#/state/session'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {BookCover} from '#/components/books/BookCover'
import {Link} from '#/components/Link'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {BooksShell, Notice, PillLink, RetryNotice} from './shared'
import {StoryPartCard} from './StoryPartCard'

const AQUA_BLUE = '#002BEF'

type FeedTab = 'following' | 'reading'

/**
 * Reads feed ("Escrever"), mockup aqua-write/feed: a Twitter + Wattpad feed
 * where each book chapter arrives as a connected thread of parts. Tabs for
 * followed books and the person's reading list, genre chips, and book cards
 * with cover, status and a continue-reading button.
 */
export function ReadsFeedScreen() {
  const t = useTheme()
  const {hasSession} = useSession()
  const [tab, setTab] = useState<FeedTab>('following')
  const [genre, setGenre] = useState<string>()
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
  const filtered = useMemo(
    () =>
      filterByGenre(
        cards.map(c => ({...c, book: c.item.book})),
        genre,
      ),
    [cards, genre],
  )

  return (
    <BooksShell title="Reads" testID="readsFeedScreen">
      <View style={[a.px_lg, a.pt_md, a.gap_md]}>
        <View style={[a.flex_row, a.align_center, a.justify_between, a.gap_sm]}>
          <View style={[a.flex_1, a.gap_2xs]}>
            <Text style={[a.text_xl, a.font_bold]}>
              Reads{' '}
              <Text style={[a.text_sm, a.font_normal, a.leading_snug]}>
                · Escrever
              </Text>
            </Text>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              Publicado por capítulos, lido em thread.
            </Text>
          </View>
          <View style={[a.flex_row, a.gap_sm, a.flex_wrap]}>
            <PillLink to="/books" label="Biblioteca" primary={false} />
            {hasSession && <PillLink to="/books/studio" label="✎ Escrever" />}
          </View>
        </View>

        <View style={[a.flex_row, a.border_b, t.atoms.border_contrast_low]}>
          {(
            [
              ['following', 'Seguindo'],
              ['reading', 'Continuar lendo'],
            ] as const
          ).map(([id, label]) => (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityHint="Troca a aba do feed"
              accessibilityState={{selected: tab === id}}
              onPress={() => setTab(id)}
              style={[a.flex_1, a.py_sm, a.align_center]}>
              <Text
                style={[
                  a.text_sm,
                  a.font_bold,
                  tab === id ? t.atoms.text : t.atoms.text_contrast_medium,
                ]}>
                {label}
              </Text>
              <View
                style={[
                  a.mt_xs,
                  a.w_full,
                  a.self_center,
                  {height: 3, borderRadius: 3},
                  tab === id ? {backgroundColor: AQUA_BLUE} : null,
                ]}
              />
            </Pressable>
          ))}
        </View>
      </View>

      {tab === 'reading' ? (
        <ReadingShelf />
      ) : !hasSession ? (
        <Notice
          title="Entre para ler Reads"
          body="Os livros de quem você segue aparecem aqui, parte por parte."
        />
      ) : q.isLoading ? (
        <Text style={[a.p_lg]}>Carregando…</Text>
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
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[a.gap_sm, a.px_lg, a.py_sm]}>
            {[{id: undefined, label: 'Todos'}, ...GENRES].map(g => {
              const on = g.id === genre
              return (
                <Pressable
                  key={g.label}
                  accessibilityRole="button"
                  accessibilityLabel={`Gênero ${g.label}`}
                  accessibilityHint=""
                  accessibilityState={{selected: on}}
                  onPress={() => setGenre(g.id)}
                  style={[
                    a.rounded_full,
                    a.px_md,
                    a.py_xs,
                    on ? {backgroundColor: AQUA_BLUE} : t.atoms.bg_contrast_50,
                  ]}>
                  <Text
                    style={[
                      a.text_sm,
                      a.font_bold,
                      on ? {color: '#fff'} : t.atoms.text,
                    ]}>
                    {g.label}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
          <View style={[a.px_lg, a.pb_xl]}>
            {filtered.length === 0 ? (
              <Notice
                title={`Nada em ${genreLabel(genre!)} agora`}
                body="Tente outro gênero ou veja tudo sem filtro."
              />
            ) : (
              filtered.map(({item, part}) => (
                <PartCard
                  key={part.id}
                  item={item}
                  index={part.index}
                  total={part.total}
                  text={part.text}
                />
              ))
            )}
          </View>
        </>
      )}
    </BooksShell>
  )
}

/* ------------------------------------------------------------------ */
/* Continuar lendo: estante da lista de leitura                        */
/* ------------------------------------------------------------------ */

function ReadingShelf() {
  const {hasSession, currentAccount} = useSession()
  const reading = useReadingQuery(currentAccount?.did)
  const entries = (reading.data ?? []).filter(e => e.stored)

  if (!hasSession)
    return (
      <Notice
        title="Sua estante espera por você"
        body="Entre para salvar livros e continuar de onde parou."
      />
    )
  if (reading.isLoading) return <Text style={[a.p_lg]}>Carregando…</Text>
  if (reading.isError)
    return (
      <RetryNotice
        title="Não foi possível carregar sua estante"
        onRetry={() => reading.refetch()}
      />
    )
  if (entries.length === 0)
    return (
      <Notice
        title="Nada para continuar ainda"
        body="Toque em + Leitura em qualquer livro do feed para guardá-lo aqui."
      />
    )

  return (
    <View style={[a.px_lg, a.py_lg, a.flex_row, a.flex_wrap, a.gap_md]}>
      {entries.map(e => (
        <ReadingCard key={e.uri} entry={e} />
      ))}
    </View>
  )
}

function ReadingCard({entry}: {entry: ReadingEntry}) {
  const t = useTheme()
  const stored = entry.stored!
  const pds = useAuthorPdsQuery(stored.did)
  return (
    <View style={[a.gap_2xs, {width: 104}]}>
      <Link
        to={bookPath(stored.did, stored.rkey)}
        label={`Abrir ${stored.book.title}`}>
        <BookCover
          title={stored.book.title}
          url={coverUrl(pds.data, stored.did, stored.book.cover)}
          width={104}
          flat
        />
      </Link>
      <Text numberOfLines={2} style={[a.text_xs, a.font_bold, {minHeight: 30}]}>
        {stored.book.title}
      </Text>
      <Text style={[a.text_2xs, t.atoms.text_contrast_medium]}>
        {STATUS_LABELS[stored.book.status]}
      </Text>
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Card de post (estilo mockup): avatar, badge, capa, ações            */
/* ------------------------------------------------------------------ */

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
      Toast.show('Este capítulo ainda não tem thread para curtir', {
        type: 'error',
      })
      return
    }
    toggleLike.mutate(post.data, {
      onError: () => Toast.show('Não foi possível curtir', {type: 'error'}),
    })
  }, [post.data, toggleLike])

  const onRepost = useCallback(() => {
    repost.mutate(
      {authorHandle: handle, item, index, text},
      {
        onSuccess: () => Toast.show('Thread republicada no feed'),
        onError: () =>
          Toast.show('Não foi possível republicar. Tente novamente.', {
            type: 'error',
          }),
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
      Toast.show('Não foi possível publicar no story', {type: 'error'})
    } finally {
      setStoryBusy(false)
    }
  }, [storyBusy, createStory, qc])

  return (
    <View style={[a.flex_row, a.gap_sm, a.py_md]}>
      <View style={[a.align_center, {width: 36}]}>
        <UserAvatar type="user" size={32} avatar={profile?.avatar} />
        {index < total - 1 && (
          <View
            style={[a.flex_1, a.mt_xs, {width: 2}, t.atoms.bg_contrast_50]}
          />
        )}
      </View>
      <View style={[a.flex_1, a.gap_xs, {minWidth: 0}]}>
        <View style={[a.flex_row, a.align_center, a.gap_xs, a.flex_wrap]}>
          <Link
            to={`/profile/${handle}`}
            label={`Perfil de ${profile?.displayName || handle}`}>
            <Text style={[a.text_sm, a.font_bold]}>
              {profile?.displayName || handle}
            </Text>
          </Link>
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            @{handle}
          </Text>
          <View
            style={[
              a.rounded_xs,
              a.px_xs,
              {backgroundColor: t.atoms.bg_contrast_50.backgroundColor},
            ]}>
            <Text
              style={[
                a.text_2xs,
                a.font_bold,
                {color: AQUA_BLUE, letterSpacing: 0.4},
              ]}>
              LIVRO
            </Text>
          </View>
        </View>
        <Link
          to={chapterPath(item.did, item.rkey, latest.rkey)}
          label={`${item.book.title}, capítulo ${latest.chapter.number}`}>
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            {item.book.title} · cap. {latest.chapter.number} ·{' '}
            <Text style={[a.text_xs, a.font_bold, {color: AQUA_BLUE}]}>
              Parte {index + 1}/{total}
            </Text>
          </Text>
        </Link>
        {index === 0 && <BookMiniCard item={item} handle={handle} />}
        <Text selectable style={[a.text_md, {lineHeight: 26}]}>
          {text}
        </Text>
        <View style={[a.flex_row, a.gap_sm, a.flex_wrap, a.pt_2xs]}>
          <Link
            to={chapterPath(item.did, item.rkey, latest.rkey)}
            label={`Comentar o capítulo ${latest.chapter.number}`}>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              💬 {post.data?.replyCount ?? 0}
            </Text>
          </Link>
          <ActButton
            label={liked ? 'Descurtir parte' : 'Curtir parte'}
            onPress={onLike}
            on={liked}
            text={`♡ ${post.data?.likeCount ?? 0}`}
          />
          <ActButton
            label="Republicar thread"
            onPress={onRepost}
            disabled={repost.isPending}
            text="↻ Republicar"
          />
          <ActButton
            label="Publicar no story"
            onPress={onStory}
            disabled={storyBusy}
            text={storyBusy ? 'Gerando…' : '🔖 Story'}
          />
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

/** Compact act row entry: quiet text that lights up when active. */
function ActButton({
  label,
  onPress,
  text,
  on,
  disabled,
}: {
  label: string
  onPress: () => void
  text: string
  on?: boolean
  disabled?: boolean
}) {
  const t = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint=""
      accessibilityState={{selected: !!on, busy: !!disabled}}
      disabled={disabled}
      onPress={onPress}
      style={[a.py_2xs, a.pr_sm]}>
      <Text
        style={[
          a.text_sm,
          a.font_bold,
          on ? {color: AQUA_BLUE} : t.atoms.text_contrast_medium,
        ]}>
        {text}
      </Text>
    </Pressable>
  )
}

/* ------------------------------------------------------------------ */
/* Mini-card do livro (capa, status, continuar leitura, + leitura)     */
/* ------------------------------------------------------------------ */

function BookMiniCard({item, handle}: {item: BookWithLatest; handle: string}) {
  const t = useTheme()
  const {currentAccount} = useSession()
  const reading = useReadingQuery(currentAccount?.did)
  const add = useAddToReadingMutation()
  const remove = useRemoveFromReadingMutation()
  const pds = useAuthorPdsQuery(item.did)
  const latest = item.latest!
  const entry = reading.data?.find(e => e.bookUri === item.uri)
  const busy = add.isPending || remove.isPending
  const chapterLink = chapterPath(item.did, item.rkey, latest.rkey)

  return (
    <View
      style={[
        a.flex_row,
        a.gap_md,
        a.p_sm,
        a.rounded_md,
        a.border,
        t.atoms.border_contrast_low,
      ]}>
      <Link
        to={bookPath(item.did, item.rkey)}
        label={`Abrir ${item.book.title}`}>
        <BookCover
          title={item.book.title}
          url={coverUrl(pds.data, item.did, item.book.cover)}
          width={64}
        />
      </Link>
      <View style={[a.flex_1, a.gap_2xs, {minWidth: 0}]}>
        <Link
          to={bookPath(item.did, item.rkey)}
          label={`Abrir ${item.book.title}`}>
          <Text numberOfLines={1} style={[a.text_md, a.font_bold]}>
            {item.book.title}
          </Text>
        </Link>
        <Text
          numberOfLines={1}
          style={[a.text_xs, t.atoms.text_contrast_medium]}>
          {item.book.genres.map(genreLabel).join(' · ') ||
            STATUS_LABELS[item.book.status]}
        </Text>
        <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
          {STATUS_LABELS[item.book.status]} · por @{handle}
        </Text>
        <View style={[a.flex_row, a.gap_sm, a.align_center, a.pt_2xs]}>
          <Link
            to={chapterLink}
            label={`Continuar leitura do capítulo ${latest.chapter.number}`}>
            <View
              style={[
                a.rounded_full,
                a.px_md,
                a.py_xs,
                {backgroundColor: AQUA_BLUE},
              ]}>
              <Text style={[a.text_xs, a.font_bold, {color: '#fff'}]}>
                Continuar leitura
              </Text>
            </View>
          </Link>
          {currentAccount && !reading.isLoading && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                entry ? 'Remover da leitura' : 'Adicionar à leitura'
              }
              accessibilityHint=""
              accessibilityState={{busy}}
              disabled={busy}
              onPress={() =>
                entry ? remove.mutate(entry.rkey) : add.mutate(item.uri)
              }
              style={[
                a.rounded_full,
                a.px_md,
                a.py_xs,
                a.border,
                t.atoms.border_contrast_low,
              ]}>
              <Text
                style={[a.text_xs, a.font_bold, t.atoms.text_contrast_medium]}>
                {entry ? 'Na leitura ✓' : '+ Leitura'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  )
}
