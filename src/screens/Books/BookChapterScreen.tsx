import {useMemo, useState} from 'react'
import {TextInput, View} from 'react-native'

import {
  bookAccess,
  chapterAccess,
  chapterPath,
  LIMITS,
  neighbors,
  readingMinutes,
  rkeyOf,
  splitIntoParts,
} from '#/lib/books/model'
import {makeProfileLink} from '#/lib/routes/links'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {
  useBookQuery,
  useChaptersQuery,
  useShareChapterMutation,
} from '#/state/queries/books'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {useMatureBlocked} from './BookDetailScreen'
import {
  BooksShell,
  Notice,
  PillLink,
  RetryNotice,
  useBookAuthor,
} from './shared'

type Mode = 'thread' | 'page'

export function BookChapterScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'BookChapter'>) {
  return (
    <BooksShell title="Capítulo" testID="bookChapterScreen">
      <Reader {...route.params} />
    </BooksShell>
  )
}

function Reader({
  handle,
  book: bookRkey,
  chapter: chapterRkey,
}: {
  handle: string
  book: string
  chapter: string
}) {
  const t = useTheme()
  const author = useBookAuthor(handle)
  const bookQ = useBookQuery(author.did, bookRkey)
  const chaptersQ = useChaptersQuery(author.did, bookRkey)
  const [mode, setMode] = useState<Mode>('thread')
  const stored = bookQ.data
  const current = chaptersQ.data?.find(c => c.rkey === chapterRkey)
  const blocked = useMatureBlocked(stored?.book)
  const parts = useMemo(
    () => (current ? splitIntoParts(current.chapter.body) : []),
    [current],
  )

  if (author.profile.isLoading || bookQ.isLoading || chaptersQ.isLoading)
    return <Text style={[a.p_xl]}>Carregando…</Text>
  if (bookQ.isError || chaptersQ.isError)
    return (
      <RetryNotice
        title="Não foi possível carregar o capítulo"
        onRetry={() => {
          bookQ.refetch()
          chaptersQ.refetch()
        }}
      />
    )
  const bookAcc = bookAccess({
    book: stored?.book,
    isOwner: author.isOwner,
    moderated: author.moderated,
  })
  if (bookAcc === 'suspended')
    return (
      <Notice
        title="Livro indisponível"
        body="Este livro está indisponível por decisão de moderação do AQUA."
      />
    )
  if (bookAcc !== 'visible' || !stored)
    return <Notice title="Livro não encontrado" />
  if (blocked)
    return (
      <Notice
        title="Conteúdo 18+"
        body="Este livro é para maiores de 18 anos. Sua conta não tem acesso a conteúdo adulto."
      />
    )
  const chAcc = chapterAccess({
    chapter: current?.chapter,
    isOwner: author.isOwner,
  })
  if (chAcc !== 'visible' || !current)
    return <Notice title="Capítulo não encontrado" />

  const {book} = stored
  const {chapter} = current
  const authorPath = author.did ?? handle
  const all = (chaptersQ.data ?? []).map(c => c.chapter)
  const {prev, next} = neighbors(all, chapter.number)
  const rkeyFor = (n?: number) =>
    chaptersQ.data?.find(c => c.chapter.number === n)?.rkey
  const commentsLink =
    chapter.threadUri && author.profile.data
      ? makeProfileLink(
          {did: author.profile.data.did, handle: author.profile.data.handle},
          'post',
          rkeyOf(chapter.threadUri),
        )
      : undefined
  const profile = author.profile.data

  return (
    <View style={[a.p_lg, a.gap_lg]}>
      <View style={[a.gap_xs]}>
        <Link to={`/books/${authorPath}/${stored.rkey}`} label={book.title}>
          <Text style={[a.text_xs, a.font_bold, t.atoms.text_contrast_medium]}>
            {book.title.toUpperCase()} · {readingMinutes(chapter.body)} MIN
          </Text>
        </Link>
        <Text style={[a.text_2xl, a.font_bold]}>
          {chapter.number}. {chapter.title}
        </Text>
        {chapter.status === 'draft' && (
          <Text style={[a.text_sm, {color: t.palette.negative_500}]}>
            Rascunho: só você vê este capítulo.
          </Text>
        )}
      </View>

      <View
        style={[
          a.flex_row,
          a.gap_xs,
          a.p_2xs,
          a.rounded_full,
          t.atoms.bg_contrast_50,
        ]}
        accessibilityRole="tablist">
        {(['thread', 'page'] as const).map(m => (
          <Button
            key={m}
            label={m === 'thread' ? 'Modo thread' : 'Modo página'}
            size="small"
            variant={mode === m ? 'solid' : 'ghost'}
            color={mode === m ? 'primary' : 'secondary'}
            accessibilityState={{selected: mode === m}}
            onPress={() => setMode(m)}
            style={[a.flex_1]}>
            <ButtonText>{m === 'thread' ? 'Thread' : 'Página'}</ButtonText>
          </Button>
        ))}
      </View>

      {mode === 'thread' ? (
        <View>
          {parts.map((part, i) => (
            <View key={i} style={[a.flex_row, a.gap_sm]}>
              <View style={[a.align_center, {width: 32}]}>
                <UserAvatar type="user" size={28} avatar={profile?.avatar} />
                {i < parts.length - 1 && (
                  <View
                    style={[
                      a.flex_1,
                      a.mt_xs,
                      {width: 2},
                      t.atoms.bg_contrast_50,
                    ]}
                  />
                )}
              </View>
              <View style={[a.flex_1, a.pb_lg, {minWidth: 0}]}>
                <Text
                  style={[a.text_xs, t.atoms.text_contrast_medium, a.pb_2xs]}>
                  <Text style={[a.text_xs, a.font_bold]}>
                    {profile?.displayName || profile?.handle}
                  </Text>{' '}
                  · parte {i + 1} de {parts.length}
                </Text>
                <Text selectable style={[a.text_md, {lineHeight: 26}]}>
                  {part}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={[a.gap_md]}>
          {chapter.body
            .split(/\n{2,}/)
            .filter(p => p.trim())
            .map((p, i) => (
              <Text key={i} selectable style={[a.text_lg, {lineHeight: 30}]}>
                {p.trim()}
              </Text>
            ))}
        </View>
      )}

      {chapter.authorNote && (
        <View style={[a.p_md, a.rounded_md, t.atoms.bg_contrast_25, a.gap_2xs]}>
          <Text style={[a.text_xs, a.font_bold, t.atoms.text_contrast_medium]}>
            NOTA DA AUTORA
          </Text>
          <Text style={[a.text_sm]}>{chapter.authorNote}</Text>
        </View>
      )}

      <View style={[a.flex_row, a.gap_sm, a.flex_wrap]}>
        {commentsLink ? (
          <PillLink
            to={commentsLink}
            label="Comentários e curtidas"
            primary={false}
          />
        ) : (
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            Este capítulo não tem thread de comentários.
          </Text>
        )}
        {author.isOwner && (
          <PillLink
            to={`/books/studio/book/${stored.rkey}/chapter/${current.rkey}`}
            label="Editar capítulo"
            primary={false}
          />
        )}
      </View>

      {chapter.status === 'published' &&
        book.visibility === 'public' &&
        profile && (
          <SharePanel
            authorHandle={profile.handle}
            bookRkey={stored.rkey}
            chapterRkey={current.rkey}
            book={book}
            chapter={chapter}
          />
        )}

      <View style={[a.flex_row, a.gap_sm, a.justify_between]}>
        {prev && rkeyFor(prev.number) ? (
          <PillLink
            to={chapterPath(authorPath, stored.rkey, rkeyFor(prev.number)!)}
            label="Anterior"
            primary={false}
          />
        ) : (
          <View />
        )}
        {next && rkeyFor(next.number) && (
          <PillLink
            to={chapterPath(authorPath, stored.rkey, rkeyFor(next.number)!)}
            label="Próximo capítulo"
          />
        )}
      </View>
    </View>
  )
}

function SharePanel(props: {
  authorHandle: string
  bookRkey: string
  chapterRkey: string
  book: Parameters<
    ReturnType<typeof useShareChapterMutation>['mutate']
  >[0]['book']
  chapter: Parameters<
    ReturnType<typeof useShareChapterMutation>['mutate']
  >[0]['chapter']
}) {
  const t = useTheme()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const share = useShareChapterMutation()

  if (!open)
    return (
      <View style={[a.flex_row]}>
        <Button
          label="Compartilhar no feed"
          size="small"
          color="secondary"
          onPress={() => setOpen(true)}>
          <ButtonText>Compartilhar no feed</ButtonText>
        </Button>
      </View>
    )
  return (
    <View
      style={[
        a.gap_sm,
        a.p_md,
        a.border,
        a.rounded_md,
        t.atoms.border_contrast_low,
      ]}>
      <Text style={[a.font_bold]}>Compartilhar no feed principal</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Diga algo sobre este capítulo…"
        placeholderTextColor={t.atoms.text_contrast_low.color}
        multiline
        maxLength={LIMITS.sharePreview}
        accessibilityLabel="Seu comentário"
        accessibilityHint=""
        style={[
          a.border,
          a.rounded_sm,
          a.p_sm,
          a.text_md,
          t.atoms.text,
          t.atoms.border_contrast_low,
          {minHeight: 72, textAlignVertical: 'top'},
        ]}
      />
      <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
        O post leva um card com a capa, o título e uma prévia. O texto do
        capítulo não vai no post.
      </Text>
      <View style={[a.flex_row, a.gap_sm]}>
        <Button
          label="Postar no feed"
          size="small"
          color="primary"
          disabled={share.isPending}
          onPress={() =>
            share.mutate(
              {...props, text},
              {
                onSuccess: () => {
                  Toast.show('Capítulo compartilhado no feed', {
                    type: 'success',
                  })
                  setOpen(false)
                  setText('')
                },
                onError: () =>
                  Toast.show(
                    'Não foi possível compartilhar. Tente novamente.',
                    {
                      type: 'error',
                    },
                  ),
              },
            )
          }>
          <ButtonText>
            {share.isPending ? 'Postando…' : 'Postar no feed'}
          </ButtonText>
        </Button>
        <Button
          label="Cancelar"
          size="small"
          color="secondary"
          onPress={() => setOpen(false)}>
          <ButtonText>Cancelar</ButtonText>
        </Button>
      </View>
    </View>
  )
}
