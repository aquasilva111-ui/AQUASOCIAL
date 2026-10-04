import {useMemo, useState} from 'react'
import {Pressable, ScrollView, View} from 'react-native'

import {
  bookPath,
  chapterPath,
  filterByGenre,
  genreLabel,
  GENRES,
  MATURITY_LABELS,
  readingMinutes,
  STATUS_LABELS,
} from '#/lib/books/model'
import {
  type BookWithLatest,
  coverUrl,
  type StoredBook,
  useAddToReadingMutation,
  useAuthorBooksQuery,
  useAuthorPdsQuery,
  useFollowedBooksQuery,
  useReadingQuery,
} from '#/state/queries/books'
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {BookCover} from '#/components/books/BookCover'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {BooksShell, Notice, PillLink, RetryNotice} from './shared'

const AQUA_BLUE = '#002BEF'

/**
 * Reads home, Wattpad-style (layout from the wattpad-clone template, restyled
 * for AQUA): genre chips, a featured book with Save/Read, and cover carousels.
 */
export function BooksHomeScreen() {
  const t = useTheme()
  const {hasSession, currentAccount} = useSession()
  const q = useFollowedBooksQuery()
  const reading = useReadingQuery(currentAccount?.did)
  const mine = useAuthorBooksQuery(currentAccount?.did)
  const [genre, setGenre] = useState<string>()

  const items = useMemo(
    () => filterByGenre(q.data ?? [], genre),
    [q.data, genre],
  )
  const featured = items[0]
  const readingBooks = (reading.data ?? [])
    .map(e => e.stored)
    .filter((s): s is StoredBook => !!s)

  return (
    <BooksShell title="Reads" testID="booksHomeScreen">
      <View style={[a.p_lg, a.gap_xl]}>
        <View style={[a.flex_row, a.gap_sm, a.flex_wrap]}>
          <PillLink to="/reads" label="Feed Reads" />
          {hasSession && (
            <>
              <PillLink to="/books/studio" label="Escrever" primary={false} />
              <PillLink
                to="/books/studio/book/new"
                label="Novo livro"
                primary={false}
              />
            </>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[a.gap_sm]}>
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

        {!hasSession ? (
          <Notice
            title="Entre para ler e escrever no Reads"
            body="Os livros de quem você segue aparecem aqui, na ordem em que foram publicados."
          />
        ) : q.isLoading ? (
          <Text>Carregando…</Text>
        ) : q.isError ? (
          <RetryNotice
            title="Não foi possível carregar os livros"
            onRetry={() => q.refetch()}
          />
        ) : featured ? (
          <>
            <Text style={[a.text_lg, a.font_bold]}>Destaque</Text>
            <FeaturedBook item={featured} />
            <Carousel title="Novos capítulos" books={items.slice(1)} latest />
          </>
        ) : (
          <Notice
            title="Nenhum livro por aqui"
            body={
              genre
                ? `Nada em ${genreLabel(genre)} entre quem você segue.`
                : 'Siga autores que publicam no AQUA Reads ou publique o seu primeiro capítulo.'
            }
          />
        )}

        {readingBooks.length > 0 && (
          <Carousel title="Minha leitura" books={readingBooks} />
        )}
        {(mine.data?.length ?? 0) > 0 && (
          <Carousel title="Meus livros" books={mine.data!} />
        )}
      </View>
    </BooksShell>
  )
}

function FeaturedBook({item}: {item: BookWithLatest}) {
  const t = useTheme()
  const pds = useAuthorPdsQuery(item.did)
  const add = useAddToReadingMutation()
  const {book, latest} = item
  return (
    <View
      style={[
        a.rounded_lg,
        a.p_lg,
        a.gap_md,
        a.border,
        t.atoms.border_contrast_low,
        t.atoms.bg_contrast_25,
      ]}>
      <View style={[a.flex_row, a.gap_lg]}>
        <BookCover
          title={book.title}
          url={coverUrl(pds.data, item.did, book.cover)}
          width={104}
        />
        <View style={[a.flex_1, a.gap_xs, {minWidth: 0}]}>
          <Text numberOfLines={3} style={[a.text_xl, a.font_bold]}>
            {book.title}
          </Text>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            {STATUS_LABELS[book.status]}
            {latest ? ` · cap. ${latest.chapter.number}` : ''}
            {latest ? ` · ${readingMinutes(latest.chapter.body)} min` : ''}
            {book.maturity === 'mature' ? ` · ${MATURITY_LABELS.mature}` : ''}
          </Text>
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            {book.genres.map(genreLabel).join(' · ')}
          </Text>
        </View>
      </View>
      {book.synopsis && (
        <Text numberOfLines={5} style={[a.text_sm, {lineHeight: 20}]}>
          {book.synopsis}
        </Text>
      )}
      <View style={[a.flex_row, a.gap_sm]}>
        <Button
          label="Salvar na minha leitura"
          size="small"
          color="secondary"
          disabled={add.isPending}
          onPress={() =>
            add.mutate(item.uri, {
              onSuccess: () => Toast.show('Salvo na sua leitura'),
              onError: () => Toast.show('Não foi possível salvar', 'error'),
            })
          }>
          <ButtonText>Salvar</ButtonText>
        </Button>
        <Link
          to={
            latest
              ? chapterPath(item.did, item.rkey, latest.rkey)
              : bookPath(item.did, item.rkey)
          }
          label={`Ler ${book.title}`}>
          <View
            style={[
              a.rounded_full,
              a.px_lg,
              a.py_sm,
              {backgroundColor: AQUA_BLUE},
            ]}>
            <Text style={[a.font_bold, {color: '#fff'}]}>Ler</Text>
          </View>
        </Link>
      </View>
    </View>
  )
}

function Carousel({
  title,
  books,
  latest,
}: {
  title: string
  books: (StoredBook | BookWithLatest)[]
  latest?: boolean
}) {
  if (books.length === 0) return null
  return (
    <View style={[a.gap_sm]}>
      <Text style={[a.text_lg, a.font_bold]}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[a.gap_md]}>
        {books.map(b => (
          <CoverTile key={b.uri} item={b} latest={latest} />
        ))}
      </ScrollView>
    </View>
  )
}

function CoverTile({
  item,
  latest,
}: {
  item: StoredBook | BookWithLatest
  latest?: boolean
}) {
  const t = useTheme()
  const pds = useAuthorPdsQuery(item.did)
  const last = 'latest' in item ? item.latest : undefined
  return (
    <Link
      to={
        latest && last
          ? chapterPath(item.did, item.rkey, last.rkey)
          : bookPath(item.did, item.rkey)
      }
      label={item.book.title}>
      <View style={[a.gap_xs, {width: 108}]}>
        <BookCover
          title={item.book.title}
          url={coverUrl(pds.data, item.did, item.book.cover)}
          width={108}
        />
        <Text numberOfLines={2} style={[a.text_sm, a.font_bold]}>
          {item.book.title}
        </Text>
        {last && (
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            Cap. {last.chapter.number}
          </Text>
        )}
      </View>
    </Link>
  )
}
