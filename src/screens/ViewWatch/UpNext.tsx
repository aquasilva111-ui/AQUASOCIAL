import {useMemo, useState} from 'react'
import {View} from 'react-native'
import {Image} from 'expo-image'
import {type AppBskyFeedDefs, AtUri} from '@atproto/api'

import {DISCOVER_FEED_URI} from '#/lib/constants'
import {getPostMedia, getRelatedMedia} from '#/lib/media/experiences'
import {liveThumbUrl} from '#/lib/streamplace'
import {splitTitle} from '#/lib/view-watch/chapters'
import {
  type FeedPostSliceItem,
  usePostFeedQuery,
} from '#/state/queries/post-feed'
import {useLiveUsersQuery} from '#/state/queries/streamplace'
import {useSelectedFeed} from '#/state/shell/selected-feed'
import {
  addToQueue,
  clearQueue,
  removeFromQueue,
  setAutoplay,
  useViewPlayback,
  type ViewVideoRef,
} from '#/state/view-playback'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'

export function toVideoRef(post: AppBskyFeedDefs.PostView): ViewVideoRef {
  const media = getPostMedia(post)
  return {
    uri: post.uri,
    did: post.author.did,
    rkey: new AtUri(post.uri).rkey,
    title:
      splitTitle((post.record as {text?: string}).text ?? '').title || 'Vídeo',
    author: post.author.displayName || post.author.handle,
    thumbnail: media.type === 'video' ? media.view.thumbnail : undefined,
  }
}

export const watchPathOf = (v: {did: string; rkey: string}) =>
  `/videos/watch/${v.did}/${v.rkey}`

function isVideo(item: FeedPostSliceItem) {
  return getPostMedia(item.post).type === 'video'
}

/**
 * Recommendations from what AQUA already has loaded: the author's own
 * videos ("Do canal"), related videos from the selected feed, and who is
 * live on Streamplace. No separate recommendation service.
 */
export function useRecommendations(post: AppBskyFeedDefs.PostView) {
  const selected = useSelectedFeed()
  const related = usePostFeedQuery(selected ?? `feedgen|${DISCOVER_FEED_URI}`)
  const channel = usePostFeedQuery(`author|${post.author.did}|posts_with_media`)
  const live = useLiveUsersQuery()
  return useMemo(() => {
    const flat = (q: typeof related) =>
      q.data?.pages.flatMap(page => page.slices.flatMap(s => s.items)) ?? []
    const fromChannel = flat(channel)
      .filter(
        i =>
          i.post.author.did === post.author.did &&
          i.uri !== post.uri &&
          isVideo(i),
      )
      .map(i => toVideoRef(i.post))
    const fromRelated = getRelatedMedia(post, flat(related), 'video')
      .filter(i => i.uri !== post.uri)
      .map(i => toVideoRef(i.post))
    const seen = new Set<string>()
    const all: ViewVideoRef[] = []
    // Mix: a couple from the channel first, then related, then the rest.
    for (const v of [
      ...fromChannel.slice(0, 2),
      ...fromRelated,
      ...fromChannel.slice(2),
    ]) {
      if (seen.has(v.uri)) continue
      seen.add(v.uri)
      all.push(v)
    }
    return {
      all: all.slice(0, 20),
      channel: fromChannel.slice(0, 20),
      related: fromRelated.slice(0, 20),
      live: live.data ?? [],
      loading: related.isLoading || channel.isLoading,
    }
  }, [post, related, channel, live.data])
}

type Filter = 'all' | 'channel' | 'related' | 'live'
const FILTERS: {key: Filter; label: string}[] = [
  {key: 'all', label: 'Todos'},
  {key: 'channel', label: 'Do canal'},
  {key: 'related', label: 'Relacionados'},
  {key: 'live', label: 'Ao vivo'},
]

