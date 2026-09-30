import {useCallback, useEffect, useImperativeHandle, useState} from 'react'
import {findNodeHandle, useWindowDimensions, View} from 'react-native'

import {bookPath, MATURITY_LABELS, STATUS_LABELS} from '#/lib/books/model'
import {isIOS, isNative} from '#/platform/detection'
import {
  coverUrl,
  type StoredBook,
  useAuthorBooksQuery,
  useAuthorPdsQuery,
  useReadingQuery,
} from '#/state/queries/books'
import {EmptyState} from '#/view/com/util/EmptyState'
import {List, type ListRef} from '#/view/com/util/List'
import {atoms as a, ios, useTheme} from '#/alf'
import {BookCover} from '#/components/books/BookCover'
import {Button, ButtonText} from '#/components/Button'
import {Book_Stroke2_Corner2_Rounded as BookIcon} from '#/components/icons/Book'
import {Link} from '#/components/Link'
import {ListFooter} from '#/components/Lists'
import {Text} from '#/components/Typography'
import {type SectionRef} from './types'

type Tab = 'published' | 'reading'
type Item =
  | {key: 'tabs'}
  | {key: 'status'; text: string}
  | {key: 'empty'; message: string}
  | {key: string; book: StoredBook}

interface Props {
  ref?: React.Ref<SectionRef>
  did: string
  scrollElRef: ListRef
  headerHeight: number
  isFocused: boolean
  setScrollViewTag: (tag: number | null) => void
}

/** Profile "Livros": the person's published books and what they're reading. */
export function ProfileBooksSection({
  ref,
  did,
  scrollElRef,
  headerHeight,
  isFocused,
  setScrollViewTag,
}: Props) {
  const {height} = useWindowDimensions()
  const [tab, setTab] = useState<Tab>('published')
  const published = useAuthorBooksQuery(did)
  const reading = useReadingQuery(did)

  const onScrollToTop = useCallback(() => {
    scrollElRef.current?.scrollToOffset({
      animated: isNative,
      offset: -headerHeight,
    })
  }, [scrollElRef, headerHeight])
  useImperativeHandle(ref, () => ({scrollToTop: onScrollToTop}))

  useEffect(() => {
    if (isIOS && isFocused && scrollElRef.current) {
      setScrollViewTag(findNodeHandle(scrollElRef.current))
    }
  }, [isFocused, scrollElRef, setScrollViewTag])

  const q = tab === 'published' ? published : reading
  const books: StoredBook[] =
    tab === 'published'
      ? (published.data ?? [])
      : (reading.data ?? []).flatMap(e => (e.stored ? [e.stored] : []))

  const data: Item[] = [{key: 'tabs'}]
  if (q.isLoading) data.push({key: 'status', text: 'Carregando…'})
  else if (q.isError) {
    data.push({key: 'status', text: 'Não foi possível carregar os livros.'})
  } else if (books.length === 0) {
    data.push({
      key: 'empty',
      message:
        tab === 'published'
          ? 'Nenhum livro publicado ainda.'
          : 'Nenhum livro na leitura ainda.',
    })
  } else {
    for (const b of books) data.push({key: b.uri, book: b})
  }

  const renderItem = useCallback(
    ({item}: {item: Item}) => {
      if (item.key === 'tabs') return <Tabs tab={tab} onChange={setTab} />
      if ('text' in item) {
        return <Text style={[a.p_lg]}>{item.text}</Text>
      }
      if ('message' in item) {
        return (
          <View
            style={[{minHeight: Math.max(240, height - headerHeight - 80)}]}>
            <EmptyState
              testID="profileBooksSection-empty"
              icon={BookIcon}
              message={item.message}
              style={{width: '100%'}}
            />
          </View>
        )
      }
      return <BookRow stored={item.book} />
    },
    [tab, height, headerHeight],
  )

  return (
    <View testID="profileBooksSection">
      <List
        testID="profileBooksSection-flatlist"
        ref={scrollElRef}
        data={data}
        keyExtractor={(item: Item) => item.key}
        renderItem={renderItem}
        headerOffset={headerHeight}
        progressViewOffset={ios(0)}
        removeClippedSubviews={true}
        desktopFixedHeight
        contentContainerStyle={{minHeight: height + headerHeight}}
        ListFooterComponent={
          <ListFooter
            height={headerHeight + 180}
            style={a.border_transparent}
          />
        }
      />
    </View>
  )
}

function Tabs({tab, onChange}: {tab: Tab; onChange: (t: Tab) => void}) {
  const opts: {id: Tab; label: string}[] = [
    {id: 'published', label: 'Publicados'},
    {id: 'reading', label: 'Leitura'},
  ]
  return (
    <View style={[a.flex_row, a.gap_sm, a.p_lg]}>
      {opts.map(o => (
        <Button
          key={o.id}
          label={o.label}
          size="small"
          color={tab === o.id ? 'primary' : 'secondary'}
          onPress={() => onChange(o.id)}>
          <ButtonText>{o.label}</ButtonText>
        </Button>
      ))}
    </View>
  )
}

function BookRow({stored}: {stored: StoredBook}) {
  const t = useTheme()
  const pds = useAuthorPdsQuery(stored.did)
  const {book} = stored
  return (
    <View style={[a.px_lg, a.pb_md]}>
      <Link
        to={bookPath(stored.did, stored.rkey)}
        label={`${book.title}, ${STATUS_LABELS[book.status]}`}>
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
            url={coverUrl(pds.data, stored.did, book.cover)}
            width={64}
          />
          <View style={[a.flex_1, a.gap_2xs, {minWidth: 0}]}>
            <Text numberOfLines={2} style={[a.text_md, a.font_bold]}>
              {book.title}
            </Text>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              {STATUS_LABELS[book.status]}
              {book.maturity === 'mature' ? ` · ${MATURITY_LABELS.mature}` : ''}
            </Text>
            {book.synopsis && (
              <Text
                numberOfLines={2}
                style={[a.text_sm, t.atoms.text_contrast_medium]}>
                {book.synopsis}
              </Text>
            )}
          </View>
        </View>
      </Link>
    </View>
  )
}
