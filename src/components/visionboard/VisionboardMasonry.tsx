import {type ReactElement, useMemo} from 'react'
import {useWindowDimensions, View} from 'react-native'

import {type VisionboardItem} from '#/lib/visionboard/model'
import {type FeedPostSliceItem} from '#/state/queries/post-feed'
import {List, type ListRef} from '#/view/com/util/List'
import {atoms as a} from '#/alf'
import {VisionboardCard, type VisionboardCardVariant} from './VisionboardCard'

export type VisionboardMasonryProps = {
  items: VisionboardItem[]
  onLoadMore?: () => void
  onItemSeen?: (item: FeedPostSliceItem) => void
  scrollElRef?: ListRef
  onScrolledDownChange?: (value: boolean) => void
  variant?: VisionboardCardVariant
  /** Scrolls with the grid (title, chips, status). */
  header?: ReactElement
}

function columnCount(width: number, variant: VisionboardCardVariant) {
  if (variant === 'board') {
    // full-page board: one column more than the in-app grid
    if (width >= 1200) return 5
    if (width >= 900) return 4
    if (width >= 600) return 3
    return 2
  }
  if (width >= 1200) return 4
  if (width >= 768) return 3
  return 2
}

// Items render below the image (caption, creator, controls) — approximate
// that fixed footer in aspect-ratio units so columns stay balanced.
const FOOTER_WEIGHT = 0.6

function itemWeight(item: VisionboardItem) {
  const ratio =
    item.width && item.height && item.width > 0 && item.height > 0
      ? item.width / item.height
      : 1
  return 1 / ratio + FOOTER_WEIGHT
}

type MasonryBlock = {
  key: string
  columns: VisionboardItem[][]
}

/** Deals items into the shortest column, estimated from image aspect ratio. */
export function dealIntoColumns(
  items: VisionboardItem[],
  columns: number,
): VisionboardItem[][] {
  const cols: VisionboardItem[][] = Array.from({length: columns}, () => [])
  const heights = Array.from({length: columns}, () => 0)
  for (const item of items) {
    let target = 0
    for (let c = 1; c < columns; c++) {
      if (heights[c] < heights[target]) target = c
    }
    cols[target].push(item)
    heights[target] += itemWeight(item)
  }
  return cols
}

/**
 * True masonry: items are dealt into the shortest column (estimated from the
 * real image aspect ratio, so no fake card heights and no layout jumps).
 * Blocks of columns*6 keep the outer List windowed for infinite scroll.
 */
export function VisionboardMasonry({
  items,
  onLoadMore,
  onItemSeen,
  scrollElRef,
  onScrolledDownChange,
  variant = 'feed',
  header,
}: VisionboardMasonryProps) {
  const gap = 8
  const {width} = useWindowDimensions()
  const columns = columnCount(width, variant)
  const blocks = useMemo(() => {
    const perBlock = columns * 6
    const result: MasonryBlock[] = []
    for (let start = 0; start < items.length; start += perBlock) {
      const slice = items.slice(start, start + perBlock)
      result.push({
        key: slice[0]?.id ?? `block-${start}`,
        columns: dealIntoColumns(slice, columns),
      })
    }
    return result
  }, [items, columns])
  return (
    <List
      ref={scrollElRef}
      onScrolledDownChange={onScrolledDownChange}
      data={blocks}
      keyExtractor={block => block.key}
      renderItem={({item: block}: {item: MasonryBlock}) => (
        <View
          style={[
            a.flex_row,
            {gap, paddingBottom: gap},
            variant === 'feed' && a.px_sm,
          ]}>
          {block.columns.map((column, index) => (
            <View key={index} style={[a.flex_1, {gap, minWidth: 0}]}>
              {column.map(item => (
                <VisionboardCard key={item.id} item={item} variant={variant} />
              ))}
            </View>
          ))}
        </View>
      )}
      ListHeaderComponent={header}
      fullWidth={variant === 'board'}
      onEndReached={onLoadMore}
      onEndReachedThreshold={2}
      onItemSeen={(block: MasonryBlock) =>
        block.columns.forEach(column =>
          column.forEach(item => onItemSeen?.(item.item)),
        )
      }
      windowSize={7}
      maxToRenderPerBatch={2}
      contentContainerStyle={{paddingBottom: 120}}
    />
  )
}
