/* eslint-disable bsky-internal/avoid-unwrapped-text -- This web renderer uses semantic HTML text elements. */
import './feed-experience.css'

import {
  type ReactNode,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import {type FeedRow} from '#/view/com/posts/PostFeed'
import {type ListMethods} from '#/view/com/util/List'
import {useTheme} from '#/alf'
import * as Layout from '#/components/Layout'
import {type FeedExperienceRendererProps} from './FeedExperienceRenderer'

const separators = {highlight() {}, unhighlight() {}, updateProps() {}}
type FeedScrollHandle = Pick<ListMethods, 'scrollToOffset'>

export function FeedExperienceRenderer({
  mode,
  rows,
  renderItem,
  scrollElRef,
  enabled,
  hasNextPage,
  isFetching,
  isError,
  loadedPages,
  onLoadMore,
  onScrolledDownChange,
  onItemSeen,
  headerOffset,
  renderRelatedImages,
}: FeedExperienceRendererProps) {
  const sentinel = useRef<HTMLDivElement>(null)
  const theme = useTheme()
  const automaticLoads = useRef(0)
  const count = rows.filter(row => row.type === 'sliceItem').length

  useImperativeHandle<FeedScrollHandle, FeedScrollHandle>(scrollElRef, () => ({
    scrollToOffset: ({offset, animated}) =>
      window.scrollTo({
        top: Math.max(0, offset),
        behavior: animated ? 'smooth' : 'instant',
      }),
  }))

  useEffect(() => {
    automaticLoads.current = 0
  }, [count])
  useEffect(() => {
    if (!enabled) return
    const onScroll = () => onScrolledDownChange?.(window.scrollY > 200)
    window.addEventListener('scroll', onScroll, {passive: true})
    return () => window.removeEventListener('scroll', onScroll)
  }, [enabled, onScrolledDownChange])

  useEffect(() => {
    if (!enabled || !hasNextPage || isFetching || isError || !sentinel.current)
      return
    const observer = new IntersectionObserver(
      entries => {
        // Avoid scanning an unlimited feed when this view has no compatible media.
        if (
          entries.some(entry => entry.isIntersecting) &&
          automaticLoads.current < 3
        ) {
          automaticLoads.current++
          observer.disconnect()
          onLoadMore()
        }
      },
      {rootMargin: '300px'},
    )
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [enabled, hasNextPage, isFetching, isError, loadedPages, onLoadMore])

  const empty =
    count === 0 &&
    !isFetching &&
    !isError &&
    !rows.some(row => row.type === 'empty')
  return (
    <Layout.Center style={{paddingTop: headerOffset}}>
      <section
        className={`feed-experience feed-experience-${mode}`}
        style={{color: theme.atoms.text.color}}
        aria-label={`${mode} feed`}
        aria-busy={isFetching}>
        <div className="feed-experience-items">
          {rows.map((row, index) => (
            <ExperienceTile
              key={row.key}
              row={row}
              mode={mode}
              enabled={enabled}
              onItemSeen={onItemSeen}>
              {renderItem({item: row, index, separators})}
              {mode === 'images' &&
                row.type === 'sliceItem' &&
                renderRelatedImages?.(row.slice.items[row.indexInSlice].post)}
            </ExperienceTile>
          ))}
        </div>
        {empty && (
          <p className="feed-experience-status" role="status">
            {'Nenhum conteúdo compatível nas publicações carregadas.'}
          </p>
        )}
        <div className="feed-experience-more" ref={sentinel}>
          {isFetching ? (
            <p role="status">{'Carregando…'}</p>
          ) : hasNextPage && !isError ? (
            <button
              type="button"
              onClick={() => {
                automaticLoads.current = 0
                onLoadMore()
              }}>
              {'Carregar mais'}
            </button>
          ) : null}
        </div>
      </section>
    </Layout.Center>
  )
}

function ExperienceTile({
  row,
  mode,
  enabled,
  onItemSeen,
  children,
}: {
  row: FeedRow
  mode: string
  enabled?: boolean
  onItemSeen: (row: FeedRow) => void
  children: ReactNode
}) {
  const inner = useRef<HTMLDivElement>(null)
  const [span, setSpan] = useState(1)
  const isPost = row.type === 'sliceItem'
  useLayoutEffect(() => {
    if (mode !== 'images' || !inner.current) return
    const measure = () =>
      setSpan(
        Math.ceil(
          ((inner.current?.getBoundingClientRect().height ?? 0) + 12) / 20,
        ),
      )
    const observer = new ResizeObserver(measure)
    observer.observe(inner.current)
    measure()
    return () => observer.disconnect()
  }, [mode, isPost])

  useEffect(() => {
    if (!enabled || !inner.current || !isPost) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new IntersectionObserver(
      entries => {
        clearTimeout(timer)
        if (entries.some(entry => entry.isIntersecting)) {
          timer = setTimeout(() => {
            onItemSeen(row)
            observer.disconnect()
          }, 500)
        }
      },
      {threshold: 0.3},
    )
    observer.observe(inner.current)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [enabled, isPost, row, onItemSeen])

  return (
    <div
      className={isPost ? 'feed-experience-tile' : 'feed-experience-notice'}
      style={mode === 'images' ? {gridRowEnd: `span ${span}`} : undefined}>
      <div ref={inner}>{children}</div>
    </div>
  )
}