export function UpNextPanel({
  currentUri,
  next,
  recs,
  onPlayNext,
}: {
  currentUri: string
  next?: {video: ViewVideoRef; fromQueue: boolean}
  recs: ReturnType<typeof useRecommendations>
  onPlayNext: () => void
}) {
  const t = useTheme()
  const {queue, autoplay} = useViewPlayback()
  const [filter, setFilter] = useState<Filter>('all')
  const list =
    filter === 'channel'
      ? recs.channel
      : filter === 'related'
        ? recs.related
        : recs.all
  const queued = queue.filter(v => v.uri !== currentUri)

  return (
    <View style={[a.gap_lg]}>
      <View
        style={[
          a.p_md,
          a.gap_md,
          a.rounded_lg,
          a.border,
          t.atoms.border_contrast_low,
        ]}>
        <View style={[a.flex_row, a.align_center, a.gap_sm]}>
          <Text style={[a.text_lg, a.font_bold, a.flex_1]}>A seguir</Text>
          <Button
            label={
              autoplay
                ? 'Desligar reprodução automática'
                : 'Ligar reprodução automática'
            }
            size="small"
            variant="solid"
            color={autoplay ? 'primary' : 'secondary'}
            accessibilityRole="switch"
            accessibilityState={{checked: autoplay}}
            onPress={() => setAutoplay(!autoplay)}>
            <ButtonText>
              {autoplay ? 'Automática: ligada' : 'Automática: desligada'}
            </ButtonText>
          </Button>
        </View>
        {next ? (
          <View style={[a.gap_xs]}>
            <Text
              style={[a.text_xs, a.font_bold, t.atoms.text_contrast_medium]}>
              {next.fromQueue ? 'DA SUA FILA' : 'RECOMENDADO'}
            </Text>
            <VideoRow video={next.video} highlight />
            <View style={[a.flex_row]}>
              <Button
                label={`Assistir agora: ${next.video.title}`}
                size="small"
                color="secondary"
                onPress={onPlayNext}>
                <ButtonText>Assistir agora</ButtonText>
              </Button>
            </View>
          </View>
        ) : (
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            {recs.loading ? 'Carregando…' : 'Nada na fila por enquanto.'}
          </Text>
        )}

        <View
          style={[a.gap_sm, a.pt_sm, a.border_t, t.atoms.border_contrast_low]}>
          <View style={[a.flex_row, a.align_center]}>
            <Text style={[a.text_sm, a.font_bold, a.flex_1]}>
              Fila · {queued.length}
            </Text>
            {queued.length > 0 && (
              <Button
                label="Limpar fila"
                size="tiny"
                variant="ghost"
                color="secondary"
                onPress={clearQueue}>
                <ButtonText>Limpar</ButtonText>
              </Button>
            )}
          </View>
          {queued.length === 0 && (
            <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
              Use "+ Fila" nos vídeos abaixo para escolher o que vem depois.
            </Text>
          )}
          {queued.map((v, i) => (
            <View key={v.uri} style={[a.flex_row, a.align_center, a.gap_sm]}>
              <Text
                style={[a.text_xs, t.atoms.text_contrast_medium, {width: 16}]}>
                {i + 1}
              </Text>
              <View style={[a.flex_1]}>
                <VideoRow video={v} compact />
              </View>
              <Button
                label={`Tirar da fila: ${v.title}`}
                size="tiny"
                variant="ghost"
                color="secondary"
                onPress={() => removeFromQueue(v.uri)}>
                <ButtonText>Tirar</ButtonText>
              </Button>
            </View>
          ))}
        </View>
      </View>

      <View
        accessibilityRole="tablist"
        style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
        {FILTERS.map(f => (
          <Button
            key={f.key}
            label={f.label}
            size="small"
            variant="solid"
            color={filter === f.key ? 'primary' : 'secondary'}
            accessibilityRole="tab"
            accessibilityState={{selected: filter === f.key}}
            onPress={() => setFilter(f.key)}>
            <ButtonText>{f.label}</ButtonText>
          </Button>
        ))}
      </View>

      {filter === 'live' ? (
        recs.live.length ? (
          recs.live.slice(0, 12).map(s => (
            <Link
              key={s.uri}
              to={`/videos/live/${s.author.handle}`}
              label={`Ao vivo: ${s.record.title || s.author.handle}`}
              style={[a.flex_row, a.gap_md]}>
              <Thumb uri={liveThumbUrl(s.author.did)} live />
              <View style={[a.flex_1, a.gap_2xs]}>
                <Text style={[a.text_sm, a.font_bold]} numberOfLines={2}>
                  {s.record.title || 'Ao vivo agora'}
                </Text>
                <Text
                  style={[a.text_xs, t.atoms.text_contrast_medium]}
                  numberOfLines={1}>
                  {s.author.displayName || s.author.handle}
                  {s.viewerCount?.count
                    ? ` · ${s.viewerCount.count} assistindo`
                    : ''}
                </Text>
              </View>
            </Link>
          ))
        ) : (
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            Ninguém ao vivo agora.
          </Text>
        )
      ) : list.length ? (
        list.map(v => (
          <View key={v.uri} style={[a.flex_row, a.gap_sm, a.align_start]}>
            <View style={[a.flex_1]}>
              <VideoRow video={v} />
            </View>
            <QueueButton video={v} queued={queue.some(q => q.uri === v.uri)} />
          </View>
        ))
      ) : (
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          {recs.loading ? 'Carregando…' : 'Nenhum vídeo aqui agora.'}
        </Text>
      )}
    </View>
  )
}

