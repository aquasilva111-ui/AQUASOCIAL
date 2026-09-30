import {useMemo, useState} from 'react'
import {View} from 'react-native'
import {Image} from 'expo-image'
import {type AppBskyActorDefs, type AppBskyFeedDefs, AtUri} from '@atproto/api'

import {getPostMedia} from '#/lib/media/experiences'
import {liveThumbUrl, type StreamplaceLivestreamView} from '#/lib/streamplace'
import {
  type ChannelSection,
  LANGUAGES,
  latestFirst,
  popularFirst,
  SECTION_LABELS,
  type ViewChannelRecord,
} from '#/lib/view-channel/model'
import {type FeedPostSliceItem} from '#/state/queries/post-feed'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useBreakpoints, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {MediaCard} from '#/components/feeds/MediaCard'
import {Link} from '#/components/Link'
import {VideoEmbed} from '#/components/Post/Embed/VideoEmbed'
import {Text} from '#/components/Typography'

export type ChannelTab =
  | 'home'
  | 'videos'
  | 'live'
  | 'playlists'
  | 'clips'
  | 'about'

const TABS: {tab: ChannelTab; label: string}[] = [
  {tab: 'home', label: 'Início'},
  {tab: 'videos', label: 'Vídeos'},
  {tab: 'live', label: 'Live'},
  {tab: 'playlists', label: 'Playlists'},
  {tab: 'clips', label: 'Clips'},
  {tab: 'about', label: 'Sobre'},
]

export type ChannelViewProps = {
  profile: AppBskyActorDefs.ProfileViewDetailed
  channel: ViewChannelRecord
  bannerUri?: string
  watermarkUri?: string
  videos: FeedPostSliceItem[]
  drops: FeedPostSliceItem[]
  hasMoreVideos?: boolean
  onLoadMoreVideos?: () => void
  live?: StreamplaceLivestreamView
  trailer?: AppBskyFeedDefs.PostView
  featured?: AppBskyFeedDefs.PostView
  isOwner: boolean
  /** Customization/creation preview: no playback, fixed column count. */
  preview?: {columns: number}
  actions?: React.ReactNode
  initialTab?: ChannelTab
}

/** Banner proportion per layout (desktop banners are wide and short). */
export function bannerAspect(columns: number) {
  return columns >= 4 ? 6.2 : columns >= 2 ? 4 : 3
}

/**
 * The public face of a View Channel. Identity (avatar, handle, follower
 * count) comes from the AQUA Profile; everything else from the channel
 * config. The Home tab is built only from the configured ChannelSections.
 */
export function ChannelView(props: ChannelViewProps) {
  const t = useTheme()
  const {gtMobile, gtTablet} = useBreakpoints()
  const columns = props.preview?.columns ?? (gtTablet ? 4 : gtMobile ? 2 : 1)
  const [tab, setTab] = useState<ChannelTab>(props.initialTab ?? 'home')
  const {profile, channel} = props
  const name =
    channel.displayNameOverride || profile.displayName || profile.handle
  const videoCount = props.videos.length

  return (
    <View style={[a.w_full]}>
      <ChannelBanner
        uri={props.bannerUri}
        focusY={channel.bannerFocusY ?? 50}
        aspect={bannerAspect(columns)}
      />
      <View style={[a.px_lg, a.pt_lg, a.gap_md]}>
        <View
          style={[
            columns > 1 ? a.flex_row : a.flex_col,
            a.gap_lg,
            columns > 1 && a.align_center,
          ]}>
          <UserAvatar
            type="user"
            size={columns > 1 ? 112 : 72}
            avatar={profile.avatar}
          />
          <View style={[a.flex_1, a.gap_xs, {minWidth: 0}]}>
            <Text
              style={[columns > 1 ? a.text_3xl : a.text_2xl, a.font_bold]}
              numberOfLines={2}>
              {name}
            </Text>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              @{profile.handle} · {profile.followersCount ?? 0} inscritos ·{' '}
              {videoCount}
              {props.hasMoreVideos ? '+' : ''}{' '}
              {videoCount === 1 ? 'vídeo' : 'vídeos'}
            </Text>
            {!!channel.description && (
              <Text
                style={[a.text_sm, t.atoms.text_contrast_high]}
                numberOfLines={2}>
                {channel.description}
              </Text>
            )}
            {!!channel.links.length && (
              <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
                {channel.links.slice(0, 3).map(link => (
                  <ChannelLinkItem
                    key={link.id}
                    label={link.label}
                    url={link.url}
                    disabled={!!props.preview}
                  />
                ))}
                {channel.links.length > 3 && (
                  <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                    e mais {channel.links.length - 3}
                  </Text>
                )}
              </View>
            )}
            {props.actions}
          </View>
        </View>

        <View
          accessibilityRole="tablist"
          style={[
            a.flex_row,
            a.flex_wrap,
            a.gap_xs,
            a.border_b,
            a.pb_sm,
            t.atoms.border_contrast_low,
          ]}>
          {TABS.map(x => (
            <Button
              key={x.tab}
              label={x.label}
              size="small"
              variant={tab === x.tab ? 'solid' : 'ghost'}
              color="secondary"
              accessibilityRole="tab"
              accessibilityState={{selected: tab === x.tab}}
              onPress={() => setTab(x.tab)}>
              <ButtonText>{x.label}</ButtonText>
            </Button>
          ))}
        </View>

        {tab === 'home' && <HomeTab {...props} columns={columns} />}
        {tab === 'videos' && (
          <View style={[a.gap_md]}>
            <VideoGrid
              items={latestFirst(props.videos.map(asStat)).map(s => s.item)}
              columns={columns}
              empty="Nenhum vídeo publicado ainda."
            />
            {props.hasMoreVideos && !props.preview && (
              <View style={[a.align_center]}>
                <Button
                  label="Carregar mais vídeos"
                  size="small"
                  color="secondary"
                  onPress={() => props.onLoadMoreVideos?.()}>
                  <ButtonText>Carregar mais</ButtonText>
                </Button>
              </View>
            )}
          </View>
        )}
        {tab === 'live' && (
          <LiveTab live={props.live} isOwner={props.isOwner} />
        )}
        {(tab === 'playlists' || tab === 'clips') && (
          <EmptyText>
            {tab === 'playlists'
              ? 'Playlists ainda não estão disponíveis no View.'
              : 'Clips ainda não estão disponíveis no View.'}
          </EmptyText>
        )}
        {tab === 'about' && <AboutTab {...props} />}
        <View style={{height: 80}} />
      </View>
    </View>
  )
}

