import {useEffect, useState} from 'react'
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {BlurView} from 'expo-blur'
import {LinearGradient} from 'expo-linear-gradient'
import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {
  DEFAULT_WIKI_LANG,
  isRtl,
  WIKI_LANGUAGES,
  type WikiEntry,
} from '#/lib/wiki/model'
import {useDocsApi} from '#/state/docs/store'
import {useWikiEntry, useWikiSearch} from '#/state/queries/wiki'
import * as Layout from '#/components/Layout'
import {CountryPanel, MoleculePanel, NasaPanel} from './SourcePanels'
import {bliss, oskon} from './theme'

export function Glass({
  children,
  style,
}: {
  children: React.ReactNode
  style?: object
}) {
  return (
    <BlurView intensity={30} tint="light" style={[s.glass, style]}>
      {children}
    </BlurView>
  )
}

export function GlossyButton({
  label,
  onPress,
  colors,
  on,
}: {
  label: string
  onPress: () => void
  colors: readonly [string, string, string, string]
  on?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint=""
      accessibilityState={{selected: !!on}}
      onPress={onPress}>
      <LinearGradient
        colors={
          on ? [...bliss.pillOn] : [colors[0], colors[1], colors[2], colors[3]]
        }
        locations={on ? [0, 1] : [0, 0.5, 0.51, 1]}
        style={s.pill}>
        <Text style={s.pillText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  )
}

type Source = 'wikipedia' | 'nasa' | 'molecules' | 'countries'
const SOURCES: [Source, string][] = [
  ['wikipedia', 'Wikipedia'],
  ['nasa', 'NASA'],
  ['molecules', 'Moléculas'],
  ['countries', 'Países'],
]

export function WikiHomeScreen() {
  const navigation = useNavigation<NavigationProp>()
  const {createDoc} = useDocsApi()
  const [source, setSource] = useState<Source>('wikipedia')
  const [lang, setLang] = useState(DEFAULT_WIKI_LANG)
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [title, setTitle] = useState<string | undefined>()

  useEffect(() => {
    const t = setTimeout(() => setQuery(input), 350)
    return () => clearTimeout(t)
  }, [input])

  const search = useWikiSearch(lang, query)
  const entry = useWikiEntry(lang, title)
  const rtl = isRtl(lang)
  const data: WikiEntry | undefined = entry.data

  const saveToDocs = () => {
    const doc = data && createDoc(data.title)
    if (doc) navigation.navigate('DocEditor', {id: doc.id})
  }

  return (
    <Layout.Screen testID="wikiHomeScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>AQUA WIKI</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>

      <LinearGradient
        colors={[bliss.skyTop, bliss.skyMid, bliss.skyLow]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[bliss.grassTop, bliss.grassBottom]}
        style={s.grass}
        pointerEvents="none"
      />

      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.hero} accessibilityRole="header">
          Uma nova forma de saber
        </Text>

        <Glass style={s.searchBox}>
          <TextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => setQuery(input)}
            placeholder="Pesquisar na Wikipedia"
            placeholderTextColor="rgba(255,255,255,0.75)"
            accessibilityLabel="Pesquisar"
            accessibilityHint="Escreve o nome de uma entrada da Wikipedia"
            autoCapitalize="none"
            autoCorrect={false}
            style={[s.searchInput, rtl && {textAlign: 'right'}]}
          />
        </Glass>

        <View style={s.chips}>
          {SOURCES.map(([id, label]) => (
            <GlossyButton
              key={id}
              label={label}
              colors={bliss.go}
              on={id === source}
              onPress={() => setSource(id)}
            />
          ))}
        </View>

        {source === 'nasa' && <NasaPanel query={query} />}
        {source === 'molecules' && <MoleculePanel query={query} />}
        {source === 'countries' && <CountryPanel query={query} />}

        {source === 'wikipedia' && (
          <Glass style={s.card}>
            <Text style={s.small}>
              {WIKI_LANGUAGES.length} idiomas · wikipedia.org
            </Text>
            <View style={s.chips}>
              {WIKI_LANGUAGES.map(l => (
                <GlossyButton
                  key={l.code}
                  label={l.name}
                  colors={bliss.pill}
                  on={l.code === lang}
                  onPress={() => {
                    setLang(l.code)
                    setTitle(undefined)
                  }}
                />
              ))}
            </View>
          </Glass>
        )}

        {source === 'wikipedia' && query.trim().length >= 2 && !title && (
          <Glass style={s.card}>
            {search.isLoading && <Text style={s.body}>A procurar…</Text>}
            {search.isError && (
              <Text style={s.body}>
                Não deu para ligar à Wikipedia. Tenta de novo.
              </Text>
            )}
            {search.data?.length === 0 && (
              <Text style={s.body}>Nada encontrado neste idioma.</Text>
            )}
            {search.data?.map(hit => (
              <Pressable
                key={hit.title}
                accessibilityRole="button"
                onPress={() => setTitle(hit.title)}
                style={s.hit}>
                <Text style={[s.hitTitle, rtl && {textAlign: 'right'}]}>
                  {hit.title}
                </Text>
                {!!hit.description && (
                  <Text style={[s.small, rtl && {textAlign: 'right'}]}>
                    {hit.description}
                  </Text>
                )}
              </Pressable>
            ))}
          </Glass>
        )}

        {source === 'wikipedia' && title && (
          <Glass style={s.card}>
            {entry.isLoading && <Text style={s.body}>A carregar…</Text>}
            {entry.isError && (
              <Text style={s.body}>
                Não deu para carregar a entrada. Tenta de novo.
              </Text>
            )}
            {entry.isSuccess && !data && (
              <Text style={s.body}>Esta entrada não existe neste idioma.</Text>
            )}
            {data && (
              <>
                <Text style={s.small}>
                  [{data.lang.toUpperCase()}]
                  {data.wikidataId ? ` Wikidata ${data.wikidataId}` : ''}
                </Text>
                <Text
                  style={[
                    s.title,
                    rtl && {textAlign: 'right', writingDirection: 'rtl'},
                  ]}
                  accessibilityRole="header">
                  {data.title}
                </Text>
                <Text
                  style={[
                    s.body,
                    rtl && {textAlign: 'right', writingDirection: 'rtl'},
                  ]}>
                  {data.summary}
                </Text>
                <Text style={s.small}>
                  Fonte: {data.source} · {data.license}
                </Text>
                <View style={s.chips}>
                  <GlossyButton
                    label="Salvar na Docs"
                    colors={bliss.go}
                    onPress={saveToDocs}
                  />
                  <GlossyButton
                    label="Abrir fonte"
                    colors={bliss.pill}
                    onPress={() => Linking.openURL(data.url)}
                  />
                  <GlossyButton
                    label="Voltar"
                    colors={bliss.pill}
                    onPress={() => setTitle(undefined)}
                  />
                </View>
              </>
            )}
          </Glass>
        )}
      </ScrollView>
    </Layout.Screen>
  )
}