function QueueButton({video, queued}: {video: ViewVideoRef; queued: boolean}) {
  return (
    <Button
      label={
        queued ? `Na fila: ${video.title}` : `Adicionar à fila: ${video.title}`
      }
      size="tiny"
      variant="ghost"
      color="secondary"
      onPress={() => (queued ? removeFromQueue(video.uri) : addToQueue(video))}>
      <ButtonText>{queued ? 'Na fila' : '+ Fila'}</ButtonText>
    </Button>
  )
}

function Thumb({
  uri,
  live,
  compact,
}: {
  uri?: string
  live?: boolean
  compact?: boolean
}) {
  const t = useTheme()
  return (
    <View
      style={[
        a.rounded_md,
        a.overflow_hidden,
        t.atoms.bg_contrast_50,
        {width: compact ? 96 : 168, aspectRatio: 16 / 9},
      ]}>
      {uri && (
        <Image
          source={{uri}}
          style={{width: '100%', height: '100%'}}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      )}
      {live && (
        <View
          style={[
            a.absolute,
            a.rounded_xs,
            a.px_xs,
            {right: 6, bottom: 6, backgroundColor: '#D92D20'},
          ]}>
          <Text style={[a.text_2xs, a.font_bold, {color: '#FFFFFF'}]}>
            AO VIVO
          </Text>
        </View>
      )}
    </View>
  )
}

function VideoRow({
  video,
  highlight,
  compact,
}: {
  video: ViewVideoRef
  highlight?: boolean
  compact?: boolean
}) {
  const t = useTheme()
  return (
    <Link
      to={watchPathOf(video)}
      label={`${video.title}, de ${video.author}`}
      style={[
        a.flex_row,
        a.gap_md,
        highlight && [a.p_xs, a.rounded_md, t.atoms.bg_contrast_25],
      ]}>
      <Thumb uri={video.thumbnail} compact={compact} />
      <View style={[a.flex_1, a.gap_2xs]}>
        <Text style={[a.text_sm, a.font_bold]} numberOfLines={2}>
          {video.title}
        </Text>
        <Text
          style={[a.text_xs, t.atoms.text_contrast_medium]}
          numberOfLines={1}>
          {video.author}
        </Text>
      </View>
    </Link>
  )
}
