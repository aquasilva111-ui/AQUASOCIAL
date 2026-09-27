import {useMemo} from 'react'
import {useWindowDimensions, View} from 'react-native'

import {type MediaExperience} from '#/lib/media/experiences'
import {type FeedPostSliceItem} from '#/state/queries/post-feed'
import {List, type ListRef} from '#/view/com/util/List'
import {atoms as a} from '#/alf'
import {MediaCard} from './MediaCard'

export type MediaGalleryProps = {
  items: FeedPostSliceItem[]
  mode: MediaExperience
  onLoadMore?: () => void
  onItemSeen?: (item: FeedPostSliceItem) => void
  scrollElRef?: ListRef
  onScrolledDownChange?: (value: boolean) => void
}

export function MediaGallery({
  items,
  mode,
  onLoadMore,
  onItemSeen,
  scrollElRef,
  onScrolledDownChange,
}: MediaGalleryProps) {
  const {width} = useWindowDimensions()
  const columns = mode === 'video' && width < 600 ? 1 : 2
  const rows = useMemo(() => {
    const result: FeedPostSliceItem[][] = []
    for (let i = 0; i < items.length; i += columns)
      result.push(items.slice(i, i + columns))
    return result
  }, [items, columns])
  return (
    <List
      ref={scrollElRef}
      onScrolledDownChange={onScrolledDownChange}
      data={rows}
      keyExtractor={row => row[0].uri}
      renderItem={({item}: {item: FeedPostSliceItem[]}) => (
        <View style={[a.flex_row, a.gap_sm, a.px_sm, a.pb_md]}>
          {item.map(post => (
            <View key={post.uri} style={[a.flex_1, {minWidth: 0}]}>
              <MediaCard item={post} mode={mode} />
            </View>
          ))}
          {item.length < columns && <View style={a.flex_1} />}
        </View>
      )}
      onEndReached={onLoadMore}
      onEndReachedThreshold={2}
      onItemSeen={(row: FeedPostSliceItem[]) =>
        row.forEach(item => onItemSeen?.(item))
      }
      windowSize={7}
      maxToRenderPerBatch={4}
      contentContainerStyle={{paddingBottom: 120}}
    />
  )
}