// ------------------------------------------------------------ pieces

export function ChannelBanner({
  uri,
  focusY,
  aspect,
}: {
  uri?: string
  focusY: number
  aspect: number
}) {
  const t = useTheme()
  return (
    <View
      style={[
        a.w_full,
        a.overflow_hidden,
        t.atoms.bg_contrast_50,
        {aspectRatio: aspect},
      ]}>
      {uri && (
        <Image
          source={{uri}}
          style={[a.absolute, a.inset_0]}
          contentFit="cover"
          contentPosition={{left: '50%', top: `${focusY}%`}}
          accessibilityIgnoresInvertColors
          accessibilityLabel="Banner do canal"
          accessibilityHint=""
        />
      )}
    </View>
  )
}

function ChannelLinkItem({
  label,
  url,
  disabled,
}: {
  label: string
  url: string
  disabled: boolean
}) {
  const t = useTheme()
  const text = (
    <Text style={[a.text_sm, a.font_semi_bold, t.atoms.text_contrast_high]}>
      {label} ↗
    </Text>
  )
  if (disabled) return text
  return (
    <Link to={url} label={`${label}: ${url}`}>
      {text}
    </Link>
  )
}

function EmptyText({children}: {children: React.ReactNode}) {
  const t = useTheme()
  return (
    <Text style={[a.text_sm, a.py_md, t.atoms.text_contrast_medium]}>
      {children}
    </Text>
  )
}

const asStat = (item: FeedPostSliceItem) => ({
  item,
  uri: item.uri,
  indexedAt: item.post.indexedAt,
  likeCount: item.post.likeCount,
  repostCount: item.post.repostCount,
  replyCount: item.post.replyCount,
  quoteCount: item.post.quoteCount,
})

export function VideoGrid({
  items,
  columns,
  empty,
  limit,
}: {
  items: FeedPostSliceItem[]
  columns: number
  empty?: string
  limit?: number
}) {
  const shown = limit ? items.slice(0, limit) : items
  if (!shown.length) return empty ? <EmptyText>{empty}</EmptyText> : null
  const rows: FeedPostSliceItem[][] = []
  for (let i = 0; i < shown.length; i += columns)
    rows.push(shown.slice(i, i + columns))
  return (
    <View style={[a.gap_md]}>
      {rows.map(row => (
        <View key={row[0].uri} style={[a.flex_row, a.gap_md]}>
          {row.map(item => (
            <View key={item.uri} style={[a.flex_1, {minWidth: 0}]}>
              <MediaCard item={item} mode="video" />
            </View>
          ))}
          {Array.from({length: columns - row.length}, (_, i) => (
            <View key={`pad${i}`} style={a.flex_1} />
          ))}
        </View>
      ))}
    </View>
  )
}