export const s = StyleSheet.create({
  content: {padding: 16, gap: 14, paddingBottom: 80},
  grass: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 180,
    opacity: 0.9,
  },
  hero: {
    fontFamily: oskon.light,
    fontSize: 40,
    lineHeight: 44,
    color: bliss.white,
    textAlign: 'center',
    textShadowColor: 'rgba(255,255,255,0.7)',
    textShadowRadius: 14,
    marginTop: 8,
  },
  glass: {
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: bliss.glassBorder,
    backgroundColor: bliss.glass,
  },
  searchBox: {borderRadius: 999},
  searchInput: {
    fontFamily: oskon.regular,
    fontSize: 16,
    color: bliss.white,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  card: {padding: 16, gap: 10},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(30,30,120,0.8)',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pillText: {
    fontFamily: oskon.regular,
    fontSize: 14,
    color: bliss.white,
    textShadowColor: 'rgba(0,0,40,0.5)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 1,
  },
  title: {
    fontFamily: oskon.light,
    fontSize: 38,
    lineHeight: 42,
    color: bliss.white,
  },
  body: {
    fontFamily: oskon.regular,
    fontSize: 16,
    lineHeight: 24,
    color: bliss.white,
  },
  small: {
    fontFamily: oskon.italic,
    fontSize: 13,
    color: 'rgba(255,255,255,0.92)',
  },
  hit: {paddingVertical: 8, gap: 2},
  hitTitle: {fontFamily: oskon.regular, fontSize: 17, color: bliss.white},
})
