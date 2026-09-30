import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {ScrollView, TextInput, View} from 'react-native'
import {AppBskyFeedDefs, AppBskyFeedPost, moderatePost} from '@atproto/api'
import {useIsFocused, useRoute} from '@react-navigation/native'

import {DISCOVER_FEED_URI} from '#/lib/constants'
import {usePostViewTracking} from '#/lib/hooks/usePostViewTracking'
import {type Interest} from '#/lib/interests'
import {
  getPostTopics,
  isMediaPost,
  type MediaExperience,
} from '#/lib/media/experiences'
import {toVisionboardItems} from '#/lib/visionboard/model'
import {isNative, isWeb} from '#/platform/detection'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {useBookmarksQuery} from '#/state/queries/bookmarks/useBookmarksQuery'
import {
  type FeedDescriptor,
  type FeedPostSliceItem,
  usePostFeedQuery,
} from '#/state/queries/post-feed'
import {useSearchPostsQuery} from '#/state/queries/search-posts'
import {useSession} from '#/state/session'
import {useSelectedFeed} from '#/state/shell/selected-feed'
import {atoms as a, useTheme, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {LiveNowSection} from '#/components/feeds/LiveNowSection'
import {MediaGallery} from '#/components/feeds/MediaGallery'
import {ViewsAdFrames} from '#/components/feeds/ViewsAdFrames'
import {SearchInput} from '#/components/forms/SearchInput'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {VisionboardMasonry} from '#/components/visionboard/VisionboardMasonry'
import * as bsky from '#/types/bsky'
import {VideosNavSidebar} from './VideosNavSidebar'
import {VisionboardBoard} from './VisionboardBoard'

type Source =
  | 'current'
  | 'discover'
  | 'following'
  | 'created'
  | 'saved'
  | 'search'
const labels: Record<Source, string> = {
  current: 'Feed atual',
  discover: 'Para você',
  following: 'Seguindo',
  created: 'Criados',
  saved: 'Salvos',
  search: 'Buscar',
}

export function ImagesScreen() {
  return <MediaHome mode="images" />
}
export function VideosScreen() {
  return <MediaHome mode="video" />
}

function MediaHome({mode}: {mode: MediaExperience}) {
  const t = useTheme()
  const selected = useSelectedFeed()
  const {currentAccount, hasSession} = useSession()
  const focused = useIsFocused()
  const moderationOpts = useModerationOpts()
  // Visionboard is the network-wide visual feed, so it opens on Discover.
  const [source, setSource] = useState<Source>(
    mode === 'images' ? 'discover' : 'current',
  )
  const [interest, setInterest] = useState<Interest | undefined>()
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [topic, setTopic] = useState<string | undefined>()
  const route = useRoute()
  const routeParams = route.params as {source?: Source; q?: string} | undefined
  const trackView = usePostViewTracking('FeedItem')
  const descriptor: FeedDescriptor =
    source === 'following'
      ? 'following'
      : source === 'created' && currentAccount
        ? `author|${currentAccount.did}|posts_with_media`
        : source === 'current' && selected
          ? selected
          : `feedgen|${DISCOVER_FEED_URI}`
  const feed = usePostFeedQuery(descriptor, undefined, {
    enabled: focused && source !== 'search' && source !== 'saved',
  })
  const search = useSearchPostsQuery({
    query,
    sort: 'top',
    enabled: focused && source === 'search' && !!query && !!moderationOpts,
  })
  const saved = useBookmarksQuery({
    enabled: focused && source === 'saved' && hasSession,
  })
  const active =
    source === 'search' ? search : source === 'saved' ? saved : feed
  const candidates = useMemo(() => {
    if (!moderationOpts) return []
    if (source !== 'search' && source !== 'saved')
      return (
        feed.data?.pages.flatMap(page =>
          page.slices.flatMap(slice => slice.items),
        ) ?? []
      )
    const posts =
      source === 'search'
        ? (search.data?.pages.flatMap(page => page.posts) ?? [])
        : (saved.data?.pages.flatMap(page =>
            page.bookmarks.flatMap(bookmark =>
              AppBskyFeedDefs.isPostView(bookmark.item) ? [bookmark.item] : [],
            ),
          ) ?? [])
    return posts.flatMap(post =>
      bsky.dangerousIsType<AppBskyFeedPost.Record>(
        post.record,
        AppBskyFeedPost.isRecord,
      )
        ? [
            {
              _reactKey: post.uri,
              uri: post.uri,
              post,
              record: post.record,
              moderation: moderatePost(post, moderationOpts),
            } satisfies FeedPostSliceItem,
          ]
        : [],
    )
  }, [source, feed.data, search.data, saved.data, moderationOpts])
  const items = useMemo(() => {
    const seen = new Set<string>()
    return candidates.filter(item => {
      if (!isMediaPost(item, mode) || seen.has(item.uri)) return false
      seen.add(item.uri)
      return !topic || getPostTopics(item.post).includes(topic)
    })
  }, [candidates, mode, topic])
  const topics = useMemo(
    () =>
      Array.from(
        new Set(
          candidates
            .filter(item => isMediaPost(item, mode))
            .flatMap(item => getPostTopics(item.post)),
        ),
      ).slice(0, 12),
    [candidates, mode],
  )
  const {hasNextPage, isFetching, isError, fetchNextPage} = active
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetching && !isError) fetchNextPage()
  }, [hasNextPage, isFetching, isError, fetchNextPage])
  const emptyScans = useRef(0)
  useEffect(() => {
    emptyScans.current = 0
  }, [source, query, mode, topic])
  useEffect(() => {
    if (
      !items.length &&
      hasNextPage &&
      !isFetching &&
      !isError &&
      emptyScans.current < 3
    ) {
      emptyScans.current++
      loadMore()
    }
  }, [items.length, hasNextPage, isFetching, isError, loadMore])
  const sources: Source[] = useMemo(
    () =>
      hasSession
        ? ['current', 'discover', 'following', 'created', 'saved', 'search']
        : ['current', 'discover', 'search'],
    [hasSession],
  )
  useEffect(() => {
    const next = routeParams?.source
    if (next && sources.includes(next) && next !== source) {
      setSource(next)
      setTopic(undefined)
    }
  }, [routeParams?.source, sources, source])
  useEffect(() => {
    const q = routeParams?.q
    if (q) {
      setDraft(q)
      setQuery(q)
      setSource('search')
    }
  }, [routeParams?.q])
  const submitSearch = useCallback(() => {
    setQuery(draft.trim())
    setSource('search')
    setTopic(undefined)
  }, [draft])
  const clearSearch = useCallback(() => {
    setDraft('')
    setQuery('')
    setInterest(undefined)
    setSource(mode === 'images' ? 'discover' : 'current')
  }, [mode])
  const isVideoWeb = isWeb && mode === 'video'
  const wideContent = isVideoWeb
    ? {maxWidth: 1200, width: '100%' as const}
    : undefined
  const visibleSources = isVideoWeb
    ? sources.filter(value => value !== 'search')
    : sources
  const controls = (
    <>
      {isVideoWeb ? (
        <View
          style={[
            a.flex_row,
            a.align_center,
            a.gap_sm,
            a.px_lg,
            a.pt_md,
            a.pb_md,
          ]}>
          <View style={[a.flex_1]}>
            <SearchInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={submitSearch}
              onClearText={clearSearch}
              placeholder="Pesquisar vídeos"
              radius={20}
            />
          </View>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[a.gap_xs, a.p_md]}>
          {visibleSources.map(value => (
            <Button
              key={value}
              label={labels[value]}
              size="small"
              variant={source === value ? 'solid' : 'ghost'}
              color="secondary"
              onPress={() => {
                setSource(value)
                setTopic(undefined)
              }}>
              <ButtonText>{labels[value]}</ButtonText>
            </Button>
          ))}
        </ScrollView>
      )}
      {source === 'search' && !isVideoWeb && (
        <View style={[a.flex_row, a.gap_sm, a.px_md, a.pb_sm]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => setQuery(draft.trim())}
            placeholder={mode === 'images' ? 'Buscar imagens' : 'Buscar vídeos'}
            accessibilityLabel="Buscar publicações"
            accessibilityHint="Digite um tema ou criador e confirme a busca"
            returnKeyType="search"
            style={[
              a.flex_1,
              a.border,
              a.rounded_sm,
              a.p_sm,
              t.atoms.text,
              t.atoms.border_contrast_low,
            ]}
          />
          <Button
            label="Buscar"
            size="small"
            variant="solid"
            color="primary"
            onPress={() => setQuery(draft.trim())}>
            <ButtonText>Buscar</ButtonText>
          </Button>
        </View>
      )}
      {topics.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[a.gap_xs, a.px_md, a.pb_sm]}>
          <Button
            label="Todos os temas"
            size="small"
            variant={!topic ? 'solid' : 'ghost'}
            color="secondary"
            onPress={() => setTopic(undefined)}>
            <ButtonText>Todos</ButtonText>
          </Button>
          {topics.map(value => (
            <Button
              key={value}
              label={`#${value}`}
              size="small"
              variant={topic === value ? 'solid' : 'ghost'}
              color="secondary"
              onPress={() => setTopic(value)}>
              <ButtonText>{`#${value}`}</ButtonText>
            </Button>
          ))}
        </ScrollView>
      )}
      {active.isError && (
        <Button
          label="Tentar novamente"
          onPress={() => {
            active.refetch()
          }}>
          <ButtonText>Tentar novamente</ButtonText>
        </Button>
      )}
      {active.isFetching && !items.length && (
        <Text style={[a.p_md]} accessibilityRole="progressbar">
          Carregando...
        </Text>
      )}
      {!active.isFetching && !active.isError && !items.length && (
        <Text style={[a.p_md, t.atoms.text_contrast_medium]}>
          {source === 'search' && !query
            ? 'Busque por um tema ou criador.'
            : 'Nenhuma publicação compatível nas páginas carregadas.'}
        </Text>
      )}
      {/* With results the gallery loads more on scroll; the button is only
          for filters that matched nothing in the pages loaded so far. */}
      {active.hasNextPage && !items.length && !active.isFetching && (
        <View style={[a.align_center, a.pb_sm]}>
          <Button label="Carregar mais" size="small" onPress={loadMore}>
            <ButtonText>Carregar mais</ButtonText>
          </Button>
        </View>
      )}
    </>
  )
  const visionboardItems = useMemo(
    () => (mode === 'images' ? toVisionboardItems(items) : []),
    [items, mode],
  )
  const gallery = (
    <>
      {mode === 'video' && !topic && source !== 'search' && <ViewsAdFrames />}
      {mode === 'video' &&
        !topic &&
        (source === 'current' || source === 'discover') && (
          <LiveNowSection enabled={focused} />
        )}
      {mode === 'images' ? (
        <VisionboardMasonry
          items={visionboardItems}
          onLoadMore={items.length ? loadMore : undefined}
          onItemSeen={item => trackView(item.post)}
        />
      ) : (
        <MediaGallery
          items={items}
          mode={mode}
          onLoadMore={items.length ? loadMore : undefined}
          onItemSeen={item => trackView(item.post)}
        />
      )}
    </>
  )
  if (isWeb && mode === 'images') {
    return (
      <VisionboardBoard
        tabs={sources
          .filter(value => value !== 'search')
          .map(value => ({value, label: labels[value]}))}
        source={source}
        onSelectSource={value => {
          setSource(value)
          setTopic(undefined)
          setInterest(undefined)
        }}
        draft={draft}
        onChangeDraft={setDraft}
        onSubmitSearch={() => {
          setInterest(undefined)
          submitSearch()
        }}
        onClearSearch={clearSearch}
        query={source === 'search' ? query : ''}
        interest={interest}
        onSelectInterest={(value, name) => {
          if (!value) {
            clearSearch()
            return
          }
          setInterest(value)
          setDraft(name)
          setQuery(name)
          setSource('search')
          setTopic(undefined)
        }}
        items={visionboardItems}
        status={
          active.isError
            ? 'error'
            : active.isFetching && !items.length
              ? 'loading'
              : !items.length
                ? source === 'search' && !query
                  ? 'idle'
                  : 'empty'
                : 'ready'
        }
        onRetry={() => active.refetch()}
        onLoadMore={items.length ? loadMore : undefined}
        onItemSeen={item => trackView(item.post)}
      />
    )
  }

  return (
    <Layout.Screen testID={`aqua-${mode}`} hideCenterBorders={isVideoWeb}>
      {!isVideoWeb && (
        <Layout.Header.Outer>
          <Layout.Header.BackButton />
          <Layout.Header.Content>
            <Layout.Header.TitleText>
              {mode === 'images' ? 'Visionboard' : 'Aqua Views'}
            </Layout.Header.TitleText>
          </Layout.Header.Content>
        </Layout.Header.Outer>
      )}
      {isVideoWeb ? (
        <View
          style={[
            a.flex_row,
            a.w_full,
            web({
              alignItems: 'flex-start',
              alignSelf: 'stretch',
              minHeight: '100vh',
              width: '100%',
            }),
          ]}>
          <VideosNavSidebar />
          <View style={[a.flex_1, {minWidth: 0}]}>
            {controls}
            {gallery}
          </View>
        </View>
      ) : (
        <>
          <Layout.Center style={wideContent}>{controls}</Layout.Center>
          <Layout.Center
            style={[
              isNative ? {flex: 1} : undefined,
              wideContent ?? undefined,
            ]}>
            {gallery}
          </Layout.Center>
        </>
      )}
    </Layout.Screen>
  )
}
