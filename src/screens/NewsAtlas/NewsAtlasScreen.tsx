import {useCallback, useMemo, useState} from 'react'
import {Pressable, TextInput, View} from 'react-native'

import {atoms as a, useBreakpoints, useTheme} from '#/alf'
import {AquaLogo} from '#/components/icons/AquaLogo'
import {MagnifyingGlass2_Stroke2_Corner0_Rounded as SearchIcon} from '#/components/icons/MagnifyingGlass2'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {
  type Convention,
  conventionById,
  type Focus,
  type NewsItem,
  relatedTo,
  searchAtlas,
} from './data'
import {MiniGlobe, NetworkArt, NewsMediaArt} from './NetworkArt'

const GLOBE_TAGS = [
  {label: 'eleição', top: 8, left: 10},
  {label: 'energia', top: 30, left: -6},
  {label: 'IA', top: 52, left: 62},
  {label: 'migração', top: 70, left: 8},
  {label: 'guerra', top: 4, left: 58},
]

/** Distribute items across columns so cards of different heights make an asymmetric mosaic. */
function columnsOf<T>(items: T[], n: number): T[][] {
  const cols: T[][] = Array.from({length: n}, () => [])
  items.forEach((item, i) => cols[i % n].push(item))
  return cols
}

export function NewsAtlasScreen() {
  const t = useTheme()
  const {gtMobile, gtTablet} = useBreakpoints()
  const [query, setQuery] = useState('')
  const [focus, setFocus] = useState<Focus>(null)
  // touch: a tap pins the focus; web hover previews it
  const [pinned, setPinned] = useState<Focus>(null)

  const result = useMemo(() => searchAtlas(query), [query])
  const active = focus ?? pinned
  const lit = useMemo(() => relatedTo(active), [active])

  const onPin = useCallback((next: NonNullable<Focus>) => {
    setPinned(cur =>
      cur && cur.kind === next.kind && cur.id === next.id ? null : next,
    )
  }, [])

  const newsCols = columnsOf(result.news, gtTablet ? 3 : gtMobile ? 2 : 1)
  const convCols = columnsOf(result.conv, gtTablet ? 3 : 2)

  return (
    <Layout.Screen testID="newsAtlasScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            Notícias e Convenções
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <View style={[a.p_lg, {gap: 28}]}>
          {/* masthead: symbol · search · globe */}
          <View
            style={[
              a.flex_row,
              a.align_center,
              a.gap_lg,
              !gtMobile && a.flex_wrap,
            ]}>
            <AquaLogo size="3xl" />
            <View
              style={[
                a.flex_row,
                a.align_center,
                a.gap_sm,
                a.flex_1,
                {
                  minWidth: 200,
                  maxWidth: 420,
                  height: 42,
                  borderWidth: 2,
                  borderRadius: 99,
                  paddingHorizontal: 14,
                },
                t.atoms.border_contrast_high,
                t.atoms.bg,
              ]}>
              <SearchIcon size="md" style={t.atoms.text} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar na realidade: notícias e convenções"
                placeholderTextColor={t.atoms.text_contrast_medium.color}
                accessibilityLabel="Buscar notícias e convenções"
                accessibilityHint="Filtra notícias e convenções pelo texto digitado"
                style={[
                  a.flex_1,
                  a.text_md,
                  t.atoms.text,
                  {outlineStyle: 'none'} as object,
                ]}
              />
            </View>
            <View
              style={{
                marginLeft: 'auto',
                width: gtMobile ? 150 : 96,
                aspectRatio: 1,
              }}>
              <MiniGlobe />
              {gtMobile &&
                GLOBE_TAGS.map(g => (
                  <View
                    key={g.label}
                    style={[
                      a.absolute,
                      a.px_sm,
                      t.atoms.bg,
                      t.atoms.border_contrast_medium,
                      {
                        top: `${g.top}%`,
                        left: `${g.left}%`,
                        borderWidth: 1,
                        borderRadius: 99,
                        paddingVertical: 1,
                      },
                    ]}>
                    <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                      {g.label}
                    </Text>
                  </View>
                ))}
            </View>
          </View>

          {/* NOTÍCIAS: factual, temporal, editorial */}
          <Section
            title="Notícias"
            hint="O que está acontecendo agora. Toque numa notícia para ver as Convenções que ela ativa."
          />
          {result.news.length === 0 ? (
            <Empty />
          ) : (
            <View style={[a.flex_row, {gap: 24, alignItems: 'flex-start'}]}>
              {newsCols.map((col, ci) => (
                <View
                  key={ci}
                  style={[a.flex_1, {gap: 30, marginTop: ci % 2 ? 36 : 0}]}>
                  {col.map(item => (
                    <NewsCard
                      key={item.id}
                      item={item}
                      dim={!!active && !lit.news.has(item.id)}
                      ring={active?.kind === 'conv' && lit.news.has(item.id)}
                      onHover={setFocus}
                      onPin={onPin}
                    />
                  ))}
                </View>
              ))}
            </View>
          )}

          {/* CONVENÇÕES: persistent semantic structures, drawn as networks */}
          <Section
            title="Convenções"
            hint="Estruturas de significado da realidade. Cada rede mostra uma Convenção e suas relações."
          />
          {result.conv.length === 0 ? (
            <Empty />
          ) : (
            <View style={[a.flex_row, {gap: 18, alignItems: 'flex-start'}]}>
              {convCols.map((col, ci) => (
                <View
                  key={ci}
                  style={[a.flex_1, {gap: 22, marginTop: ci % 2 ? 28 : 0}]}>
                  {col.map(c => (
                    <ConventionCard
                      key={c.id}
                      convention={c}
                      dim={!!active && !lit.conv.has(c.id)}
                      ring={lit.conv.has(c.id) && active?.kind === 'news'}
                      onHover={setFocus}
                      onPin={onPin}
                    />
                  ))}
                </View>
              ))}
            </View>
          )}

          <View
            style={[
              a.pt_lg,
              a.gap_xs,
              {borderTopWidth: 1},
              t.atoms.border_contrast_low,
            ]}>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              <Text style={[a.text_sm, a.font_bold]}>Notícias</Text> são
              temporais: isto aconteceu ou está acontecendo.
            </Text>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              <Text style={[a.text_sm, a.font_bold]}>Convenções</Text> são
              persistentes: isto existe e se relaciona assim.
            </Text>
          </View>
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}

function Section({title, hint}: {title: string; hint: string}) {
  const t = useTheme()
  return (
    <View style={[a.flex_row, a.align_end, a.gap_md, a.flex_wrap]}>
      <Text
        style={[
          {fontSize: 44, lineHeight: 46, letterSpacing: -2, fontWeight: '900'},
          {color: t.palette.primary_500},
        ]}>
        {title}
      </Text>
      <Text
        style={[
          a.text_sm,
          a.flex_1,
          t.atoms.text_contrast_medium,
          {minWidth: 180, maxWidth: 360},
        ]}>
        {hint}
      </Text>
    </View>
  )
}

function Empty() {
  const t = useTheme()
  return (
    <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
      Nada encontrado para essa busca.
    </Text>
  )
}

function NewsCard({
  item,
  dim,
  ring,
  onHover,
  onPin,
}: {
  item: NewsItem
  dim: boolean
  ring: boolean
  onHover: (f: Focus) => void
  onPin: (f: NonNullable<Focus>) => void
}) {
  const t = useTheme()
  const me = {kind: 'news' as const, id: item.id}
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      accessibilityHint="Mostra as convenções relacionadas a esta notícia"
      onPress={() => onPin(me)}
      onHoverIn={() => onHover(me)}
      onHoverOut={() => onHover(null)}
      style={[a.gap_xs, {opacity: dim ? 0.28 : 1}]}>
      <Text
        style={[
          a.text_lg,
          {fontWeight: '900', lineHeight: 22, letterSpacing: -0.4},
          t.atoms.text,
        ]}>
        {item.title}
      </Text>
      <View style={[a.flex_row, a.align_center, a.gap_xs, a.flex_wrap]}>
        {item.live && (
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: '#ff3b30',
            }}
          />
        )}
        <Text style={[a.text_xs, a.font_bold, t.atoms.text]}>
          {item.source}
        </Text>
        <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
          · {item.ago} · {item.tag}
        </Text>
      </View>
      <Text style={[a.text_sm, t.atoms.text]}>{item.summary}</Text>
      <View style={[a.flex_row, a.flex_wrap, {gap: 6, marginVertical: 4}]}>
        {item.conventions.map(id => (
          <View
            key={id}
            style={{
              backgroundColor: '#000',
              borderRadius: 99,
              paddingHorizontal: 9,
              paddingVertical: 3,
            }}>
            <Text style={[a.text_xs, a.font_bold, {color: '#fff'}]}>
              {conventionById(id)?.name}
            </Text>
          </View>
        ))}
      </View>
      <View
        style={[
          a.overflow_hidden,
          {aspectRatio: item.ratio ?? 1.5, borderWidth: 2, borderRadius: 22},
          t.atoms.border_contrast_high,
          t.atoms.bg,
          ring && {borderColor: t.palette.primary_500, borderWidth: 4},
        ]}>
        {item.gradient && <NewsMediaArt gradient={item.gradient} />}
      </View>
    </Pressable>
  )
}

