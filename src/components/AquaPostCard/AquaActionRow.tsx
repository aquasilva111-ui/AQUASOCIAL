import {type ComponentProps, type ReactElement, type ReactNode} from 'react'
import {View} from 'react-native'
import {
  type AppBskyFeedDefs,
  type AppBskyFeedPost,
  type AppBskyFeedThreadgate,
  type RichText as RichTextAPI,
} from '@atproto/api'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'

import {useHaptics} from '#/lib/haptics'
import {type Shadow} from '#/state/cache/post-shadow'
import {EventStopper} from '#/view/com/util/EventStopper'
import {atoms as a, useTheme} from '#/alf'
import {Button} from '#/components/Button'
import {Bookmark, BookmarkFilled} from '#/components/icons/Bookmark'
import {EmojiSmile_Stroke2_Corner0_Rounded as EmojiSmile} from '#/components/icons/Emoji'
import {
  Heart2_Filled_Stroke2_Corner0_Rounded as HeartFilled,
  Heart2_Stroke2_Corner0_Rounded as HeartOutline,
} from '#/components/icons/Heart2'
import {PaperPlane_Stroke2_Corner0_Rounded as PaperPlane} from '#/components/icons/PaperPlane'
import {CloseQuote_Stroke2_Corner1_Rounded as Quote} from '#/components/icons/Quote'
import {Reply as ReplyIcon} from '#/components/icons/Reply'
import {Repost_Stroke2_Corner2_Rounded as Repost} from '#/components/icons/Repost'
import * as Menu from '#/components/Menu'
import {BookmarkButton} from '#/components/PostControls/BookmarkButton'
import {ShareMenuButton} from '#/components/PostControls/ShareMenu'
import {Text} from '#/components/Typography'
import {AQUA} from './palette'
import {usePostReaction} from './plugins'

const REACTIONS = ['😂', '😮', '😢', '🔥', '👏', '💯']

export type AquaLogContext =
  | 'FeedItem'
  | 'PostThreadItem'
  | 'Post'
  | 'ImmersiveVideo'

/**
 * The four notch icons. Repost, quote, and save stay on the react menu so
 * those handlers are still one tap away without a fifth icon in the cut-out.
 */
export function AquaActionRow({
  post,
  record,
  richText,
  big,
  logContext,
  threadgateRecord,
  liked,
  replyDisabled,
  likeLabel,
  replyLabel,
  onLike,
  onReply,
  onShare,
  onRepost,
  onQuote,
  isReposted,
  embeddingDisabled,
}: {
  post: Shadow<AppBskyFeedDefs.PostView>
  record: AppBskyFeedPost.Record
  richText: RichTextAPI
  big?: boolean
  logContext: AquaLogContext
  threadgateRecord?: AppBskyFeedThreadgate.Record
  liked: boolean
  replyDisabled?: boolean
  likeLabel: string
  replyLabel: string
  onLike: () => void
  onReply: () => void
  onShare: () => void
  onRepost: () => void
  onQuote: () => void
  isReposted: boolean
  embeddingDisabled: boolean
}) {
  const t = useTheme()
  const {_} = useLingui()
  const playHaptic = useHaptics()
  const iconColor = t.name === 'light' ? AQUA.ink : t.atoms.text.color

  return (
    <EventStopper onKeyDown={false}>
      <View style={[a.flex_row, a.align_center]}>
        <IconButton testID="likeBtn" label={likeLabel} onPress={onLike}>
          {liked ? (
            <HeartFilled width={22} height={22} style={{color: AQUA.like}} />
          ) : (
            <HeartOutline width={22} height={22} style={{color: iconColor}} />
          )}
        </IconButton>
        <IconButton
          testID="replyBtn"
          label={replyLabel}
          disabled={replyDisabled}
          onPress={
            replyDisabled
              ? undefined
              : () => {
                  playHaptic('Light')
                  onReply()
                }
          }>
          <ReplyIcon
            width={22}
            height={22}
            style={{color: iconColor, opacity: replyDisabled ? 0.4 : 1}}
          />
        </IconButton>
        <ShareMenuButton
          testID="postShareBtn"
          post={post}
          big={big}
          record={record}
          richText={richText}
          timestamp={post.indexedAt}
          threadgateRecord={threadgateRecord}
          onShare={onShare}
          icon={PaperPlane}
          iconColor={iconColor}
        />
        <ReactionMenu postUri={post.uri} iconColor={iconColor}>
          <Menu.Item
            testID="repostBtn"
            label={isReposted ? _(msg`Undo repost`) : _(msg`Repost`)}
            onPress={onRepost}>
            <Menu.ItemText>
              {isReposted ? _(msg`Undo repost`) : _(msg`Repost`)}
            </Menu.ItemText>
            <Menu.ItemIcon icon={Repost} />
          </Menu.Item>
          <Menu.Item
            testID="repostDropdownQuoteBtn"
            disabled={embeddingDisabled}
            label={
              embeddingDisabled
                ? _(msg`Quote posts disabled`)
                : _(msg`Quote post`)
            }
            onPress={onQuote}>
            <Menu.ItemText>
              {embeddingDisabled
                ? _(msg`Quote posts disabled`)
                : _(msg`Quote post`)}
            </Menu.ItemText>
            <Menu.ItemIcon icon={Quote} />
          </Menu.Item>
          <View style={[a.flex_row, a.align_center, a.px_xs]}>
            <BookmarkButton post={post} big={big} logContext={logContext} />
            <Text style={[a.text_md, t.atoms.text]}>
              {post.viewer?.bookmarked ? _(msg`Saved`) : _(msg`Save`)}
            </Text>
          </View>
        </ReactionMenu>
      </View>
    </EventStopper>
  )
}

