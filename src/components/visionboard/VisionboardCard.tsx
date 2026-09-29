import {useMemo} from 'react'
import {View} from 'react-native'
import {Image} from 'expo-image'
import {
  type AppBskyFeedDefs,
  AtUri,
  RichText as RichTextAPI,
} from '@atproto/api'

import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {getPostTextAndFacets} from '#/lib/strings/long-post'
import {type VisionboardItem} from '#/lib/visionboard/model'
import {
  POST_TOMBSTONE,
  type Shadow,
  usePostShadow,
} from '#/state/cache/post-shadow'
import {IMAGE_BORDER_RADIUS} from '#/view/com/util/images/constants'
import {PostMeta} from '#/view/com/util/PostMeta'
import {PreviewableUserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {MediaMask} from '#/components/feeds/MediaCard'
import {Link} from '#/components/Link'
import * as Hider from '#/components/moderation/Hider'
import {PostControls} from '#/components/PostControls'
import {Text} from '#/components/Typography'

export function VisionboardCard({item}: {item: VisionboardItem}) {
  const post = usePostShadow(item.item.post)
  if (post === POST_TOMBSTONE) return null
  return <VisionboardCardInner item={item} post={post} />
}

function VisionboardCardInner({
  item,
  post,
}: {
  item: VisionboardItem
  post: Shadow<AppBskyFeedDefs.PostView>
}) {
  const t = useTheme()
  const {openComposer} = useOpenComposer()
  const record = item.item.record
  const richText = useMemo(
    () => new RichTextAPI(getPostTextAndFacets(record)),
    [record],
  )
  const modui = useMemo(() => {
    const list = item.moderation.ui('contentList')
    const image = item.moderation.ui('contentMedia')
    list.blurs = [...list.blurs, ...image.blurs]
    list.alerts = [...list.alerts, ...image.alerts]
    list.filters = [...list.filters, ...image.filters]
    return list
  }, [item.moderation])
  if (modui.filter) return null
  const aspectRatio =
    item.width && item.height && item.width > 0 && item.height > 0
      ? item.width / item.height
      : 1
  const rkey = new AtUri(item.uri).rkey
  const href = `/visionboard/view/${post.author.did}/${rkey}`
  return (
    <View
      style={[a.overflow_hidden, a.pb_sm, {borderRadius: IMAGE_BORDER_RADIUS}]}
      testID="visionboard-card">
      <Hider.Outer modui={modui}>
        <Hider.Mask>
          <MediaMask aspectRatio={aspectRatio} />
        </Hider.Mask>
        <Hider.Content>
          <Link
            to={href}
            label={item.title || item.altText || 'View image'}
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
                source={{uri: item.thumbnailUrl}}
                style={[a.w_full, a.h_full]}
                contentFit="cover"
                accessibilityLabel={item.altText || item.title}
                transition={150}
                recyclingKey={item.id}
              />
            </View>
            {!!item.title && (
              <Text
                numberOfLines={3}
                style={[a.pt_sm, a.text_sm, a.font_semi_bold, a.leading_snug]}>
                {item.title}
              </Text>
            )}
          </Link>
          <View style={[a.flex_row, a.gap_xs, a.align_center, a.pt_sm]}>
            <PreviewableUserAvatar
              size={24}
              profile={post.author}
              moderation={item.moderation.ui('avatar')}
            />
            <View style={[a.flex_1, {minWidth: 0}]}>
              <PostMeta
                author={post.author}
                moderation={item.moderation}
                timestamp={post.indexedAt}
                postHref={href}
              />
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
