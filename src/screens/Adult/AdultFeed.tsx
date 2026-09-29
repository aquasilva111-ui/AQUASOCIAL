import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useSyncExternalStore} from 'react'
import {View} from 'react-native'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {useIsFocused} from '@react-navigation/native'

import {toAdultPosts} from '#/lib/adult/content'
import {DISCOVER_FEED_URI} from '#/lib/constants'
import {useAdultContext} from '#/state/adult/context'
import {
  getAdultRelationshipsSnapshot,
  isCreatorBlocked,
  isCreatorMuted,
  subscribeAdultRelationships,
} from '#/state/adult/relationships'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {type FeedDescriptor, usePostFeedQuery} from '#/state/queries/post-feed'
import {List} from '#/view/com/util/List'
import {atoms as a, useTheme} from '#/alf'
import {AdultPostCard} from '#/components/adult/AdultPostCard'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'
import {AdultShell} from './AdultShell'

type AdultFeedSource = 'following' | 'discover'

/**
 * /adult/feed — the +18 home feed.
 *
 * Real AQUA/AT content only: posts self-labeled as adult, from the existing
 * paginated feed queries (cursor-based). Deterministic sources for now —
 * Following and Discover — with the recommendation firewall intact: nothing
 * here reads or writes the social action history.
 */
export function AdultFeedScreen() {
  const {_} = useLingui()
  return (
    <AdultShell title={_(msg`Feed +18`)} testID="adultFeedScreen">
      <AdultFeedInner />
    </AdultShell>
  )
}

function AdultFeedInner() {
  const {_} = useLingui()
  const t = useTheme()
  const focused = useIsFocused()
  const ctx = useAdultContext()
  const moderationOpts = useModerationOpts()
  const [source, setSource] = useState<AdultFeedSource>('following')
  // Re-render when creator relationships change (block/mute filters below).
  useSyncExternalStore(
    subscribeAdultRelationships,
    getAdultRelationshipsSnapshot,
  )

  const descriptor: FeedDescriptor =
    source === 'following' ? 'following' : `feedgen|${DISCOVER_FEED_URI}`
  const feed = usePostFeedQuery(descriptor, undefined, {
    enabled: focused && ctx.adultAccessEnabled,
  })

  const did = ctx.identity?.did
  const posts = useMemo(() => {
    if (!moderationOpts || !did) return []
    const candidates =
      feed.data?.pages.flatMap(page =>
        page.slices.flatMap(slice => slice.items),
      ) ?? []
    return toAdultPosts(candidates).filter(
      post =>
        !isCreatorBlocked(did, post.creatorId) &&
        !isCreatorMuted(did, post.creatorId),
    )
  }, [moderationOpts, did, feed.data])

  const {hasNextPage, isFetching, isError, fetchNextPage} = feed
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetching && !isError) fetchNextPage()
  }, [hasNextPage, isFetching, isError, fetchNextPage])

  // Pages of non-adult posts shouldn't stall the feed: pull a few more.
  const emptyScans = useRef(0)
  useEffect(() => {
    emptyScans.current = 0
  }, [source])
  useEffect(() => {
    if (
      !posts.length &&
      hasNextPage &&
      !isFetching &&
      !isError &&
      emptyScans.current < 3
    ) {
      emptyScans.current++
      loadMore()
    }
  }, [posts.length, hasNextPage, isFetching, isError, loadMore])

  return (
    <View style={[a.flex_1]}>
      <View style={[a.flex_row, a.gap_xs, a.p_md]}>
        <Button
          label={_(msg`Seguindo`)}
          size="small"
          variant={source === 'following' ? 'solid' : 'ghost'}
          color="secondary"
          onPress={() => setSource('following')}>
          <ButtonText>{_(msg`Seguindo`)}</ButtonText>
        </Button>
        <Button
          label={_(msg`Descobrir`)}
          size="small"
          variant={source === 'discover' ? 'solid' : 'ghost'}
          color="secondary"
          onPress={() => setSource('discover')}>
          <ButtonText>{_(msg`Descobrir`)}</ButtonText>
        </Button>
      </View>

      <List
        data={posts}
        keyExtractor={post => post.id}
        renderItem={({item}) => <AdultPostCard post={item} />}
        onEndReached={posts.length ? loadMore : undefined}
        onEndReachedThreshold={2}
        windowSize={7}
        contentContainerStyle={{paddingBottom: 120}}
        ListEmptyComponent={
          <View style={[a.align_center, a.gap_sm, a.px_xl, {paddingTop: 96}]}>
            {isFetching ? (
              <Text
                style={[a.text_md, t.atoms.text_contrast_medium]}
                accessibilityRole="progressbar">
                {_(msg`Carregando…`)}
              </Text>
            ) : isError ? (
              <>
                <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
                  {_(msg`Não foi possível carregar o feed.`)}
                </Text>
                <Button
                  label={_(msg`Tentar novamente`)}
                  size="small"
                  onPress={() => feed.refetch()}>
                  <ButtonText>{_(msg`Tentar novamente`)}</ButtonText>
                </Button>
              </>
            ) : (
              <Text
                style={[
                  a.text_md,
                  a.text_center,
                  t.atoms.text_contrast_medium,
                ]}>
                {source === 'following'
                  ? _(
                      msg`Nenhum conteúdo +18 de criadores que você segue por aqui ainda.`,
                    )
                  : _(
                      msg`Nenhum conteúdo +18 encontrado nas páginas carregadas.`,
                    )}
              </Text>
            )}
          </View>
        }
        ListFooterComponent={
          hasNextPage ? (
            <View style={[a.align_center, a.py_md]}>
              <Button
                label={_(msg`Carregar mais`)}
                size="small"
                onPress={loadMore}>
                <ButtonText>{_(msg`Carregar mais`)}</ButtonText>
              </Button>
            </View>
          ) : null
        }
      />
    </View>
  )
}