/**
 * The same four notch icons for a post that is not an `app.bsky` record.
 * Repost and save stay on the react menu, as they do on the network card.
 */
export function AquaPlainActionRow({
  postUri,
  liked,
  reposted,
  saved,
  likeLabel,
  replyLabel,
  sendLabel,
  onLike,
  onReply,
  onSend,
  onRepost,
  onSave,
}: {
  postUri: string
  liked: boolean
  reposted: boolean
  saved: boolean
  likeLabel: string
  replyLabel: string
  sendLabel: string
  onLike: () => void
  onReply: () => void
  onSend: () => void
  onRepost: () => void
  onSave: () => void
}) {
  const t = useTheme()
  const {_} = useLingui()
  const iconColor = t.name === 'light' ? AQUA.ink : t.atoms.text.color
  return (
    <EventStopper onKeyDown={false}>
      <View style={[a.flex_row, a.align_center]}>
        <IconButton testID="likeBtn" label={likeLabel} onPress={onLike}>
          {liked ? (
            <HeartFilled width={22} height={22} style={{color: AQUA.like}} />
          ) : (
            <HeartOutline width={22} height={22} style={{color: iconColor}} />
          )}
        </IconButton>
        <IconButton testID="replyBtn" label={replyLabel} onPress={onReply}>
          <ReplyIcon width={22} height={22} style={{color: iconColor}} />
        </IconButton>
        <IconButton testID="sendBtn" label={sendLabel} onPress={onSend}>
          <PaperPlane width={22} height={22} style={{color: iconColor}} />
        </IconButton>
        <ReactionMenu postUri={postUri} iconColor={iconColor}>
          <Menu.Item
            testID="writeRepostBtn"
            label={reposted ? _(msg`Undo repost`) : _(msg`Repost`)}
            onPress={onRepost}>
            <Menu.ItemText>
              {reposted ? _(msg`Undo repost`) : _(msg`Repost`)}
            </Menu.ItemText>
            <Menu.ItemIcon icon={Repost} />
          </Menu.Item>
          <Menu.Item
            testID="writeSaveBtn"
            label={saved ? _(msg`Saved`) : _(msg`Save`)}
            onPress={onSave}>
            <Menu.ItemText>
              {saved ? _(msg`Saved`) : _(msg`Save`)}
            </Menu.ItemText>
            <Menu.ItemIcon icon={saved ? BookmarkFilled : Bookmark} />
          </Menu.Item>
        </ReactionMenu>
      </View>
    </EventStopper>
  )
}

function ReactionMenu({
  postUri,
  iconColor,
  children,
}: {
  postUri: string
  iconColor: string
  children?: ReactNode
}) {
  const {_} = useLingui()
  const {emoji, setReaction} = usePostReaction(postUri)
  return (
    <Menu.Root>
      <Menu.Trigger label={_(msg`React to this post`)}>
        {({props}) => (
          <IconButton
            label={
              emoji ? _(msg`Reacted with ${emoji}`) : _(msg`React to this post`)
            }
            {...props}>
            {emoji ? (
              <Text style={{fontSize: 18}}>{emoji}</Text>
            ) : (
              <EmojiSmile width={22} height={22} style={{color: iconColor}} />
            )}
          </IconButton>
        )}
      </Menu.Trigger>
      <Menu.Outer>
        <View style={[a.flex_row, a.gap_sm, a.px_sm, a.py_xs]}>
          {REACTIONS.map(reaction => (
            <Button
              key={reaction}
              label={_(msg`React with ${reaction}`)}
              onPress={() =>
                setReaction(emoji === reaction ? undefined : reaction)
              }>
              <Text style={{fontSize: 22}}>{reaction}</Text>
            </Button>
          ))}
        </View>
        {children}
      </Menu.Outer>
    </Menu.Root>
  )
}

function IconButton({
  children,
  ...rest
}: Omit<ComponentProps<typeof Button>, 'children'> & {
  children: ReactElement
}) {
  return (
    <Button
      {...rest}
      hitSlop={6}
      style={[a.align_center, a.justify_center, {width: 34, height: 34}]}
      hoverStyle={a.bg_transparent}>
      {children}
    </Button>
  )
}
