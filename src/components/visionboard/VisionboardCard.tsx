import {useMemo} from 'react'
import {View} from 'react-native'
import {Image} from 'expo-image'
import {
  type AppBskyFeedDefs,
  AtUri,
  RichText as RichTextAPI,
} from '@atproto/api'

import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {makeProfileLink} from '#/lib/routes/links'
import {getPostTextAndFacets} from '#/lib/strings/long-post'
import {type VisionboardItem} from '#/lib/visionboard/model'
import {
  POST_TOMBSTONE,
  type Shadow,
  usePostShadow,
} from '#/state/cache/post-shadow'
import {IMAGE_BORDER_RADIUS} from '#/view/com/util/images/constants'
import {PostMeta} from '#/view/com/util/PostMeta'
import {PreviewableUserAvatar, UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme, web} from '#/alf'
import {MediaMask} from '#/components/feeds/MediaCard'
import {useInteractionState} from '#/components/hooks/useInteractionState'
import {Link} from '#/components/Link'
import * as Hider from '#/components/moderation/Hider'
import {PostControls} from '#/components/PostControls'
import {Text} from '#/components/Typography'
import {SaveToBoardButton} from './SaveToBoardButton'

export type VisionboardCardVariant = 'feed' | 'board'

/**
 * `feed`: compact card inside the app column (native + narrow layouts).
 * `board`: the full-page Visionboard look — big rounded image, hover Save,
 * title and creator below. Both render the same AQUA post.
 */
export function VisionboardCard({
  item,
  variant = 'feed',
}: {
  item: VisionboardItem
  variant?: VisionboardCardVariant
}) {
  const post = usePostShadow(item.item.post)
  if (post === POST_TOMBSTONE) return null
  if (variant === 'board') {
    return <VisionboardBoardCard item={item} post={post} />
  }
  return <VisionboardCardInner item={item} post={post} />
}

function useVisionboardModui(item: VisionboardItem) {
  return useMemo(() => {
    const list = item.moderation.ui('contentList')
    const image = item.moderation.ui('contentMedia')
    list.blurs = [...list.blurs, ...image.blurs]
    list.alerts = [...list.alerts, ...image.alerts]
    list.filters = [...list.filters, ...image.filters]
    return list
  }, [item.moderation])
}

function getAspectRatio(item: VisionboardItem) {
  return item.width && item.height && item.width > 0 && item.height > 0
    ? item.width / item.height
    : 1
}

const BOARD_RADIUS = 28

function VisionboardBoardCard({
  item,
  post,
}: {
  item: VisionboardItem
  post: Shadow<AppBskyFeedDefs.PostView>
}) {
  const t = useTheme()
  const modui = useVisionboardModui(item)
  const {state: hovered, onIn, onOut} = useInteractionState()
  if (modui.filter) return null
  const aspectRatio = getAspectRatio(item)
  const href = `/visionboard/view/${post.author.did}/${new AtUri(item.uri).rkey}`
  const name = post.author.displayName || post.author.handle

  return (
    <View
      testID="visionboard-card"
      style={[{paddingBottom: 8}]}
      // @ts-expect-error web only
      onMouseEnter={onIn}
      onMouseLeave={onOut}>
      <Hider.Outer modui={modui}>
        <Hider.Mask>
          <MediaMask aspectRatio={aspectRatio} />
        </Hider.Mask>
        <Hider.Content>
          <View style={[a.relative]}>
            <Link
              to={href}
              label={item.title || item.altText || 'Abrir imagem'}
              style={[a.w_full, {display: 'flex', flexDirection: 'column'}]}>
              <View
                style={[
                  a.w_full,
                  a.overflow_hidden,
                  t.atoms.bg_contrast_25,
                  {aspectRatio, borderRadius: BOARD_RADIUS},
                ]}>
                <Image
                  accessibilityIgnoresInvertColors
                  accessibilityHint="Abre a publicação original"
                  source={{uri: item.thumbnailUrl}}
                  style={[
                    a.w_full,
                    a.h_full,
                    web({
                      transition: 'transform 300ms ease',
                      transform: hovered ? 'scale(1.03)' : undefined,
                    }),
                  ]}
                  contentFit="cover"
                  accessibilityLabel={item.altText || item.title}
                  transition={150}
                  recyclingKey={item.id}
                />
              </View>
            </Link>
            <View
              pointerEvents="box-none"
              style={[
                a.absolute,
                {top: 12, right: 12},
                web({
                  opacity: hovered || post.viewer?.bookmarked ? 1 : 0,
                  transition: 'opacity 150ms ease',
                }),
              ]}>
              <SaveButton post={post} item={item} />
            </View>
          </View>
          {!!item.title && (
            <Text
              numberOfLines={2}
              style={[
                a.pt_sm,
                a.px_xs,
                a.text_md,
                a.font_bold,
                a.leading_snug,
              ]}>
              {item.title}
            </Text>
          )}
          <Link
            to={makeProfileLink(post.author)}
            label={name}
            style={[a.flex_row, a.align_center, a.gap_xs, a.pt_xs, a.px_xs]}>
            <UserAvatar
              size={20}
              avatar={post.author.avatar}
              type={post.author.associated?.labeler ? 'labeler' : 'user'}
              moderation={item.moderation.ui('avatar')}
            />
            <Text
              numberOfLines={1}
              style={[a.flex_1, a.text_sm, t.atoms.text_contrast_medium]}>
              {name}
            </Text>
          </Link>
        </Hider.Content>
      </Hider.Outer>
    </View>
  )
}

/** Save opens the board picker; it also keeps the image in AQUA Saved. */
function SaveButton({
  post,
  item,
}: {
  post: Shadow<AppBskyFeedDefs.PostView>
  item: VisionboardItem
}) {
  return (
    <SaveToBoardButton
      compact
      target={{post, imageIndex: 0, thumbUrl: item.thumbnailUrl}}
    />
  )
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
  const modui = useVisionboardModui(item)
  if (modui.filter) return null
  const aspectRatio = getAspectRatio(item)
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
