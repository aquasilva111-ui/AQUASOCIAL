import {memo, useMemo, useState} from 'react'
import {StyleSheet, View} from 'react-native'
import {
  type AppBskyActorDefs,
  AppBskyFeedDefs,
  type AppBskyFeedPost,
  AppBskyFeedThreadgate,
  AtUri,
  type ModerationDecision,
  RichText as RichTextAPI,
} from '@atproto/api'
import {useNavigation} from '@react-navigation/native'
import {useQueryClient} from '@tanstack/react-query'

import {type ReasonFeedSource} from '#/lib/api/feed/types'
import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {usePalette} from '#/lib/hooks/usePalette'
import {makeProfileLink} from '#/lib/routes/links'
import {type NavigationProp} from '#/lib/routes/types'
import {useGate} from '#/lib/statsig/statsig'
import {getPostTextAndFacets} from '#/lib/strings/long-post'
import {
  POST_TOMBSTONE,
  type Shadow,
  usePostShadow,
} from '#/state/cache/post-shadow'
import {useFeedFeedbackContext} from '#/state/feed-feedback'
import {unstableCacheProfileView} from '#/state/queries/profile'
import {type FeedExperienceMode} from '#/state/shell/feed-experience'
import {
  buildPostSourceKey,
  setUnstablePostSource,
} from '#/state/unstable-post-source'
import {Link} from '#/view/com/util/Link'
import {AquaPostCard} from '#/components/AquaPostCard'
import {PostEmbedViewContext} from '#/components/Post/Embed/types'
import {PostRepliedTo} from '#/components/Post/PostRepliedTo'
import {DiscoverDebug} from '#/components/PostControls/DiscoverDebug'
import {SubtleHover} from '#/components/SubtleHover'
import {ENV} from '#/env'
import * as bsky from '#/types/bsky'
import {PostFeedReason} from './PostFeedReason'

interface FeedItemProps {
  record: AppBskyFeedPost.Record
  reason:
    | AppBskyFeedDefs.ReasonRepost
    | AppBskyFeedDefs.ReasonPin
    | ReasonFeedSource
    | {[k: string]: unknown; $type: string}
    | undefined
  moderation: ModerationDecision
  parentAuthor: AppBskyActorDefs.ProfileViewBasic | undefined
  showReplyTo: boolean
  isThreadChild?: boolean
  isThreadLastChild?: boolean
  isThreadParent?: boolean
  feedContext: string | undefined
  reqId: string | undefined
  hideTopBorder?: boolean
  isParentBlocked?: boolean
  isParentNotFound?: boolean
}

export function PostFeedItem({
  post,
  record,
  reason,
  feedContext,
  reqId,
  moderation,
  parentAuthor,
  showReplyTo,
  isThreadChild,
  isThreadLastChild,
  isThreadParent,
  hideTopBorder,
  isParentBlocked,
  isParentNotFound,
  rootPost,
  onShowLess,
  presentation = 'social',
}: FeedItemProps & {
  post: AppBskyFeedDefs.PostView
  rootPost: AppBskyFeedDefs.PostView
  onShowLess?: (interaction: AppBskyFeedDefs.Interaction) => void
  presentation?: FeedExperienceMode
}): React.ReactNode {
  const postShadowed = usePostShadow(post)
  const richText = useMemo(
    () => new RichTextAPI(getPostTextAndFacets(record)),
    [record],
  )
  if (postShadowed === POST_TOMBSTONE) {
    return null
  }
  if (richText && moderation) {
    return (
      <FeedItemInner
        // Safeguard from clobbering per-post state below:
        key={postShadowed.uri}
        post={postShadowed}
        record={record}
        reason={reason}
        feedContext={feedContext}
        reqId={reqId}
        richText={richText}
        parentAuthor={parentAuthor}
        showReplyTo={showReplyTo}
        moderation={moderation}
        isThreadChild={isThreadChild}
        isThreadLastChild={isThreadLastChild}
        isThreadParent={isThreadParent}
        hideTopBorder={hideTopBorder}
        isParentBlocked={isParentBlocked}
        isParentNotFound={isParentNotFound}
        rootPost={rootPost}
        onShowLess={onShowLess}
        presentation={presentation}
      />
    )
  }
  return null
}