function ConventionCard({
  convention,
  dim,
  ring,
  onHover,
  onPin,
}: {
  convention: Convention
  dim: boolean
  ring: boolean
  onHover: (f: Focus) => void
  onPin: (f: NonNullable<Focus>) => void
}) {
  const t = useTheme()
  const me = {kind: 'conv' as const, id: convention.id}
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Convenção ${convention.name}`}
      accessibilityHint="Mostra as notícias relacionadas a esta convenção"
      onPress={() => onPin(me)}
      onHoverIn={() => onHover(me)}
      onHoverOut={() => onHover(null)}
      style={[a.gap_xs, {opacity: dim ? 0.3 : 1}]}>
      <Text
        style={[
          a.text_lg,
          {fontWeight: '900', letterSpacing: -0.4, marginLeft: 6},
          t.atoms.text,
        ]}
        numberOfLines={1}>
        {convention.name}
      </Text>
      <View
        style={[
          a.overflow_hidden,
          {
            aspectRatio: convention.ratio,
            borderRadius: 30,
            backgroundColor: '#05070d',
          },
          ring && {borderWidth: 4, borderColor: t.palette.primary_500},
        ]}>
        <NetworkArt convention={convention} />
      </View>
      <Text
        style={[a.text_xs, t.atoms.text_contrast_medium, {marginLeft: 6}]}
        numberOfLines={1}>
        ↔ {convention.related.join(' · ')}
      </Text>
    </Pressable>
  )
}
