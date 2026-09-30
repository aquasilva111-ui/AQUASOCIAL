import {
  type JSX,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {View} from 'react-native'
import {runOnJS, useAnimatedReaction} from 'react-native-reanimated'
import {type AppBskyActorDefs, AppBskyFeedDefs} from '@atproto/api'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {type NavigationProp, useNavigation} from '@react-navigation/native'
import {useQueryClient} from '@tanstack/react-query'

import {DISCOVER_FEED_URI, VIDEO_FEED_URIS} from '#/lib/constants'
import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {ComposeIcon2} from '#/lib/icons'
import {getRootNavigation, getTabState, TabState} from '#/lib/routes/helpers'
import {type AllNavigatorParams} from '#/lib/routes/types'
import {logEvent} from '#/lib/statsig/statsig'
import {s} from '#/lib/styles'
import {isNative} from '#/platform/detection'
import {listenSoftReset} from '#/state/events'
import {FeedFeedbackProvider, useFeedFeedback} from '#/state/feed-feedback'
import {useSetHomeBadge} from '#/state/home-badge'
import {type FeedSourceInfo} from '#/state/queries/feed'
import {
  type FeedDescriptor,
  type FeedParams,
  RQKEY as FEED_RQKEY,
} from '#/state/queries/post-feed'
import {truncateAndInvalidate} from '#/state/queries/util'
import {useSession} from '#/state/session'
import {useMinimalShellMode, useSetMinimalShellMode} from '#/state/shell'
import {useFeedExperience} from '#/state/shell/feed-experience'
import {atoms as a} from '#/alf'
import {NewPostsPill} from '#/components/feeds/NewPostsPill'
import {useHeaderOffset} from '#/components/hooks/useHeaderOffset'
import {PostFeed} from '../posts/PostFeed'
import {FAB} from '../util/fab/FAB'
import {type ListMethods} from '../util/List'
import {LoadLatestBtn} from '../util/load-latest/LoadLatestBtn'
import {MainScrollProvider} from '../util/MainScrollProvider'

const POLL_FREQ = 60e3 // 60sec

export function FeedPage({
  testID,
  isPageFocused,
  isPageAdjacent,
  feed,
  feedParams,
  renderEmptyState,
  renderEndOfFeed,
  savedFeedConfig,
  feedInfo,
}: {
  testID?: string
  feed: FeedDescriptor
  feedParams?: FeedParams
  isPageFocused: boolean
  isPageAdjacent: boolean
  renderEmptyState: () => JSX.Element
  renderEndOfFeed?: () => JSX.Element
  savedFeedConfig?: AppBskyActorDefs.SavedFeed
  feedInfo: FeedSourceInfo
}) {
  const {hasSession} = useSession()
  const {_} = useLingui()
  const navigation = useNavigation<NavigationProp<AllNavigatorParams>>()
  const queryClient = useQueryClient()
  const {openComposer} = useOpenComposer()
  const [isScrolledDown, setIsScrolledDown] = useState(false)
  const setMinimalShellMode = useSetMinimalShellMode()
  const {headerMode} = useMinimalShellMode()
  // Each time the person scrolls back up, nudge them toward the newest posts
  // (and the feed tabs, which come back with the header) for a few seconds.
  const [showUpPill, setShowUpPill] = useState(false)
  const upPillTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const isScrolledDownRef = useRef(false)
  const baseHeaderOffset = useHeaderOffset()
  const headerOffset = baseHeaderOffset > 0 ? baseHeaderOffset + 46 : 0
  const experienceMode = useFeedExperience()
  const feedFeedback = useFeedFeedback(feedInfo, hasSession)
  const scrollElRef = useRef<ListMethods>(null)
  const [hasNew, setHasNew] = useState(false)
  const [newPosters, setNewPosters] = useState<
    AppBskyActorDefs.ProfileViewBasic[]
  >([])
  const setHomeBadge = useSetHomeBadge()
  const isVideoFeed = useMemo(() => {
    const isBskyVideoFeed = VIDEO_FEED_URIS.includes(feedInfo.uri)
    const feedIsVideoMode =
      feedInfo.contentMode === AppBskyFeedDefs.CONTENTMODEVIDEO
    const _isVideoFeed = isBskyVideoFeed || feedIsVideoMode
    return isNative && _isVideoFeed
  }, [feedInfo])

  useEffect(() => {
    if (isPageFocused) {
      setHomeBadge(hasNew)
    }
  }, [isPageFocused, hasNew, setHomeBadge])

  const onScrolledBackUp = useCallback(() => {
    if (!isScrolledDownRef.current) return
    setShowUpPill(true)
    clearTimeout(upPillTimer.current)
    upPillTimer.current = setTimeout(() => setShowUpPill(false), 4000)
  }, [])
  const onScrolledDownAgain = useCallback(() => {
    clearTimeout(upPillTimer.current)
    setShowUpPill(false)
  }, [])
  useAnimatedReaction(
    () => Math.round(headerMode.get()),
    (mode, prev) => {
      if (prev === null || mode === prev) return
      // 0 = header/tabs shown (scrolling up), 1 = hidden (scrolling down).
      if (mode === 0) runOnJS(onScrolledBackUp)()
      else runOnJS(onScrolledDownAgain)()
    },
  )
  useEffect(() => () => clearTimeout(upPillTimer.current), [])

  const scrollToTop = useCallback(() => {
    scrollElRef.current?.scrollToOffset({
      animated: isNative,
      offset: -headerOffset,
    })
    setMinimalShellMode(false)
  }, [headerOffset, setMinimalShellMode])

  const onHasNew = useCallback(
    (v: boolean, latestPosts?: AppBskyFeedDefs.PostView[]) => {
      setHasNew(v)
      if (!v) {
        setNewPosters([])
        return
      }
      if (latestPosts?.length) {
        const seen = new Set<string>()
        const authors: AppBskyActorDefs.ProfileViewBasic[] = []
        for (const post of latestPosts) {
          if (seen.has(post.author.did)) continue
          seen.add(post.author.did)
          authors.push(post.author)
          if (authors.length === 3) break
        }
        setNewPosters(authors)
      }
    },
    [setHasNew, setNewPosters],
  )

  const onSoftReset = useCallback(() => {
    const isScreenFocused =
      getTabState(getRootNavigation(navigation).getState(), 'Home') ===
      TabState.InsideAtRoot
    if (isScreenFocused && isPageFocused) {
      scrollToTop()
      truncateAndInvalidate(queryClient, FEED_RQKEY(feed))
      onHasNew(false)
      logEvent('feed:refresh', {
        feedType: feed.split('|')[0],
        feedUrl: feed,
        reason: 'soft-reset',
      })
    }
  }, [navigation, isPageFocused, scrollToTop, queryClient, feed, onHasNew])

  // fires when page within screen is activated/deactivated
  useEffect(() => {
    if (!isPageFocused) {
      return
    }
    return listenSoftReset(onSoftReset)
  }, [onSoftReset, isPageFocused])

  const onPressCompose = useCallback(() => {
    openComposer({})
  }, [openComposer])

  const onPressLoadLatest = useCallback(() => {
    scrollToTop()
    truncateAndInvalidate(queryClient, FEED_RQKEY(feed))
    onHasNew(false)
    logEvent('feed:refresh', {
      feedType: feed.split('|')[0],
      feedUrl: feed,
      reason: 'load-latest',
    })
  }, [scrollToTop, feed, queryClient, onHasNew])

  const shouldPrefetch = isNative && isPageAdjacent
  const isDiscoverFeed = feedInfo.uri === DISCOVER_FEED_URI
  return (
    <View
      testID={testID}
      // @ts-expect-error web only -sfn
      dataSet={{nosnippet: isDiscoverFeed ? '' : undefined}}>
      <MainScrollProvider>
        <FeedFeedbackProvider value={feedFeedback}>
          <PostFeed
            testID={testID ? `${testID}-feed` : undefined}
            enabled={isPageFocused || shouldPrefetch}
            feed={feed}
            experienceMode={experienceMode}
            feedParams={feedParams}
            pollInterval={POLL_FREQ}
            disablePoll={hasNew || !isPageFocused}
            scrollElRef={scrollElRef}
            onScrolledDownChange={(v: boolean) => {
              isScrolledDownRef.current = v
              setIsScrolledDown(v)
              if (!v) {
                clearTimeout(upPillTimer.current)
                setShowUpPill(false)
              }
            }}
            onHasNew={onHasNew}
            renderEmptyState={renderEmptyState}
            renderEndOfFeed={renderEndOfFeed}
            headerOffset={headerOffset}
            savedFeedConfig={savedFeedConfig}
            isVideoFeed={isVideoFeed}
          />
        </FeedFeedbackProvider>
      </MainScrollProvider>
      {(hasNew && newPosters.length > 0) || (showUpPill && isScrolledDown) ? (
        <View
          pointerEvents="box-none"
          style={[
            a.absolute,
            a.z_20,
            a.align_center,
            {
              top: headerOffset + 8,
              left: 0,
              right: 0,
            },
          ]}>
          <NewPostsPill
            authors={hasNew ? newPosters : []}
            onPress={onPressLoadLatest}
            label={_(msg`Load new posts`)}
            text={hasNew ? undefined : _(msg`See new posts`)}
          />
        </View>
      ) : (
        (isScrolledDown || hasNew) && (
          <LoadLatestBtn
            onPress={onPressLoadLatest}
            label={_(msg`Load new posts`)}
            showIndicator={hasNew}
          />
        )
      )}

      {hasSession && (
        <FAB
          testID="composeFAB"
          onPress={onPressCompose}
          icon={<ComposeIcon2 strokeWidth={1.5} size={29} style={s.white} />}
          accessibilityRole="button"
          accessibilityLabel={_(msg({message: `New post`, context: 'action'}))}
          accessibilityHint=""
        />
      )}
    </View>
  )
}