function watchPath(post: AppBskyFeedDefs.PostView) {
  return `/views/watch/${post.author.did}/${new AtUri(post.uri).rkey}`
}

/** Trailer / featured video, with the channel watermark over the player. */
function Spotlight({
  post,
  label,
  watermarkUri,
  preview,
}: {
  post: AppBskyFeedDefs.PostView
  label: string
  watermarkUri?: string
  preview: boolean
}) {
  const t = useTheme()
  const media = getPostMedia(post)
  const text =
    (post.record as {text?: string} | undefined)?.text?.split('\n')[0] ?? ''
  const thumb = media.type === 'video' ? media.view.thumbnail : undefined
  return (
    <View style={[a.gap_sm]}>
      <Text style={[a.text_xs, a.font_bold, t.atoms.text_contrast_medium]}>
        {label.toUpperCase()}
      </Text>
      <View style={[a.relative, a.rounded_md, a.overflow_hidden]}>
        {media.type === 'video' && !preview ? (
          <VideoEmbed embed={media.view} />
        ) : (
          <View
            style={[a.w_full, t.atoms.bg_contrast_50, {aspectRatio: 16 / 9}]}>
            {thumb && (
              <Image
                source={{uri: thumb}}
                style={[a.absolute, a.inset_0]}
                contentFit="cover"
                accessibilityIgnoresInvertColors
                accessibilityLabel={text || label}
                accessibilityHint=""
              />
            )}
          </View>
        )}
        {watermarkUri && (
          <View
            pointerEvents="none"
            style={[a.absolute, {right: 12, bottom: 12, width: '12%'}]}>
            <Image
              source={{uri: watermarkUri}}
              style={{width: '100%', aspectRatio: 1, opacity: 0.75}}
              contentFit="contain"
              accessibilityIgnoresInvertColors
              accessibilityLabel="Marca d'água do canal"
              accessibilityHint=""
            />
          </View>
        )}
      </View>
      <View style={[a.flex_row, a.align_center, a.gap_sm, a.flex_wrap]}>
        {!!text && (
          <Text style={[a.text_md, a.font_bold, a.flex_1]} numberOfLines={2}>
            {text}
          </Text>
        )}
        {!preview && (
          <Link to={watchPath(post)} label={`Abrir vídeo: ${text || label}`}>
            <Text style={[a.text_sm, a.font_bold, t.atoms.text_contrast_high]}>
              Abrir vídeo →
            </Text>
          </Link>
        )}
      </View>
    </View>
  )
}

function LiveCard({
  live,
  preview,
}: {
  live: StreamplaceLivestreamView
  preview?: boolean
}) {
  const t = useTheme()
  const body = (
    <View style={[a.gap_sm, {maxWidth: 480}]}>
      <View
        style={[
          a.w_full,
          a.rounded_md,
          a.overflow_hidden,
          t.atoms.bg_contrast_50,
          {aspectRatio: 16 / 9},
        ]}>
        <Image
          source={{uri: liveThumbUrl(live.author.did)}}
          style={[a.absolute, a.inset_0]}
          contentFit="cover"
          accessibilityIgnoresInvertColors
          accessibilityLabel={live.record.title || 'Transmissão ao vivo'}
          accessibilityHint=""
        />
        <View
          style={[
            a.absolute,
            a.rounded_sm,
            a.px_sm,
            {top: 8, left: 8, backgroundColor: '#e0242e'},
          ]}>
          <Text style={[a.text_xs, a.font_bold, {color: '#fff'}]}>AO VIVO</Text>
        </View>
      </View>
      <Text style={[a.text_md, a.font_bold]} numberOfLines={2}>
        {live.record.title || 'Ao vivo agora'}
      </Text>
    </View>
  )
  if (preview) return body
  return (
    <Link
      to={`/views/live/${live.author.handle}`}
      label={`Assistir ${live.record.title || 'transmissão'}`}>
      {body}
    </Link>
  )
}

function LiveTab({
  live,
  isOwner,
}: {
  live?: StreamplaceLivestreamView
  isOwner: boolean
}) {
  const t = useTheme()
  if (live) return <LiveCard live={live} />
  return (
    <View style={[a.gap_sm]}>
      <EmptyText>Nenhuma transmissão ao vivo agora.</EmptyText>
      {isOwner && (
        <Link to="/views/golive" label="Transmitir ao vivo">
          <Text style={[a.text_sm, a.font_bold, t.atoms.text_contrast_high]}>
            Transmitir ao vivo →
          </Text>
        </Link>
      )}
    </View>
  )
}

