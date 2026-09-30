import {View} from 'react-native'

import {
  bookPath,
  chapterPath,
  MATURITY_LABELS,
  readingMinutes,
} from '#/lib/books/model'
import {
  type BookWithLatest,
  coverUrl,
  useAuthorPdsQuery,
  useFollowedBooksQuery,
} from '#/state/queries/books'
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {BookCover} from '#/components/books/BookCover'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {BooksShell, Notice, PillLink, RetryNotice} from './shared'

export function BooksHomeScreen() {
  const {hasSession} = useSession()
  const q = useFollowedBooksQuery()
  return (
    <BooksShell title="Livros" testID="booksHomeScreen">
      <View style={[a.p_lg, a.gap_lg]}>
        {hasSession && (
          <View style={[a.flex_row, a.gap_sm, a.flex_wrap]}>
            <PillLink to="/books/studio" label="Estúdio do autor" />
            <PillLink
              to="/books/studio/book/new"
              label="Novo livro"
              primary={false}
            />
          </View>
        )}
        <Text style={[a.text_lg, a.font_bold]}>Novos capítulos</Text>
        {!hasSession ? (
          <Notice
            title="Entre para ver os livros de quem você segue"
            body="Os capítulos novos aparecem aqui, na ordem em que foram publicados."
          />
        ) : q.isLoading ? (
          <Text>Carregando…</Text>
        ) : q.isError ? (
          <RetryNotice
            title="Não foi possível carregar os livros"
            onRetry={() => q.refetch()}
          />
        ) : q.data && q.data.length > 0 ? (
          <View style={[a.gap_md]}>
            {q.data.map(item => (
              <BookRow key={item.uri} item={item} />
            ))}
          </View>
        ) : (
          <Notice
            title="Nenhum capítulo novo por aqui"
            body="Siga autores que publicam livros no AQUA ou publique o seu primeiro capítulo."
          />
        )}
      </View>
    </BooksShell>
  )
}

export function BookRow({item}: {item: BookWithLatest}) {
  const t = useTheme()
  const pds = useAuthorPdsQuery(item.did)
  const {book, latest} = item
  return (
    <Link
      to={
        latest
          ? chapterPath(item.did, item.rkey, latest.rkey)
          : bookPath(item.did, item.rkey)
      }
      label={`${book.title}${latest ? `, capítulo ${latest.chapter.number}` : ''}`}>
      <View
        style={[
          a.flex_row,
          a.gap_md,
          a.p_md,
          a.border,
          a.rounded_md,
          t.atoms.border_contrast_low,
        ]}>
        <BookCover
          title={book.title}
          url={coverUrl(pds.data, item.did, book.cover)}
          width={64}
        />
        <View style={[a.flex_1, a.gap_2xs, {minWidth: 0}]}>
          <Text numberOfLines={2} style={[a.text_md, a.font_bold]}>
            {book.title}
          </Text>
          {latest && (
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              Cap. {latest.chapter.number} · {latest.chapter.title}
            </Text>
          )}
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            {latest
              ? `${readingMinutes(latest.chapter.body)} min de leitura`
              : ''}
            {book.maturity === 'mature' ? ` · ${MATURITY_LABELS.mature}` : ''}
          </Text>
        </View>
      </View>
    </Link>
  )
}
