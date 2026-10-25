import {useMemo, useState} from 'react'
import {View} from 'react-native'
import {Image} from 'expo-image'
import {
  type AppBskyFeedDefs,
  type AppBskyFeedPost,
  AtUri,
  type ModerationDecision,
  type ModerationUI,
  RichText as RichTextAPI,
} from '@atproto/api'

import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {getPostMedia, type MediaExperience} from '#/lib/media/experiences'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {getPostTextAndFacets} from '#/lib/strings/long-post'
import {splitTitle} from '#/lib/view-watch/chapters'
import {
  POST_TOMBSTONE,
  type Shadow,
  usePostShadow,
} from '#/state/cache/post-shadow'
import {type FeedPostSliceItem} from '#/state/queries/post-feed'
import {PostMeta} from '#/view/com/util/PostMeta'
import {PreviewableUserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {AquaEmbedChrome, AquaPostCard} from '#/components/AquaPostCard'
import {AQUA_RADIUS} from '#/components/AquaPostCard/palette'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import * as Hider from '#/components/moderation/Hider'
import {Text} from '#/components/Typography'

export function MediaCard({
  item,
  mode,
}: {
  item: FeedPostSliceItem
  mode: MediaExperience
}) {
  const post = usePostShadow(item.post)
  if (post === POST_TOMBSTONE) return null
  return <MediaCardInner item={{...item, post}} mode={mode} />
}

function MediaCardInner({
  item,
  mode,
}: {
  item: FeedPostSliceItem & {post: Shadow<AppBskyFeedDefs.PostView>}
  mode: MediaExperience
}) {
  const {post, record, moderation} = item
  const t = useTheme()
  const media = getPostMedia(post)
  const modui = useMemo(() => {
    const list = moderation.ui('contentList')
    const image = moderation.ui('contentMedia')
    list.blurs = [...list.blurs, ...image.blurs]
    list.alerts = [...list.alerts, ...image.alerts]
    list.filters = [...list.filters, ...image.filters]
    return list
  }, [moderation])
  if (modui.filter || (media.type !== 'images' && media.type !== 'video'))
    return null
  const image = media.type === 'images' ? media.view.images[0] : undefined
  const thumbnail =
    image?.thumb ?? (media.type === 'video' ? media.view.thumbnail : undefined)
  const ratio = image?.aspectRatio
  const aspectRatio =
    mode === 'video'
      ? 16 / 9
      : ratio && ratio.width > 0 && ratio.height > 0
        ? ratio.width / ratio.height
        : 1
  const rkey = new AtUri(post.uri).rkey
  const href = `/${mode === 'video' ? 'views/watch' : 'visionboard/view'}/${post.author.did}/${rkey}`
  if (mode === 'video') {
    return (
      <VideoMediaCard
        post={post}
        record={record}
        moderation={moderation}
        mediaModui={moderation.ui('contentMedia')}
        title={splitTitle(record.text ?? '').title}
        href={href}
        thumbnail={thumbnail}
      />
    )
  }
  return (
    <View
      style={[a.overflow_hidden, a.pb_sm, {borderRadius: AQUA_RADIUS.card}]}
      testID={`media-card-${mode}`}>
      <Hider.Outer modui={modui}>
        <Hider.Mask>
          <MediaMask aspectRatio={aspectRatio} />
        </Hider.Mask>
        <Hider.Content>
          <Link
            to={href}
            label={record.text || 'Ver imagem'}
            style={[a.w_full, {display: 'flex', flexDirection: 'column'}]}>
            <View
              style={[
                a.w_full,
                a.overflow_hidden,
                t.atoms.bg_contrast_25,
                {
                  aspectRatio,
                  borderRadius: AQUA_RADIUS.media,
                },
              ]}>
              <Image
                accessibilityIgnoresInvertColors
                accessibilityHint="Abre a publicação original"
                source={thumbnail ? {uri: thumbnail} : undefined}
                style={[a.w_full, a.h_full]}
                contentFit={mode === 'images' ? 'contain' : 'cover'}
                accessibilityLabel={image?.alt || record.text}
                transition={150}
                recyclingKey={post.uri}
              />
              <AquaEmbedChrome post={post} logContext="FeedItem" />
            </View>
            {!!record.text && (
              <Text
                numberOfLines={3}
                style={[a.pt_sm, a.text_sm, a.font_semi_bold, a.leading_snug]}>
                {record.text}
              </Text>
            )}
          </Link>
          <View style={[a.flex_row, a.gap_xs, a.align_center, a.pt_sm]}>
            <PreviewableUserAvatar
              size={24}
              profile={post.author}
              moderation={moderation.ui('avatar')}
            />
            <View style={[a.flex_1, {minWidth: 0}]}>
              <PostMeta
                author={post.author}
                moderation={moderation}
                timestamp={post.indexedAt}
                postHref={href}
              />
            </View>
          </View>
        </Hider.Content>
      </Hider.Outer>
    </View>
  )
}

/**
 * A video in the Views list: the same frameless post card as the feed
 * (author row, title above, rounded media with the glass actions), with the
 * thumbnail opening the watch page instead of playing in place.
 */
function VideoMediaCard({
  post,
  record,
  moderation,
  mediaModui,
  title,
  href,
  thumbnail,
}: {
  post: Shadow<AppBskyFeedDefs.PostView>
  record: AppBskyFeedPost.Record
  moderation: ModerationDecision
  mediaModui: ModerationUI
  title: string
  href: string
  thumbnail?: string
}) {
  const {openComposer} = useOpenComposer()
  const [thumbFailed, setThumbFailed] = useState(false)
  const richText = useMemo(
    () => new RichTextAPI(getPostTextAndFacets(record)),
    [record],
  )
  const caption = useMemo(() => new RichTextAPI({text: title}), [title])
  const channel = sanitizeDisplayName(
    post.author.displayName || sanitizeHandle(post.author.handle),
  )
  const showThumb = !!thumbnail && !thumbFailed
  return (
    <View style={[a.w_full, {minWidth: 0}]} testID="media-card-video">
      <AquaPostCard
        post={post}
        moderation={moderation}
        record={record}
        richText={richText}
        captionRichText={caption}
        logContext="FeedItem"
        postHref={href}
        onPressReply={() =>
          openComposer({
            replyTo: {
              uri: post.uri,
              cid: post.cid,
              text: record.text || '',
              author: post.author,
              embed: post.embed,
              langs: record.langs,
            },
          })
        }
        renderMedia={chrome => (
          <Hider.Outer modui={mediaModui}>
            <Hider.Mask>
              <MediaMask aspectRatio={16 / 9} />
            </Hider.Mask>
            <Hider.Content>
              <Link
                to={href}
                label={title || 'Assistir vídeo'}
                style={[a.w_full, {display: 'flex', flexDirection: 'column'}]}>
                <View
                  style={[
                    a.w_full,
                    a.overflow_hidden,
                    a.align_center,
                    a.justify_center,
                    {
                      aspectRatio: 16 / 9,
                      borderRadius: AQUA_RADIUS.media,
                      backgroundColor: '#16324a',
                    },
                  ]}>
                  {showThumb ? (
                    <Image
                      accessibilityIgnoresInvertColors
                      accessibilityHint="Abre o vídeo"
                      source={{uri: thumbnail}}
                      style={[a.w_full, a.h_full]}
                      contentFit="cover"
                      accessibilityLabel={title || channel}
                      transition={150}
                      recyclingKey={post.uri}
                      onError={() => setThumbFailed(true)}
                    />
                  ) : (
                    <Text style={[a.text_xl, a.font_bold, {color: '#fff'}]}>
                      {(channel || 'V').slice(0, 1).toLocaleUpperCase('pt-BR')}
                    </Text>
                  )}
                  {chrome}
                </View>
              </Link>
            </Hider.Content>
          </Hider.Outer>
        )}
      />
    </View>
  )
}

export function MediaMask({aspectRatio}: {aspectRatio: number}) {
  const hider = Hider.useHider()
  const t = useTheme()
  return (
    <View
      style={[
        a.p_sm,
        a.justify_center,
        a.gap_sm,
        t.atoms.bg_contrast_50,
        {aspectRatio},
      ]}>
      <Text style={a.text_sm}>{hider.info.name}</Text>
      <Button label="Ver detalhes da moderação" onPress={hider.showInfoDialog}>
        <ButtonText>Detalhes</ButtonText>
      </Button>
      {hider.meta.allowOverride && (
        <Button
          label="Mostrar conteúdo"
          onPress={() => hider.setIsContentVisible(true)}>
          <ButtonText>Mostrar</ButtonText>
        </Button>
      )}
    </View>
  )
}
