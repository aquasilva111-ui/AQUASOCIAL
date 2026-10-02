import {memo, useCallback, useEffect, useRef, useState} from 'react'
import {
  ActivityIndicator,
  FlatList,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {Image} from 'expo-image'
import {LinearGradient} from 'expo-linear-gradient'
import {useVideoPlayer, VideoView} from 'expo-video'
import {useNavigation} from '@react-navigation/native'

import {useHaptics} from '#/lib/haptics'
import {type NavigationProp} from '#/lib/routes/types'
import {POST_TOMBSTONE, usePostShadow} from '#/state/cache/post-shadow'
import {DOCK_HEIGHT, DOCK_INSET} from '#/view/shell/bottom-bar/BottomBarStyles'
import {
  Heart2_Filled_Stroke2_Corner0_Rounded as HeartFilled,
  Heart2_Stroke2_Corner0_Rounded as Heart,
} from '#/components/icons/Heart2'
import {MagnifyingGlass2_Stroke2_Corner0_Rounded as SearchIcon} from '#/components/icons/MagnifyingGlass2'
import {type Drop} from './data'
import {useDropLike} from './useDropLike'
import {useDropsFeed} from './useDropsFeed'

/** Likes in Drops are orange. */
const LIKE = '#FF7A00'
const AQUA = '#1185FE'
const DOUBLE_TAP_MS = 250

const compact = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)} mil` : String(n)

function DropVideo({uri, active}: {uri: string; active: boolean}) {
  const player = useVideoPlayer(uri, p => {
    p.loop = true
    p.muted = true
  })
  useEffect(() => {
    if (active) player.play()
    else player.pause()
  }, [active, player])
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
    />
  )
}

const DropPage = memo(function DropPage(props: {
  drop: Drop
  height: number
  active: boolean
  near: boolean
  bottom: number
}) {
  const shadow = usePostShadow(props.drop.post)
  if (shadow === POST_TOMBSTONE) return null
  return <DropPageInner {...props} post={shadow} />
})

function DropPageInner({
  drop,
  height,
  active,
  near,
  bottom,
  post,
}: {
  drop: Drop
  height: number
  active: boolean
  near: boolean
  bottom: number
  post: Parameters<typeof useDropLike>[0]
}) {
  const lastTap = useRef(0)
  const playHaptic = useHaptics()
  const {liked, likeCount, toggle} = useDropLike(post)
  const onTap = () => {
    const now = Date.now()
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0
      playHaptic()
      toggle(true)
    } else {
      lastTap.current = now
    }
  }
  const LikeIcon = liked ? HeartFilled : Heart
  return (
    <View style={[styles.page, {height}]}>
      {drop.poster ? (
        <Image
          source={{uri: drop.poster}}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      {near ? <DropVideo uri={drop.playlist} active={active} /> : null}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onTap}
        accessibilityLabel="Toque duplo para curtir"
        accessibilityHint=""
        accessibilityRole="button"
      />
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', 'rgba(0,0,0,0.6)']}
        style={styles.shade}
      />
      <View style={[styles.rail, {bottom}]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {drop.authorName[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Pressable
          style={styles.action}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Descurtir' : 'Curtir'}
          accessibilityHint=""
          onPress={() => {
            playHaptic()
            toggle()
          }}>
          <LikeIcon width={32} style={{color: liked ? LIKE : '#fff'}} />
          <Text style={styles.count}>{compact(likeCount)}</Text>
        </Pressable>
      </View>
      <View style={[styles.meta, {bottom}]} pointerEvents="none">
        <Text style={styles.author}>@{drop.authorHandle}</Text>
        {drop.caption ? (
          <Text style={styles.caption} numberOfLines={2}>
            {drop.caption}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

export function DropsScreen() {
  const [height, setHeight] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const {drops, isLoading, isError, loadMore, refetch} = useDropsFeed()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NavigationProp>()

  // Keep the rail and the caption clear of the bottom dock.
  const dockClearance = DOCK_HEIGHT + Math.max(insets.bottom, DOCK_INSET) + 16

  const onLayout = (e: LayoutChangeEvent) =>
    setHeight(e.nativeEvent.layout.height)

  const onViewable = useRef(({viewableItems}: {viewableItems: ViewToken[]}) => {
    const first = viewableItems.find(v => v.isViewable)
    if (first?.index != null) setActiveIndex(first.index)
  }).current

  const renderItem = useCallback(
    ({item, index}: {item: Drop; index: number}) => (
      <DropPage
        drop={item}
        height={height}
        active={index === activeIndex}
        near={Math.abs(index - activeIndex) <= 1}
        bottom={dockClearance}
      />
    ),
    [height, activeIndex, dockClearance],
  )

  return (
    <View style={styles.root} onLayout={onLayout}>
      {height > 0 && drops.length > 0 ? (
        <FlatList
          data={drops}
          extraData={activeIndex}
          keyExtractor={d => d.id}
          pagingEnabled
          snapToInterval={height}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, i) => ({
            length: height,
            offset: height * i,
            index: i,
          })}
          windowSize={3}
          maxToRenderPerBatch={2}
          initialNumToRender={2}
          removeClippedSubviews
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{itemVisiblePercentThreshold: 80}}
          renderItem={renderItem}
        />
      ) : (
        <View style={styles.state}>
          {isError ? (
            <>
              <Text style={styles.stateText}>
                Não foi possível carregar os drops.
              </Text>
              <Pressable
                onPress={() => refetch()}
                accessibilityRole="button"
                accessibilityLabel="Tentar de novo"
                accessibilityHint=""
                style={styles.retry}>
                <Text style={styles.retryText}>Tentar de novo</Text>
              </Pressable>
            </>
          ) : isLoading || drops.length === 0 ? (
            <ActivityIndicator color="#fff" />
          ) : null}
        </View>
      )}
      <View style={styles.top} pointerEvents="none">
        <Text style={styles.topText}>Drops</Text>
        <View style={styles.topDot} />
      </View>
      <Pressable
        style={styles.search}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Pesquisar"
        accessibilityHint=""
        onPress={() => navigation.navigate('SearchTab')}>
        <SearchIcon width={20} style={{color: '#fff'}} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  page: {width: '100%', backgroundColor: '#000', overflow: 'hidden'},
  shade: {position: 'absolute', left: 0, right: 0, bottom: 0, height: '40%'},
  state: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14},
  stateText: {color: '#fff', fontSize: 15},
  retry: {
    backgroundColor: AQUA,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 99,
  },
  retryText: {color: '#fff', fontWeight: '700'},
  top: {
    position: 'absolute',
    top: 54,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 3,
  },
  topText: {color: '#fff', fontSize: 17, fontWeight: '800'},
  topDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: AQUA,
    marginBottom: 5,
  },
  search: {
    position: 'absolute',
    top: 44,
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rail: {
    position: 'absolute',
    right: 12,
    alignItems: 'center',
    gap: 22,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: AQUA,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {color: '#fff', fontSize: 18, fontWeight: '700'},
  action: {alignItems: 'center', gap: 2},
  count: {color: '#fff', fontSize: 12, fontWeight: '600'},
  meta: {position: 'absolute', left: 16, right: 84, gap: 4},
  author: {color: '#fff', fontSize: 16, fontWeight: '700'},
  caption: {color: '#fff', fontSize: 14, lineHeight: 19},
})
