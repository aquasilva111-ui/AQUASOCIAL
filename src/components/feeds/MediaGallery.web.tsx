import './media-gallery.css'

import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import {type FeedPostSliceItem} from '#/state/queries/post-feed'
import {type ListMethods} from '#/view/com/util/List'
import {MediaCard} from './MediaCard'
import {type MediaGalleryProps} from './MediaGallery'

export function MediaGallery({
  items,
  mode,
  onLoadMore,
  onItemSeen,
  scrollElRef,
  onScrolledDownChange,
}: MediaGalleryProps) {
  const sentinel = useRef<HTMLDivElement>(null)
  useImperativeHandle<
    Pick<ListMethods, 'scrollToOffset'>,
    Pick<ListMethods, 'scrollToOffset'>
  >(scrollElRef, () => ({
    scrollToOffset: ({
      offset,
      animated,
    }: {
      offset: number
      animated?: boolean | null
    }) =>
      window.scrollTo({top: offset, behavior: animated ? 'smooth' : 'instant'}),
  }))
  useEffect(() => {
    const onScroll = () => onScrolledDownChange?.(window.scrollY > 200)
    window.addEventListener('scroll', onScroll, {passive: true})
    return () => window.removeEventListener('scroll', onScroll)
  }, [onScrolledDownChange])
  useEffect(() => {
    if (!sentinel.current || !onLoadMore) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) onLoadMore()
      },
      {rootMargin: '400px'},
    )
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [items.length, onLoadMore])
  return (
    <div className={`aqua-media-gallery aqua-media-gallery-${mode}`}>
      {items.map(item => (
        <Tile key={item.uri} item={item} mode={mode} onSeen={onItemSeen} />
      ))}
      <div ref={sentinel} className="aqua-media-sentinel" />
    </div>
  )
}

function Tile({
  item,
  mode,
  onSeen,
}: {
  item: FeedPostSliceItem
  mode: MediaGalleryProps['mode']
  onSeen: MediaGalleryProps['onItemSeen']
}) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  const [height, setHeight] = useState(300)
  useEffect(() => {
    if (!outer.current) return
    const observer = new IntersectionObserver(
      entries => setNear(entries.some(entry => entry.isIntersecting)),
      {rootMargin: '800px'},
    )
    observer.observe(outer.current)
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    if (!near || !inner.current) return
    const observer = new ResizeObserver(() =>
      setHeight(inner.current?.getBoundingClientRect().height || 300),
    )
    observer.observe(inner.current)
    return () => observer.disconnect()
  }, [near])
  useEffect(() => {
    if (!outer.current || !onSeen) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new IntersectionObserver(
      entries => {
        clearTimeout(timer)
        if (entries.some(entry => entry.isIntersecting))
          timer = setTimeout(() => {
            onSeen(item)
            observer.disconnect()
          }, 500)
      },
      {threshold: 0.3},
    )
    observer.observe(outer.current)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [item, onSeen])
  return (
    <div
      ref={outer}
      className="aqua-media-tile"
      style={
        mode === 'images'
          ? {gridRowEnd: `span ${Math.ceil((height + 12) / 16)}`}
          : undefined
      }>
      {near ? (
        <div ref={inner}>
          <MediaCard item={item} mode={mode} />
        </div>
      ) : (
        <div style={{height}} />
      )}
    </div>
  )
}
