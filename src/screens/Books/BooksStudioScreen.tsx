import {View} from 'react-native'

import {bookPath, MATURITY_LABELS, STATUS_LABELS} from '#/lib/books/model'
import {
  coverUrl,
  type StoredBook,
  useAuthorBooksQuery,
  useAuthorPdsQuery,
  useChaptersQuery,
} from '#/state/queries/books'
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {BookCover} from '#/components/books/BookCover'
import {Text} from '#/components/Typography'
import {BooksShell, Notice, PillLink, RetryNotice} from './shared'

export function BooksStudioScreen() {
  const {currentAccount} = useSession()
  const q = useAuthorBooksQuery(currentAccount?.did)
  return (
    <BooksShell title="Estúdio de Livros" testID="booksStudioScreen">
      <View style={[a.p_lg, a.gap_lg]}>
        <View style={[a.flex_row, a.gap_sm]}>
          <PillLink to="/books/studio/book/new" label="Novo livro" />
        </View>
        {q.isLoading ? (
          <Text>Carregando…</Text>
        ) : q.isError ? (
          <RetryNotice
            title="Não foi possível carregar seus livros"
            onRetry={() => q.refetch()}
          />
        ) : q.data && q.data.length > 0 && currentAccount ? (
          <View style={[a.gap_md]}>
            {q.data.map(item => (
              <StudioBook
                key={item.uri}
                item={item}
                handle={currentAccount.handle}
              />
            ))}
          </View>
        ) : (
          <Notice
            title="Você ainda não tem livros"
            body="Crie um livro, escreva o primeiro capítulo como rascunho e publique quando estiver pronto."
          />
        )}
      </View>
    </BooksShell>
  )
}

function StudioBook({item, handle}: {item: StoredBook; handle: string}) {
  const t = useTheme()
  const pds = useAuthorPdsQuery(item.did)
  const chapters = useChaptersQuery(item.did, item.rkey)
  const {book} = item
  const list = chapters.data ?? []
  const drafts = list.filter(c => c.chapter.status === 'draft').length
  return (
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
      <View style={[a.flex_1, a.gap_xs, {minWidth: 0}]}>
        <Text numberOfLines={2} style={[a.text_md, a.font_bold]}>
          {book.title}
        </Text>
        <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
          {book.visibility === 'public'
            ? 'Público'
            : book.visibility === 'unlisted'
              ? 'Não listado'
              : 'Privado'}{' '}
          · {STATUS_LABELS[book.status]}
          {book.maturity === 'mature' ? ` · ${MATURITY_LABELS.mature}` : ''}
        </Text>
        <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
          {list.length} {list.length === 1 ? 'capítulo' : 'capítulos'}
          {drafts ? ` · ${drafts} em rascunho` : ''}
        </Text>
        <View style={[a.flex_row, a.gap_xs, a.flex_wrap, a.pt_xs]}>
          <PillLink
            to={`/books/studio/book/${item.rkey}/chapter/new`}
            label="Novo capítulo"
          />
          <PillLink
            to={`/books/studio/book/${item.rkey}`}
            label="Editar"
            primary={false}
          />
          <PillLink
            to={bookPath(handle, item.rkey)}
            label="Abrir"
            primary={false}
          />
        </View>
      </View>
    </View>
  )
}
