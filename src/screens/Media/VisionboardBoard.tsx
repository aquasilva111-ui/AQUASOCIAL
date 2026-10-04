import {useMemo} from 'react'
import {Pressable, ScrollView, View} from 'react-native'

import {
  type Interest,
  interests as allInterests,
  popularInterests,
  useInterestsDisplayNames,
} from '#/lib/interests'
import {type VisionboardItem} from '#/lib/visionboard/model'
import {type FeedPostSliceItem} from '#/state/queries/post-feed'
import {usePreferencesQuery} from '#/state/queries/preferences'
import {useSession} from '#/state/session'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {VisionboardMasonry} from '#/components/visionboard/VisionboardMasonry'
import {
  type VisionboardTab,
  VisionboardTopBar,
} from '#/components/visionboard/VisionboardTopBar'

const MAX_CHIPS = 12

export type VisionboardStatus = 'loading' | 'error' | 'empty' | 'idle' | 'ready'

/**
 * Full-page Visionboard (web): the network-wide visual feed with its own
 * header, like Aqua Views. Content, saves, search and moderation all come
 * from the AQUA data layer via MediaHome; this only renders.
 */
export function VisionboardBoard<T extends string>({
  tabs,
  source,
  onSelectSource,
  draft,
  onChangeDraft,
  onSubmitSearch,
  onClearSearch,
  query,
  interest,
  onSelectInterest,
  items,
  status,
  onRetry,
  onLoadMore,
  onItemSeen,
}: {
  tabs: VisionboardTab<T>[]
  source: T
  onSelectSource: (value: T) => void
  draft: string
  onChangeDraft: (value: string) => void
  onSubmitSearch: () => void
  onClearSearch: () => void
  query: string
  interest: Interest | undefined
  onSelectInterest: (value: Interest | undefined, name: string) => void
  items: VisionboardItem[]
  status: VisionboardStatus
  onRetry: () => void
  onLoadMore?: () => void
  onItemSeen: (item: FeedPostSliceItem) => void
}) {
  const t = useTheme()
  const {hasSession} = useSession()
  const {setShowLoggedOut} = useLoggedOutViewControls()
  // Bluesky only serves post search to signed-in users.
  const needsSignIn = !hasSession && !!query && status === 'error'
  const names = useInterestsDisplayNames()
  const {data: preferences} = usePreferencesQuery()

  // The viewer's own topics first, then the most popular ones.
  const chips = useMemo(() => {
    const mine = (preferences?.interests.tags ?? []).filter(
      (tag): tag is Interest =>
        (allInterests as readonly string[]).includes(tag),
    )
    return [
      ...new Set<Interest>([...mine, ...popularInterests, ...allInterests]),
    ].slice(0, MAX_CHIPS)
  }, [preferences?.interests.tags])

  const header = (
    <View style={[a.gap_md, {paddingTop: 12, paddingBottom: 18}]}>
      {!!query && (
        <Text style={[{fontSize: 30, fontWeight: '700', letterSpacing: -0.5}]}>
          Resultados para “{query}”
        </Text>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{gap: 28, paddingHorizontal: 4}}>
        <Tab
          label="Todos"
          active={!interest && !query}
          onPress={() => onSelectInterest(undefined, '')}
        />
        {chips.map(value => (
          <Tab
            key={value}
            label={names[value]}
            active={interest === value}
            onPress={() => onSelectInterest(value, names[value])}
          />
        ))}
      </ScrollView>
      {status !== 'ready' && (
        <View style={[a.flex_row, a.align_center, a.gap_md]}>
          <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
            {needsSignIn
              ? 'Entre na sua conta para buscar imagens por tema.'
              : status === 'loading'
                ? 'Carregando imagens…'
                : status === 'error'
                  ? 'Não foi possível carregar as imagens.'
                  : status === 'idle'
                    ? 'Busque por um tema ou criador.'
                    : 'Nenhuma imagem por aqui ainda.'}
          </Text>
          {needsSignIn ? (
            <Button
              label="Entrar"
              size="small"
              color="primary"
              onPress={() => setShowLoggedOut(true)}>
              <ButtonText>Entrar</ButtonText>
            </Button>
          ) : (
            status === 'error' && (
              <Button
                label="Tentar novamente"
                size="small"
                color="secondary"
                onPress={onRetry}>
                <ButtonText>Tentar novamente</ButtonText>
              </Button>
            )
          )}
        </View>
      )}
    </View>
  )

  return (
    <Layout.Screen testID="aqua-images" hideCenterBorders>
      <VisionboardTopBar
        tabs={tabs}
        activeTab={source}
        onSelectTab={onSelectSource}
        search={draft}
        onChangeSearch={onChangeDraft}
        onSubmitSearch={onSubmitSearch}
        onClearSearch={onClearSearch}
      />
      <View style={[a.w_full, a.px_lg]}>
        <VisionboardMasonry
          variant="board"
          header={header}
          items={items}
          onLoadMore={onLoadMore}
          onItemSeen={onItemSeen}
        />
      </View>
    </Layout.Screen>
  )
}

/** Category tab: quiet text with an underline on the active one. */
function Tab({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  const t = useTheme()
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{selected: active}}
      accessibilityLabel={label}
      accessibilityHint=""
      onPress={onPress}
      style={[
        {
          paddingVertical: 6,
          borderBottomWidth: 3,
          borderBottomColor: active ? t.palette.contrast_900 : 'transparent',
        },
      ]}>
      <Text
        style={[
          a.text_lg,
          {fontWeight: active ? '600' : '500'},
          active ? t.atoms.text : t.atoms.text_contrast_medium,
        ]}>
        {label}
      </Text>
    </Pressable>
  )
}
