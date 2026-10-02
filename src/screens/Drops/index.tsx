import {memo, useCallback, useEffect, useRef, useState} from 'react'
import {
  FlatList,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native'
import {Image} from 'expo-image'
import {LinearGradient} from 'expo-linear-gradient'
import {useVideoPlayer, VideoView} from 'expo-video'

import {useHaptics} from '#/lib/haptics'
import {logger} from '#/logger'
import {
  Heart2_Filled_Stroke2_Corner0_Rounded as HeartFilled,
  Heart2_Stroke2_Corner0_Rounded as Heart,
} from '#/components/icons/Heart2'
import {type Drop, makeDrops} from './data'

/** Likes in Drops are orange. */
const LIKE = '#FF7A00'
const AQUA = '#1185FE'
const DOUBLE_TAP_MS = 250
const PAGE = 12

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

const DropPage = memo(function DropPage({
  drop,
  height,
  active,
  near,
  liked,
  onLike,
}: {
  drop: Drop
  height: number
  active: boolean
  near: boolean
  liked: boolean
  onLike: (id: string, force?: boolean) => void
}) {
  const lastTap = useRef(0)
  const playHaptic = useHaptics()
  const onTap = () => {
    const now = Date.now()
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0
      playHaptic()
      onLike(drop.id, true)
    } else {
      lastTap.current = now
    }
  }
  const LikeIcon = liked ? HeartFilled : Heart
  return (
    <View style={[styles.page, {height}]}>
      <Image
        source={{uri: drop.poster}}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        accessibilityIgnoresInvertColors
      />
      {near ? <DropVideo uri={drop.uri} active={active} /> : null}
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
      <View style={styles.rail}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{drop.author[0].toUpperCase()}</Text>
        </View>
        <Pressable
          style={styles.action}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Descurtir' : 'Curtir'}
          accessibilityHint=""
          onPress={() => {
            playHaptic()
            onLike(drop.id)
          }}>
          <LikeIcon width={32} style={{color: liked ? LIKE : '#fff'}} />
          <Text style={styles.count}>
            {compact(drop.likes + (liked ? 1 : 0))}
          </Text>
        </Pressable>
      </View>
      <View style={styles.meta} pointerEvents="none">
        <Text style={styles.author}>@{drop.author}</Text>
        <Text style={styles.caption} numberOfLines={2}>
          {drop.caption}
        </Text>
      </View>
    </View>
  )
})

export function DropsScreen() {
  const [height, setHeight] = useState(0)
  const [drops, setDrops] = useState<Drop[]>(() => makeDrops(PAGE))
  const [activeIndex, setActiveIndex] = useState(0)
  const [liked, setLiked] = useState<Set<string>>(() => new Set())

  const onLayout = (e: LayoutChangeEvent) =>
    setHeight(e.nativeEvent.layout.height)

  const onLike = useCallback((id: string, force?: boolean) => {
    setLiked(prev => {
      if (force && prev.has(id)) return prev
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const onViewable = useRef(({viewableItems}: {viewableItems: ViewToken[]}) => {
    const first = viewableItems.find(v => v.isViewable)
    if (first?.index != null) setActiveIndex(first.index)
  }).current

  const loadMore = useCallback(() => {
    logger.debug('Drops: loading more example drops')
    setDrops(prev => [...prev, ...makeDrops(PAGE, prev.length)])
  }, [])

  return (
    <View style={styles.root} onLayout={onLayout}>
      {height > 0 ? (
        <FlatList
          data={drops}
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
          renderItem={({item, index}) => (
            <DropPage
              drop={item}
              height={height}
              active={index === activeIndex}
              near={Math.abs(index - activeIndex) <= 1}
              liked={liked.has(item.id)}
              onLike={onLike}
            />
          )}
        />
      ) : null}
      <View style={styles.top} pointerEvents="none">
        <Text style={styles.topText}>Drops</Text>
        <View style={styles.topDot} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  page: {width: '100%', backgroundColor: '#000', overflow: 'hidden'},
  shade: {position: 'absolute', left: 0, right: 0, bottom: 0, height: '40%'},
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
  rail: {
    position: 'absolute',
    right: 12,
    bottom: 130,
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
  meta: {position: 'absolute', left: 16, right: 84, bottom: 130, gap: 4},
  author: {color: '#fff', fontSize: 16, fontWeight: '700'},
  caption: {color: '#fff', fontSize: 14, lineHeight: 19},
})