function SectionBlock({
  section,
  props,
  columns,
}: {
  section: ChannelSection
  props: ChannelViewProps
  columns: number
}) {
  const t = useTheme()
  const title = section.title || SECTION_LABELS[section.type]
  const stats = useMemo(() => props.videos.map(asStat), [props.videos])
  let body: React.ReactNode = null
  switch (section.type) {
    case 'latest':
      body = (
        <VideoGrid
          items={latestFirst(stats).map(s => s.item)}
          columns={columns}
          limit={columns}
        />
      )
      break
    case 'popular':
      body = (
        <VideoGrid
          items={popularFirst(stats).map(s => s.item)}
          columns={columns}
          limit={columns}
        />
      )
      break
    case 'videos':
      body = (
        <VideoGrid
          items={latestFirst(stats).map(s => s.item)}
          columns={columns}
          limit={columns * 3}
        />
      )
      break
    case 'drops':
      body = (
        <VideoGrid
          items={props.drops}
          columns={Math.min(columns + 1, 5)}
          limit={Math.min(columns + 1, 5)}
        />
      )
      break
    case 'live':
      body = props.live ? (
        <LiveCard live={props.live} preview={!!props.preview} />
      ) : null
      break
    default:
      body = null
  }
  const hasContent =
    !!body &&
    (section.type === 'live'
      ? !!props.live
      : section.type === 'drops'
        ? props.drops.length > 0
        : props.videos.length > 0)
  // Visitors never see empty sections; the owner sees why they're empty.
  if (!hasContent && !props.isOwner) return null
  return (
    <View style={[a.gap_sm, a.pt_md]}>
      <Text style={[a.text_lg, a.font_bold]}>{title}</Text>
      {hasContent ? (
        body
      ) : (
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          {section.type === 'live'
            ? 'Aparece quando você estiver ao vivo.'
            : ['latest', 'popular', 'videos', 'drops'].includes(section.type)
              ? 'Aparece quando houver vídeos publicados.'
              : 'Este tipo de seção ainda não tem conteúdo disponível no View. Só você vê este aviso.'}
        </Text>
      )}
    </View>
  )
}

function HomeTab(props: ChannelViewProps & {columns: number}) {
  const following = !!props.profile.viewer?.following
  // Trailer for people not subscribed yet; featured video for everyone else.
  const spotlight =
    !following && !props.isOwner && props.trailer
      ? {post: props.trailer, label: 'Trailer do canal'}
      : props.featured
        ? {post: props.featured, label: 'Vídeo em destaque'}
        : props.trailer
          ? {post: props.trailer, label: 'Trailer do canal'}
          : undefined
  const sections = props.channel.sections.filter(
    s => s.visibility === 'visible',
  )
  return (
    <View style={[a.gap_md]}>
      {spotlight && (
        <Spotlight
          post={spotlight.post}
          label={spotlight.label}
          watermarkUri={props.watermarkUri}
          preview={!!props.preview}
        />
      )}
      {sections.map(section => (
        <SectionBlock
          key={section.id}
          section={section}
          props={props}
          columns={props.columns}
        />
      ))}
      {!sections.length && !spotlight && (
        <EmptyText>Este canal ainda não configurou a página inicial.</EmptyText>
      )}
    </View>
  )
}

function AboutTab(props: ChannelViewProps) {
  const t = useTheme()
  const {channel, profile} = props
  const language = LANGUAGES.find(l => l.code === channel.defaultLanguage)
  const row = (label: string, value: React.ReactNode) => (
    <View style={[a.gap_2xs]}>
      <Text style={[a.text_xs, a.font_bold, t.atoms.text_contrast_medium]}>
        {label}
      </Text>
      {typeof value === 'string' ? (
        <Text style={[a.text_md]}>{value}</Text>
      ) : (
        value
      )}
    </View>
  )
  return (
    <View style={[a.gap_lg, a.py_sm]}>
      {row('Descrição', channel.description || 'Sem descrição.')}
      {!!channel.links.length &&
        row(
          'Links',
          <View style={[a.gap_xs]}>
            {channel.links.map(l => (
              <ChannelLinkItem
                key={l.id}
                label={`${l.label} — ${l.url.replace(/^https?:\/\//, '')}`}
                url={l.url}
                disabled={!!props.preview}
              />
            ))}
          </View>,
        )}
      {!!channel.topics?.length && row('Tópicos', channel.topics.join(' · '))}
      {language && row('Idioma', language.label)}
      {channel.contactVisible &&
        !!channel.contact &&
        row('Contato', channel.contact)}
      {row(
        'Estatísticas',
        `${profile.followersCount ?? 0} inscritos · ${props.videos.length}${props.hasMoreVideos ? '+' : ''} vídeos` +
          (channel.createdAt
            ? ` · canal criado em ${new Date(channel.createdAt).toLocaleDateString('pt-BR')}`
            : ''),
      )}
    </View>
  )
}
