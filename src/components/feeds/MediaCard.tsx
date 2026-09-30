import {useMemo} from 'react'
import {View} from 'react-native'
import {Image} from 'expo-image'
import {
  type AppBskyFeedDefs,
  AtUri,
  RichText as RichTextAPI,
} from '@atproto/api'

import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {getPostMedia, type MediaExperience} from '#/lib/media/experiences'
import {formatViewCount, useViewCount} from '#/lib/media/views'
import {getPostTextAndFacets} from '#/lib/strings/long-post'
import {
  POST_TOMBSTONE,
  type Shadow,
  usePostShadow,
} from '#/state/cache/post-shadow'
import {type FeedPostSliceItem} from '#/state/queries/post-feed'
import {IMAGE_BORDER_RADIUS} from '#/view/com/util/images/constants'
import {PostMeta} from '#/view/com/util/PostMeta'
import {PreviewableUserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import * as Hider from '#/components/moderation/Hider'
import {PostControls} from '#/components/PostControls'
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
  const {openComposer} = useOpenComposer()
  const media = getPostMedia(post)
  const viewCount = useViewCount(post.uri)
  const richText = useMemo(
    () => new RichTextAPI(getPostTextAndFacets(record)),
    [record],
  )
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
  return (
    <View
      style={[a.overflow_hidden, a.pb_sm, {borderRadius: IMAGE_BORDER_RADIUS}]}
      testID={`media-card-${mode}`}>
      <Hider.Outer modui={modui}>
        <Hider.Mask>
          <MediaMask aspectRatio={aspectRatio} />
        </Hider.Mask>
        <Hider.Content>
          <Link
            to={href}
            label={
              record.text || (mode === 'video' ? 'Watch video' : 'View image')
            }
            style={[a.w_full, {display: 'flex', flexDirection: 'column'}]}>
            <View
              style={[
                a.w_full,
                a.overflow_hidden,
                t.atoms.bg_contrast_25,
                {aspectRatio, borderRadius: IMAGE_BORDER_RADIUS},
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
            </View>
            {!!record.text && mode !== 'video' && (
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
              {mode === 'video' && (
                <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                  {formatViewCount(viewCount)} visualizações
                </Text>
              )}
            </View>
          </View>
          <PostControls
            style={{paddingTop: 6}}
            post={post}
            record={record}
            richText={richText}
            logContext="FeedItem"
            variant="compact"
            onPressReply={() =>
              openComposer({
                replyTo: {
                  uri: post.uri,
                  cid: post.cid,
                  text: record.text,
                  author: post.author,
                },
                onPost: () => {},
              })
            }
          />
        </Hider.Content>
      </Hider.Outer>
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