let FeedItemInner = ({
  post,
  record,
  reason,
  feedContext,
  reqId,
  richText,
  moderation,
  parentAuthor,
  showReplyTo,
  isThreadChild,
  isThreadLastChild,
  isThreadParent,
  hideTopBorder: _hideTopBorder,
  isParentBlocked,
  isParentNotFound,
  rootPost,
  onShowLess,
  presentation = 'social',
}: FeedItemProps & {
  richText: RichTextAPI
  post: Shadow<AppBskyFeedDefs.PostView>
  rootPost: AppBskyFeedDefs.PostView
  onShowLess?: (interaction: AppBskyFeedDefs.Interaction) => void
  presentation?: FeedExperienceMode
}): React.ReactNode => {
  const queryClient = useQueryClient()
  const {openComposer} = useOpenComposer()
  const navigation = useNavigation<NavigationProp>()
  const pal = usePalette('default')
  const gate = useGate()

  const [hover, setHover] = useState(false)

  const [href, rkey] = useMemo(() => {
    const urip = new AtUri(post.uri)
    return [makeProfileLink(post.author, 'post', urip.rkey), urip.rkey]
  }, [post.uri, post.author])
  const {sendInteraction, feedSourceInfo} = useFeedFeedbackContext()

  const onPressReply = () => {
    sendInteraction({
      item: post.uri,
      event: 'app.bsky.feed.defs#interactionReply',
      feedContext,
      reqId,
    })
    if (gate('feed_reply_button_open_thread') && ENV !== 'e2e') {
      navigation.navigate('PostThread', {
        name: post.author.did,
        rkey,
      })
    } else {
      openComposer({
        replyTo: {
          uri: post.uri,
          cid: post.cid,
          text: record.text || '',
          author: post.author,
          embed: post.embed,
          moderation,
          langs: record.langs,
        },
      })
    }
  }

  const onOpenAuthor = () => {
    sendInteraction({
      item: post.uri,
      event: 'app.bsky.feed.defs#clickthroughAuthor',
      feedContext,
      reqId,
    })
  }

  const onOpenReposter = () => {
    sendInteraction({
      item: post.uri,
      event: 'app.bsky.feed.defs#clickthroughReposter',
      feedContext,
      reqId,
    })
  }

  const onOpenEmbed = () => {
    sendInteraction({
      item: post.uri,
      event: 'app.bsky.feed.defs#clickthroughEmbed',
      feedContext,
      reqId,
    })
  }

  const onBeforePress = () => {
    sendInteraction({
      item: post.uri,
      event: 'app.bsky.feed.defs#clickthroughItem',
      feedContext,
      reqId,
    })
    unstableCacheProfileView(queryClient, post.author)
    setUnstablePostSource(buildPostSourceKey(post.uri, post.author.handle), {
      feedSourceInfo,
      post: {
        post,
        reason: AppBskyFeedDefs.isReasonRepost(reason) ? reason : undefined,
        feedContext,
        reqId,
      },
    })
  }

  const outerStyles = [
    styles.outer,
    {
      borderColor: 'transparent',
      paddingBottom:
        isThreadLastChild || (!isThreadChild && !isThreadParent)
          ? 8
          : undefined,
      borderTopWidth: 0,
    },
  ]

  /**
   * If `post[0]` in this slice is the actual root post (not an orphan thread),
   * then we may have a threadgate record to reference
   */
  const threadgateRecord = bsky.dangerousIsType<AppBskyFeedThreadgate.Record>(
    rootPost.threadgate?.record,
    AppBskyFeedThreadgate.isRecord,
  )
    ? rootPost.threadgate.record
    : undefined

  const mediaFirst = ['images', 'drops', 'video'].includes(presentation)

  const viaRepost = useMemo(() => {
    if (AppBskyFeedDefs.isReasonRepost(reason) && reason.uri && reason.cid) {
      return {
        uri: reason.uri,
        cid: reason.cid,
      }
    }
  }, [reason])

  return (
    <Link
      testID={`feedItem-by-${post.author.handle}`}
      style={outerStyles}
      href={href}
      noFeedback
      accessible={false}
      onBeforePress={onBeforePress}
      dataSet={{feedContext}}
      onPointerEnter={() => {
        setHover(true)
      }}
      onPointerLeave={() => {
        setHover(false)
      }}>
      <SubtleHover hover={hover} />
      {isThreadChild ? (
        <View
          style={[
            styles.replyLine,
            {
              height: 12,
              marginLeft: 36,
              backgroundColor: pal.colors.replyLine,
              marginBottom: 4,
            },
          ]}
        />
      ) : null}
      {reason ? (
        <View style={styles.reason}>
          <PostFeedReason
            reason={reason}
            moderation={moderation}
            onOpenReposter={onOpenReposter}
          />
        </View>
      ) : null}
      <AquaPostCard
        post={post}
        moderation={moderation}
        record={record}
        richText={richText}
        onPressReply={onPressReply}
        logContext="FeedItem"
        feedContext={feedContext}
        reqId={reqId}
        threadgateRecord={threadgateRecord}
        onShowLess={onShowLess}
        viaRepost={viaRepost}
        onOpenAuthor={onOpenAuthor}
        postHref={href}
        onOpenEmbed={onOpenEmbed}
        viewContext={
          presentation === 'images'
            ? PostEmbedViewContext.FeedImages
            : PostEmbedViewContext.Feed
        }
        notices={
          showReplyTo &&
          !mediaFirst &&
          (parentAuthor || isParentBlocked || isParentNotFound) ? (
            <PostRepliedTo
              parentAuthor={parentAuthor}
              isParentBlocked={isParentBlocked}
              isParentNotFound={isParentNotFound}
            />
          ) : null
        }
        style={styles.card}
      />
      {isThreadParent ? (
        <View
          style={[
            styles.replyLine,
            {
              height: 12,
              marginLeft: 36,
              backgroundColor: pal.colors.replyLine,
              marginTop: 4,
            },
          ]}
        />
      ) : null}
      <DiscoverDebug feedContext={feedContext} />
    </Link>
  )
}
FeedItemInner = memo(FeedItemInner)

const styles = StyleSheet.create({
  outer: {
    paddingLeft: 10,
    paddingRight: 15,
    cursor: 'pointer',
  },
  replyLine: {
    width: 2,
  },
  reason: {
    paddingLeft: 8,
    paddingBottom: 6,
  },
  card: {
    marginHorizontal: 4,
  },
  embed: {
    marginBottom: 6,
  },
  translateLink: {
    marginBottom: 6,
  },
})
