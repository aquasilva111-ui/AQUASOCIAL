import type { InfiniteMediaFeedRef, InfiniteMediaItem } from '@rbayuokt/expo-infinite-media';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';

/** Browser stand-in for the native feed, so Drops can be previewed on localhost. Same props, plain DOM. */
type Props = {
  data: readonly InfiniteMediaItem[];
  initialIndex?: number;
  active?: boolean;
  muted?: boolean;
  backgroundColor?: string;
  renderOverlay?: (info: { item: any; index: number; isActive: boolean }) => ReactNode;
  onEndReached?: () => void;
  onIndexChange?: (e: { index: number }) => void;
  onPlaybackStateChange?: (e: { itemId: string; state: string }) => void;
  onError?: (e: any) => void;
  [key: string]: any;
};

export const InfiniteMediaFeed = forwardRef<InfiniteMediaFeedRef, Props>(function Feed(props, ref) {
  const { data, initialIndex = 0, active = true, muted, backgroundColor = '#000', renderOverlay } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const videos = useRef<Record<number, HTMLVideoElement | null>>({});
  const [index, setIndex] = useState(initialIndex);
  const cb = useRef(props);
  cb.current = props;

  const play = useCallback(() => videos.current[index]?.play().catch(() => {}), [index]);
  const pause = useCallback(() => videos.current[index]?.pause(), [index]);

  useImperativeHandle(ref, () => ({
    play, pause,
    seekTo: (s: number) => { const v = videos.current[index]; if (v) v.currentTime = s; },
    retry: () => { videos.current[index]?.load(); play(); },
    scrollToIndex: (i: number, animated = true) =>
      scroller.current?.scrollTo({ top: i * scroller.current.clientHeight, behavior: animated ? 'smooth' : 'auto' }),
  }) as unknown as InfiniteMediaFeedRef, [play, pause, index]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: initialIndex * scroller.current.clientHeight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Object.entries(videos.current).forEach(([i, v]) => {
      if (!v) return;
      v.muted = !!muted;
      if (Number(i) === index && active) v.play().catch(() => {});
      else v.pause();
    });
    const item = data[index];
    if (item) cb.current.onIndexChange?.({ index });
    if (index >= data.length - 5) cb.current.onEndReached?.();
  }, [index, active, muted, data]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    if (i !== index) setIndex(i);
  };

  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      style={{ position: 'absolute', inset: 0, overflowY: 'scroll', scrollSnapType: 'y mandatory', background: backgroundColor, scrollbarWidth: 'none' }}>
      {data.map((item: InfiniteMediaItem, i: number) => {
        const near = Math.abs(i - index) <= 1;
        return (
          <div key={item.id} style={{ height: '100%', scrollSnapAlign: 'start', scrollSnapStop: 'always', position: 'relative', overflow: 'hidden' }}>
            {near && item.type === 'video' ? (
              <video
                ref={(el) => { videos.current[i] = el; }}
                src={item.uri.endsWith('.m3u8') ? undefined : item.uri}
                poster={item.poster}
                loop playsInline muted={!!muted}
                onPlaying={() => cb.current.onPlaybackStateChange?.({ itemId: item.id, state: 'playing' })}
                onPause={() => cb.current.onPlaybackStateChange?.({ itemId: item.id, state: 'paused' })}
                onWaiting={() => cb.current.onPlaybackStateChange?.({ itemId: item.id, state: 'buffering' })}
                onError={() => cb.current.onError?.({ itemId: item.id, code: 'HTTP_ERROR', recoverable: false, attempt: 1 })}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : near ? (
              <img src={item.uri} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={() => cb.current.onError?.({ itemId: item.id, code: 'SOURCE_NOT_FOUND', recoverable: false, attempt: 1 })} />
            ) : null}
            {near && renderOverlay ? (
              <div style={{ position: 'absolute', inset: 0 }}>{renderOverlay({ item, index: i, isActive: i === index })}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
});
