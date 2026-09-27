import {type ReactNode, useMemo} from 'react'
import {type ListRenderItemInfo, View} from 'react-native'

import {type FeedPostSliceItem} from '#/state/queries/post-feed'
import {type FeedExperienceMode} from '#/state/shell/feed-experience'
import {type FeedRow} from '#/view/com/posts/PostFeed'
import {List, type ListRef} from '#/view/com/util/List'
import {atoms as a} from '#/alf'

export type FeedExperienceRendererProps = {
  mode: FeedExperienceMode
  rows: FeedRow[]
  renderItem: (info: ListRenderItemInfo<FeedRow>) => ReactNode
  scrollElRef?: ListRef
  enabled?: boolean
  hasNextPage: boolean
  isFetching: boolean
  isError: boolean
  loadedPages: number
  onLoadMore: () => void
  onScrolledDownChange?: (value: boolean) => void
  onItemSeen: (row: FeedRow) => void
  headerOffset?: number
  renderRelatedImages?: (post: FeedPostSliceItem['post']) => ReactNode
}

type NativeRow = {
  key: string
  cols: FeedRow[]
  fullWidth: boolean
}

const separators = {highlight() {}, unhighlight() {}, updateProps() {}}

/**
 * Native masonry-ish renderer: post rows are bucketed two-per-row while
 * non-post rows (loading/empty/notices) keep the full width.
 */
export function FeedExperienceRenderer({
  mode,
  rows,
  renderItem,
  scrollElRef,
  enabled,
  hasNextPage,
  isFetching,
  onLoadMore,
  onScrolledDownChange,
  onItemSeen,
  headerOffset,
}: FeedExperienceRendererProps) {
  const data = useMemo(() => {
    const out: NativeRow[] = []
    let pending: FeedRow[] = []
    const flush = () => {
      if (pending.length) {
        out.push({key: pending[0].key, cols: pending, fullWidth: false})
        pending = []
      }
    }
    for (const row of rows) {
      if (row.type === 'sliceItem') {
        pending.push(row)
        if (pending.length === (mode === 'images' ? 2 : 1)) flush()
      } else {
        flush()
        out.push({key: row.key, cols: [row], fullWidth: true})
      }
    }
    flush()
    return out
  }, [rows, mode])

  return (
    <List
      ref={scrollElRef}
      data={data}
      keyExtractor={item => item.key}
      renderItem={(info: ListRenderItemInfo<NativeRow>) => {
        if (info.item.fullWidth) {
          return renderItem({
            item: info.item.cols[0],
            index: info.index,
            separators,
          }) as React.ReactElement
        }
        return (
          <View style={[a.flex_row, a.gap_sm, a.px_sm]}>
            {info.item.cols.map(col => (
              <View key={col.key} style={[a.flex_1, {minWidth: 0}]}>
                {renderItem({item: col, index: info.index, separators})}
              </View>
            ))}
          </View>
        )
      }}
      headerOffset={headerOffset}
      onScrolledDownChange={onScrolledDownChange}
      onEndReached={enabled ? onLoadMore : undefined}
      onEndReachedThreshold={2}
      windowSize={9}
      maxToRenderPerBatch={4}
      onItemSeen={row => {
        if (row.fullWidth) return
        for (const col of row.cols) onItemSeen(col)
      }}
      ListFooterComponent={
        isFetching || hasNextPage ? <View style={[a.py_2xl]} /> : undefined
      }
    />
  )
}
