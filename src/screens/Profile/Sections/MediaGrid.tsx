import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react'
import {
  findNodeHandle,
  type ListRenderItemInfo,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import {Image} from 'expo-image'
import {AppBskyFeedDefs, AtUri} from '@atproto/api'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {useQueryClient} from '@tanstack/react-query'

import {getPostMedia} from '#/lib/media/experiences'
import {makeProfileLink} from '#/lib/routes/links'
import {cleanError} from '#/lib/strings/errors'
import {logger} from '#/logger'
import {isIOS, isNative, isWeb} from '#/platform/detection'
import {
  POST_TOMBSTONE,
  type Shadow,
  usePostShadow,
} from '#/state/cache/post-shadow'
import {
  type FeedDescriptor,
  type FeedPostSliceItem,
  RQKEY as FEED_RQKEY,
  usePostFeedQuery,
} from '#/state/queries/post-feed'
import {truncateAndInvalidate} from '#/state/queries/util'
import {
  EmptyState,
  type EmptyStateButtonProps,
} from '#/view/com/util/EmptyState'
import {ErrorMessage} from '#/view/com/util/error/ErrorMessage'
import {List, type ListRef} from '#/view/com/util/List'
import {FeedLoadingPlaceholder} from '#/view/com/util/LoadingPlaceholder'
import {LoadMoreRetryBtn} from '#/view/com/util/LoadMoreRetryBtn'
import {atoms as a, ios, useTheme, web} from '#/alf'
import {MediaMask} from '#/components/feeds/MediaCard'
import {EditBig_Stroke1_Corner0_Rounded as EditIcon} from '#/components/icons/EditBig'
import {Heart2_Filled_Stroke2_Corner0_Rounded as HeartIcon} from '#/components/icons/Heart2'
import {Message_Stroke2_Corner0_Rounded_Filled as CommentIcon} from '#/components/icons/Message'
import {Pin_Filled_Corner0_Rounded as PinIcon} from '#/components/icons/Pin'
import {Play_Filled_Corner0_Rounded as PlayIcon} from '#/components/icons/Play'
import {SquareBehindSquare4_Stroke2_Corner0_Rounded as MultiIcon} from '#/components/icons/SquareBehindSquare4'
import {Link} from '#/components/Link'
import {ListFooter} from '#/components/Lists'
import * as Hider from '#/components/moderation/Hider'
import {Text} from '#/components/Typography'
import {type SectionRef} from './types'

const GRID_COLUMNS = 3
const GRID_GAP = 2

interface MediaGridItem {
  key: string
  item: FeedPostSliceItem
  isPinned: boolean
}

interface MediaGridSectionProps {
  ref?: React.Ref<SectionRef>
  feed: FeedDescriptor
  headerHeight: number
  isFocused: boolean
  scrollElRef: ListRef
  ignoreFilterFor?: string
  setScrollViewTag: (tag: number | null) => void
  emptyStateMessage?: string
  emptyStateButton?: EmptyStateButtonProps
  emptyStateIcon?: React.ComponentType<any> | React.ReactElement
}

export function ProfileMediaGridSection({
  ref,
  feed,
  headerHeight,
  isFocused,
  scrollElRef,
  ignoreFilterFor,
  setScrollViewTag,
  emptyStateMessage,
  emptyStateButton,
  emptyStateIcon,
}: MediaGridSectionProps) {
  const {_} = useLingui()
  const queryClient = useQueryClient()
  const [isPTRing, setIsPTRing] = useState(false)
  const {height} = useWindowDimensions()
  const {
    data,
    isPending,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    isError,
    error,
    refetch,
  } = usePostFeedQuery(feed, undefined, {enabled: isFocused, ignoreFilterFor})

  const items = useMemo(() => {
    const out: MediaGridItem[] = []
    for (const page of data?.pages ?? []) {
      for (const slice of page.slices) {
        if (slice.isFallbackMarker) continue
        const item = slice.items[0]
        if (!item) continue
        if (item.moderation.ui('contentList').filter) continue
        if (item.moderation.ui('contentMedia').filter) continue
        const media = getPostMedia(item.post)
        if (media.type === 'images' && media.view.images.length === 0) continue
        if (media.type !== 'images' && media.type !== 'video') continue
        out.push({
          key: item._reactKey,
          item,
          isPinned: AppBskyFeedDefs.isReasonPin(slice.reason),
        })
      }
    }
    return out
  }, [data])

  const isEmpty = !isPending && !isError && items.length === 0

  const onScrollToTop = useCallback(() => {
    scrollElRef.current?.scrollToOffset({
      animated: isNative,
      offset: -headerHeight,
    })
    truncateAndInvalidate(queryClient, FEED_RQKEY(feed))
  }, [scrollElRef, headerHeight, queryClient, feed])

  useImperativeHandle(ref, () => ({
    scrollToTop: onScrollToTop,
  }))

  const onRefresh = useCallback(async () => {
    setIsPTRing(true)
    try {
      await refetch()
    } catch (err) {
      logger.error('Failed to refresh media grid', {message: err})
    }
    setIsPTRing(false)
  }, [refetch])

  const onEndReached = useCallback(async () => {
    if (isFetchingNextPage || !hasNextPage || isError) return
    try {
      await fetchNextPage()
    } catch (err) {
      logger.error('Failed to load more media', {message: err})
    }
  }, [isFetchingNextPage, hasNextPage, isError, fetchNextPage])

  const onPressRetryLoadMore = useCallback(() => {
    fetchNextPage()
  }, [fetchNextPage])

  useEffect(() => {
    if (isIOS && isFocused && scrollElRef.current) {
      const nativeTag = findNodeHandle(scrollElRef.current)
      setScrollViewTag(nativeTag)
    }
  }, [isFocused, scrollElRef, setScrollViewTag])

  const renderItem = useCallback(
    ({item}: ListRenderItemInfo<MediaGridItem>) => {
      return <MediaTile item={item.item} isPinned={item.isPinned} />
    },
    [],
  )

  const renderEmpty = useCallback(() => {
    if (isPending) {
      return <FeedLoadingPlaceholder />
    }
    if (isError) {
      return (
        <ErrorMessage message={cleanError(error)} onPressTryAgain={refetch} />
      )
    }
    return (
      <View style={[a.flex_1, a.justify_center, a.align_center]}>
        <EmptyState
          style={{width: '100%'}}
          icon={emptyStateIcon || EditIcon}
          iconSize="3xl"
          message={emptyStateMessage || _(msg`No media yet`)}
          button={emptyStateButton}
        />
      </View>
    )
  }, [
    _,
    isPending,
    isError,
    error,
    refetch,
    emptyStateButton,
    emptyStateIcon,
    emptyStateMessage,
  ])

  const renderFooter = useCallback(() => {
    if (isError && !isEmpty) {
      return (
        <LoadMoreRetryBtn
          label={_(
            msg`There was an issue fetching media. Tap here to try again.`,
          )}
          onPress={onPressRetryLoadMore}
        />
      )
    }
    if (isEmpty) return null
    return (
      <ListFooter
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onRetry={fetchNextPage}
        error={cleanError(error)}
        height={180 + headerHeight}
      />
    )
  }, [
    _,
    isError,
    isEmpty,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    error,
    headerHeight,
    onPressRetryLoadMore,
  ])

  return (
    <View>
      <List
        testID="profileMediaGrid"
        ref={scrollElRef}
        data={items}
        keyExtractor={item => item.key}
        renderItem={renderItem}
        numColumns={GRID_COLUMNS}
        columnWrapperStyle={{gap: GRID_GAP}}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        refreshing={isPTRing}
        onRefresh={onRefresh}
        headerOffset={headerHeight}
        progressViewOffset={ios(0)}
        removeClippedSubviews={true}
        desktopFixedHeight
        onEndReached={onEndReached}
        onEndReachedThreshold={3}
        contentContainerStyle={{
          minHeight: height + headerHeight,
          paddingBottom: 120,
        }}
      />
    </View>
  )
}

function MediaTile({
  item,
  isPinned,
}: {
  item: FeedPostSliceItem
  isPinned: boolean
}) {
  const post = usePostShadow(item.post)
  if (post === POST_TOMBSTONE) return null
  return <MediaTileInner item={{...item, post}} isPinned={isPinned} />
}

function MediaTileInner({
  item,
  isPinned,
}: {
  item: FeedPostSliceItem & {post: Shadow<AppBskyFeedDefs.PostView>}
  isPinned: boolean
}) {
  const t = useTheme()
  const {_} = useLingui()
  const {post, record, moderation} = item
  const [hover, setHover] = useState(false)
  const media = getPostMedia(post)
  const modui = useMemo(() => {
    const list = moderation.ui('contentList')
    const image = moderation.ui('contentMedia')
    list.blurs = [...list.blurs, ...image.blurs]
    list.alerts = [...list.alerts, ...image.alerts]
    list.filters = [...list.filters, ...image.filters]
    return list
  }, [moderation])

  if (modui.filter || (media.type !== 'images' && media.type !== 'video')) {
    return null
  }

  const images = media.type === 'images' ? media.view.images : undefined
  const thumbnail =
    images?.[0]?.thumb ??
    (media.type === 'video' ? media.view.thumbnail : undefined)
  const alt = images?.[0]?.alt || record.text
  const rkey = new AtUri(post.uri).rkey
  const href = makeProfileLink(post.author, 'post', rkey)

  return (
    <View style={[a.flex_1, {marginBottom: GRID_GAP}]}>
      <Hider.Outer modui={modui}>
        <Hider.Mask>
          <MediaMask aspectRatio={1} />
        </Hider.Mask>
        <Hider.Content>
          <View
            {...web({
              onPointerEnter: () => setHover(true),
              onPointerLeave: () => setHover(false),
            })}>
            <Link to={href} label={alt || 'View post'} style={[a.w_full]}>
              <View
                style={[
                  a.w_full,
                  a.overflow_hidden,
                  t.atoms.bg_contrast_25,
                  {aspectRatio: 1},
                ]}>
                <Image
                  accessibilityIgnoresInvertColors
                  accessibilityHint={_(msg`Opens the original post`)}
                  source={thumbnail ? {uri: thumbnail} : undefined}
                  style={[a.w_full, a.h_full]}
                  contentFit="cover"
                  accessibilityLabel={alt}
                  transition={150}
                  recyclingKey={post.uri}
                />
              </View>
            </Link>
            <View
              pointerEvents="none"
              style={[a.absolute, a.inset_0, {padding: 6}]}>
              {isPinned && (
                <View style={styles.badgeChip}>
                  <PinIcon size="xs" fill="#fff" />
                </View>
              )}
              <View
                style={[
                  a.absolute,
                  a.flex_row,
                  a.align_center,
                  {top: 6, right: 6, gap: 4},
                ]}>
                {images && images.length > 1 && (
                  <View style={styles.badgeChip}>
                    <MultiIcon size="xs" fill="#fff" />
                  </View>
                )}
                {media.type === 'video' && (
                  <View style={styles.badgeChip}>
                    <PlayIcon size="xs" fill="#fff" />
                  </View>
                )}
              </View>
              {isWeb && hover && (
                <View
                  style={[
                    a.absolute,
                    a.inset_0,
                    a.justify_center,
                    a.align_center,
                    a.flex_row,
                    {gap: 18, backgroundColor: 'rgba(0,0,0,0.4)'},
                  ]}>
                  <View style={[a.flex_row, a.align_center, {gap: 5}]}>
                    <HeartIcon size="sm" fill="#fff" />
                    <Text style={styles.hoverStat}>{post.likeCount ?? 0}</Text>
                  </View>
                  <View style={[a.flex_row, a.align_center, {gap: 5}]}>
                    <CommentIcon size="sm" fill="#fff" />
                    <Text style={styles.hoverStat}>{post.replyCount ?? 0}</Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        </Hider.Content>
      </Hider.Outer>
    </View>
  )
}

const styles = StyleSheet.create({
  badgeChip: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hoverStat: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
})
