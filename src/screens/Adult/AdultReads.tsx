import {useState} from 'react'
import {View} from 'react-native'
import {useQuery} from '@tanstack/react-query'

import {adultApi, type AdultBook} from '#/lib/adult/api'
import {adultQueryKey} from '#/lib/adult/isolation'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {useAgent} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {AdultAreaEmpty, AdultAreaNote} from '#/components/adult/AdultAreaParts'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {AdultShell} from './AdultShell'
import {AdultApiNotice} from './AdultViews'

const CHARACTER_RULE =
  'Regra obrigatória: todos os personagens têm 18 anos ou mais.'

/**
 * /adult/reads — serial stories. Own +18 storage; never the social Reads
 * graph. Every story declares each character's age and none can be under 18
 * (enforced by the API and the database).
 */
export function AdultReadsScreen() {
  const agent = useAgent()
  const t = useTheme()
  const books = useQuery({
    queryKey: adultQueryKey('reads', 'books', agent.session?.did),
    queryFn: () => adultApi<{books: AdultBook[]}>(agent, '/reads/books'),
  })
  return (
    <AdultShell title="Reads +18" testID="adultReadsScreen">
      <View style={[a.p_lg, a.gap_lg]}>
        {books.error ? (
          <AdultApiNotice error={books.error} onRetry={() => books.refetch()} />
        ) : books.isLoading ? (
          <Text style={[a.p_lg]}>Carregando…</Text>
        ) : books.data?.books.length ? (
          <View style={[a.gap_md]}>
            {books.data.books.map(b => (
              <Link
                key={b.id}
                to={`/adult/reads/${b.id}`}
                label={b.title}
                style={[a.flex_col, a.gap_2xs]}>
                <Text style={[a.text_md, a.font_bold]}>{b.title}</Text>
                <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                  {`${b.author.handle ? `@${b.author.handle}` : 'Autor'} · ${
                    b.parts
                  } partes`}
                </Text>
              </Link>
            ))}
          </View>
        ) : (
          <AdultAreaEmpty
            title="Ainda não há histórias +18"
            description="Histórias em partes de autores verificados vão aparecer aqui."
          />
        )}
        <AdultAreaNote text={CHARACTER_RULE} />
      </View>
    </AdultShell>
  )
}

type BookDetail = {
  id: string
  title: string
  description: string | null
  author: {did: string; handle: string | null}
  characters: {name: string; age: number}[]
  parts: {number: number; title: string | null}[]
}

/** /adult/reads/:bookId — reader: characters, then one part at a time. */
export function AdultReadScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'AdultRead'>) {
  const {bookId} = route.params
  const agent = useAgent()
  const t = useTheme()
  const [number, setNumber] = useState(1)
  const book = useQuery({
    queryKey: adultQueryKey('reads', 'book', bookId, agent.session?.did),
    queryFn: () =>
      adultApi<BookDetail>(agent, `/reads/books/${encodeURIComponent(bookId)}`),
  })
  const part = useQuery({
    queryKey: adultQueryKey(
      'reads',
      'part',
      bookId,
      number,
      agent.session?.did,
    ),
    queryFn: () =>
      adultApi<{number: number; title: string | null; body: string}>(
        agent,
        `/reads/books/${encodeURIComponent(bookId)}/parts/${number}`,
      ),
    enabled: !!book.data,
  })
  const total = book.data?.parts.length ?? 0
  return (
    <AdultShell title="Reads +18" testID="adultReadScreen">
      <View style={[a.p_lg, a.gap_lg]}>
        {book.error ? (
          <AdultApiNotice error={book.error} onRetry={() => book.refetch()} />
        ) : book.isLoading || !book.data ? (
          <Text style={[a.p_lg]}>Carregando…</Text>
        ) : (
          <>
            <Text style={[a.text_xl, a.font_bold]}>{book.data.title}</Text>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              {`Parte ${number} de ${total}`}
            </Text>
            <AdultAreaNote text="Aviso de conteúdo: ficção adulta. Todos os personagens têm 18 anos ou mais." />
            {part.error ? (
              <AdultApiNotice
                error={part.error}
                onRetry={() => part.refetch()}
              />
            ) : (
              <Text style={[a.text_md, {lineHeight: 26}]}>
                {part.data?.body ?? 'Carregando…'}
              </Text>
            )}
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              {`Personagens: ${book.data.characters
                .map(c => `${c.name} (${c.age})`)
                .join(', ')}`}
            </Text>
            <View style={[a.flex_row, a.gap_sm]}>
              <Button
                label="Anterior"
                size="large"
                color="secondary"
                disabled={number <= 1}
                onPress={() => setNumber(n => Math.max(1, n - 1))}>
                <ButtonText>Anterior</ButtonText>
              </Button>
              <Button
                label="Próxima"
                size="large"
                color="primary"
                disabled={number >= total}
                onPress={() => setNumber(n => Math.min(total, n + 1))}>
                <ButtonText>Próxima</ButtonText>
              </Button>
            </View>
          </>
        )}
      </View>
    </AdultShell>
  )
}
