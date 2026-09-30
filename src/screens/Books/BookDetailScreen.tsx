import {View} from 'react-native'

import {
  bookAccess,
  type BookRecord,
  chapterPath,
  GENRES,
  MATURITY_LABELS,
  orderedChapters,
  readingMinutes,
  STATUS_LABELS,
} from '#/lib/books/model'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {
  coverUrl,
  useAddToReadingMutation,
  useAuthorPdsQuery,
  useBookQuery,
  useChaptersQuery,
  useReadingQuery,
  useRemoveFromReadingMutation,
} from '#/state/queries/books'
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {BookCover} from '#/components/books/BookCover'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {useAgeAssurance} from '#/ageAssurance'
import {
  BooksShell,
  Notice,
  PillLink,
  RetryNotice,
  useBookAuthor,
} from './shared'

export function BookDetailScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'BookDetail'>) {
  return (
    <BooksShell title="Livro" testID="bookDetailScreen">
      <BookPage handle={route.params.handle} rkey={route.params.book} />
    </BooksShell>
  )
}

/** Shared by the detail and reader screens: 18+ books need an adult account. */
export function useMatureBlocked(book: BookRecord | undefined) {
  const {flags} = useAgeAssurance()
  return book?.maturity === 'mature' && flags.adultContentDisabled
}

function BookPage({handle, rkey}: {handle: string; rkey: string}) {
  const t = useTheme()
  const author = useBookAuthor(handle)
  const bookQ = useBookQuery(author.did, rkey)
  const chaptersQ = useChaptersQuery(author.did, rkey)
  const pds = useAuthorPdsQuery(author.did)
  const stored = bookQ.data
  const blocked = useMatureBlocked(stored?.book)

  if (author.profile.isLoading || bookQ.isLoading)
    return <Text style={[a.p_xl]}>Carregando…</Text>
  if (bookQ.isError)
    return (
      <RetryNotice
        title="Não foi possível carregar o livro"
        onRetry={() => bookQ.refetch()}
      />
    )
  const access = bookAccess({
    book: stored?.book,
    isOwner: author.isOwner,
    moderated: author.moderated,
  })
  if (access === 'suspended')
    return (
      <Notice
        title="Livro indisponível"
        body="Este livro está indisponível por decisão de moderação do AQUA."
      />
    )
  if (access === 'none' || !stored)
    return <Notice title="Livro não encontrado" />
  if (access === 'unavailable')
    return <Notice title="Este livro não está disponível" />
  if (blocked)
    return (
      <Notice
        title="Conteúdo 18+"
        body="Este livro é para maiores de 18 anos. Sua conta não tem acesso a conteúdo adulto."
      />
    )

  const {book} = stored
  const chapters = orderedChapters(
    (chaptersQ.data ?? []).map(c => c.chapter),
    author.isOwner,
  )
  const byNumber = new Map(
    (chaptersQ.data ?? []).map(c => [c.chapter.number, c]),
  )
  const first = (chaptersQ.data ?? []).find(
    c => c.chapter.status === 'published',
  )
  const authorPath = author.did ?? handle

  return (
    <View style={[a.p_lg, a.gap_lg]}>
      <View style={[a.flex_row, a.gap_lg]}>
        <BookCover
          title={book.title}
          url={coverUrl(pds.data, stored.did, book.cover)}
          width={112}
        />
        <View style={[a.flex_1, a.gap_xs, {minWidth: 0}]}>
          <Text style={[a.text_2xl, a.font_bold]}>{book.title}</Text>
          <Link
            to={`/profile/${author.handle ?? handle}`}
            label={`Perfil de ${author.handle}`}>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              por @{author.handle}
            </Text>
          </Link>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            {STATUS_LABELS[book.status]} · {chapters.length}{' '}
            {chapters.length === 1 ? 'capítulo' : 'capítulos'}
            {book.maturity !== 'general'
              ? ` · ${MATURITY_LABELS[book.maturity]}`
              : ''}
          </Text>
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            {[
              ...book.genres.map(g => GENRES.find(x => x.id === g)?.label ?? g),
              ...book.tags.map(x => `#${x}`),
            ].join(' · ')}
          </Text>
        </View>
      </View>

      <View style={[a.flex_row, a.gap_sm, a.flex_wrap]}>
        {first && (
          <PillLink
            to={chapterPath(authorPath, stored.rkey, first.rkey)}
            label={`Ler capítulo ${first.chapter.number}`}
          />
        )}
        <ReadingToggle bookUri={stored.uri} />
        {author.isOwner && (
          <>
            <PillLink
              to={`/books/studio/book/${stored.rkey}`}
              label="Editar livro"
              primary={false}
            />
            <PillLink
              to={`/books/studio/book/${stored.rkey}/chapter/new`}
              label="Novo capítulo"
              primary={false}
            />
          </>
        )}
      </View>

      {book.synopsis && (
        <Text style={[a.text_md, a.leading_snug]}>{book.synopsis}</Text>
      )}

      <Text style={[a.text_lg, a.font_bold]}>Capítulos</Text>
      {chaptersQ.isLoading ? (
        <Text>Carregando…</Text>
      ) : chapters.length === 0 ? (
        <Text style={[t.atoms.text_contrast_medium]}>
          {author.isOwner
            ? 'Você ainda não escreveu nenhum capítulo.'
            : 'O autor ainda não publicou capítulos.'}
        </Text>
      ) : (
        <View style={[a.border_t, t.atoms.border_contrast_low]}>
          {chapters.map(c => {
            const s = byNumber.get(c.number)
            if (!s) return null
            return (
              <Link
                key={s.uri}
                to={chapterPath(authorPath, stored.rkey, s.rkey)}
                label={`Capítulo ${c.number}: ${c.title}`}>
                <View
                  style={[
                    a.flex_row,
                    a.gap_md,
                    a.py_md,
                    a.border_b,
                    t.atoms.border_contrast_low,
                  ]}>
                  <Text style={[{width: 28}, t.atoms.text_contrast_medium]}>
                    {c.number}
                  </Text>
                  <View style={[a.flex_1]}>
                    <Text style={[a.text_md, a.font_bold]}>{c.title}</Text>
                    <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                      {c.status === 'draft'
                        ? 'Rascunho'
                        : `${readingMinutes(c.body)} min`}
                    </Text>
                  </View>
                </View>
              </Link>
            )
          })}
        </View>
      )}
    </View>
  )
}

/** Adds or removes the book from the signed-in person's "Leitura" list. */
function ReadingToggle({bookUri}: {bookUri: string}) {
  const {currentAccount} = useSession()
  const reading = useReadingQuery(currentAccount?.did)
  const add = useAddToReadingMutation()
  const remove = useRemoveFromReadingMutation()
  if (!currentAccount || reading.isLoading) return null
  const entry = reading.data?.find(e => e.bookUri === bookUri)
  const busy = add.isPending || remove.isPending
  return (
    <Button
      label={entry ? 'Remover da leitura' : 'Adicionar à leitura'}
      size="large"
      color="secondary"
      disabled={busy}
      onPress={() => (entry ? remove.mutate(entry.rkey) : add.mutate(bookUri))}>
      <ButtonText>
        {entry ? 'Na sua leitura ✓' : 'Adicionar à leitura'}
      </ButtonText>
    </Button>
  )
}
