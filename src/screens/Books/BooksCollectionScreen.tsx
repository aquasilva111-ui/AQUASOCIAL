import {useState} from 'react'
import {Pressable, View} from 'react-native'

import {
  bookPath,
  collectionColumns,
  collectionItems,
  type CollectionTab,
} from '#/lib/books/model'
import {
  coverUrl,
  type StoredBook,
  useAuthorBooksQuery,
  useAuthorPdsQuery,
  useReadingQuery,
} from '#/state/queries/books'
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {BookCover} from '#/components/books/BookCover'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {BooksShell, Notice, PillLink} from './shared'

const TABS: {id: CollectionTab; label: string}[] = [
  {id: 'all', label: 'Tudo'},
  {id: 'reading', label: 'Lendo'},
  {id: 'mine', label: 'Meus livros'},
]

const GAP = 24
const PAD = 24

/**
 * "Minha coleção": covers on a white, square-cornered panel, each with its
 * title underneath and a soft shadow (layout reference: mymind's book view).
 */
export function BooksCollectionScreen() {
  const t = useTheme()
  const {currentAccount} = useSession()
  const reading = useReadingQuery(currentAccount?.did)
  const mine = useAuthorBooksQuery(currentAccount?.did)
  const [tab, setTab] = useState<CollectionTab>('all')
  const [width, setWidth] = useState(0)

  const readingBooks = (reading.data ?? [])
    .map(e => e.stored)
    .filter((s): s is StoredBook => !!s)
  const items = collectionItems(readingBooks, mine.data ?? [], tab)
  const cols = collectionColumns(width)
  const tile = Math.max(
    80,
    Math.floor((width - PAD * 2 - GAP * (cols - 1)) / cols),
  )

  return (
    <BooksShell title="Minha coleção" testID="booksCollectionScreen">
      <View style={[a.p_md]}>
        <View
          onLayout={e => setWidth(e.nativeEvent.layout.width)}
          style={[
            // Square corners on purpose: no border radius on the panel.
            {backgroundColor: '#fff', padding: PAD, gap: 20},
            a.border,
            t.atoms.border_contrast_low,
          ]}>
          <View style={[a.flex_row, a.justify_between, a.align_center]}>
            <View
              style={[
                a.px_md,
                a.py_xs,
                a.rounded_full,
                {backgroundColor: '#eef0f4'},
              ]}>
              <Text style={[a.text_sm, a.font_bold, {color: '#1a1a1a'}]}>
                Livros
              </Text>
            </View>
            <View style={[a.flex_row, a.gap_lg]}>
              {TABS.map(x => {
                const on = x.id === tab
                return (
                  <Pressable
                    key={x.id}
                    accessibilityRole="tab"
                    accessibilityLabel={x.label}
                    accessibilityHint=""
                    accessibilityState={{selected: on}}
                    onPress={() => setTab(x.id)}
                    style={[
                      a.pb_2xs,
                      {
                        borderBottomWidth: 2,
                        borderBottomColor: on ? '#002BEF' : 'transparent',
                      },
                    ]}>
                    <Text
                      style={[a.text_sm, {color: on ? '#1a1a1a' : '#8a8f98'}]}>
                      {x.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
          <View style={{height: 1, backgroundColor: '#e6e8ec'}} />

          {width > 0 &&
            (items.length === 0 ? (
              <Notice
                title="Sua coleção está vazia"
                body="Salve livros na sua leitura ou publique o seu."
              />
            ) : (
              <View style={[a.flex_row, a.flex_wrap, {gap: GAP}]}>
                {items.map(b => (
                  <CollectionTile key={b.uri} item={b} width={tile} />
                ))}
              </View>
            ))}
        </View>
        <View style={[a.flex_row, a.gap_sm, a.pt_md]}>
          <PillLink to="/books" label="Voltar ao Reads" primary={false} />
        </View>
      </View>
    </BooksShell>
  )
}

function CollectionTile({item, width}: {item: StoredBook; width: number}) {
  const pds = useAuthorPdsQuery(item.did)
  return (
    <Link to={bookPath(item.did, item.rkey)} label={item.book.title}>
      <View style={[a.gap_sm, {width}]}>
        <BookCover
          flat
          title={item.book.title}
          url={coverUrl(pds.data, item.did, item.book.cover)}
          width={width}
          ratio={1.5}
        />
        <Text
          numberOfLines={2}
          style={[a.text_xs, a.text_center, {color: '#6b7078'}]}>
          {item.book.title}
        </Text>
      </View>
    </Link>
  )
}
