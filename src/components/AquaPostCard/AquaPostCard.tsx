import {type ReactNode, useMemo, useState} from 'react'
import {type StyleProp, View, type ViewStyle} from 'react-native'
import {
  type AppBskyFeedDefs,
  AppBskyFeedPost,
  type AppBskyFeedThreadgate,
  AtUri,
  type ModerationDecision,
  type RichText as RichTextAPI,
} from '@atproto/api'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {useQueryClient} from '@tanstack/react-query'

import {useActorStatus} from '#/lib/actor-status'
import {MAX_POST_LINES} from '#/lib/constants'
import {makeProfileLink} from '#/lib/routes/links'
import {forceLTR} from '#/lib/strings/bidi'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {countLines} from '#/lib/strings/helpers'
import {niceDate} from '#/lib/strings/time'
import {
  formatDuration,
  formatViewLabel,
  knownDurationSeconds,
  knownViewCount,
} from '#/lib/views/format'
import {type Shadow} from '#/state/cache/post-shadow'
import {useProfileShadow} from '#/state/cache/profile-shadow'
import {precacheProfile} from '#/state/queries/profile'
import {useSession} from '#/state/session'
import {useMergedThreadgateHiddenReplies} from '#/state/threadgate-hidden-replies'
import {TimeElapsed} from '#/view/com/util/TimeElapsed'
import {PreviewableUserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme, web} from '#/alf'
import {Button} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {WebOnlyInlineLinkText} from '#/components/Link'
import {ContentHider} from '#/components/moderation/ContentHider'
import {LabelsOnMyPost} from '#/components/moderation/LabelsOnMe'
import {PostAlerts} from '#/components/moderation/PostAlerts'
import {type AppModerationCause} from '#/components/Pills'
import {Embed, PostEmbedViewContext} from '#/components/Post/Embed'
import {PostControls} from '#/components/PostControls'
import {PostMenuButton} from '#/components/PostControls/PostMenu'
import {ProfileHoverCard} from '#/components/ProfileHoverCard'
import {RichText} from '#/components/RichText'
import {Text} from '#/components/Typography'
import {useSimpleVerificationState} from '#/components/verification'
import {VerificationCheck} from '#/components/verification/VerificationCheck'
import * as bsky from '#/types/bsky'
import {LikeCapsule, LikedByLine} from './LikeCapsule'
import {AquaMediaChrome} from './MediaChrome'
import {aquaMediaKind, postOrigin, videoEmbedOf} from './model'
import {OriginBadge} from './OriginBadge'
import {AQUA, AQUA_RADIUS} from './palette'
import {useWhySeeingThis} from './plugins'
import {SparkleButton} from './SparkleButton'
import {WhySheet} from './WhySheet'

const FEED_CAPTION_LINES = 3
const VIDEO_CAPTION_LINES = 2

export function AquaPostCard({
  post,
  moderation,
  record,
  richText,
  onPressReply,
  logContext,
  feedContext,
  reqId,
  threadgateRecord,
  onShowLess,
  viaRepost,
  onOpenAuthor,
  postHref,
  big,
  truncate = true,
  selectable,
  textSize = 'md',
  moderationContext = 'contentList',
  ignoreMute,
  includeMute,
  alertSize,
  viewContext = PostEmbedViewContext.Feed,
  onOpenEmbed,
  leading,
  notices,
  trailing,
  headerTrailing,
  style,
}: {
  post: Shadow<AppBskyFeedDefs.PostView>
  moderation: ModerationDecision
  record: AppBskyFeedPost.Record
  richText: RichTextAPI
  onPressReply: () => void
  logContext: 'FeedItem' | 'PostThreadItem' | 'Post' | 'ImmersiveVideo'
  feedContext?: string
  reqId?: string
  threadgateRecord?: AppBskyFeedThreadgate.Record
  onShowLess?: (interaction: AppBskyFeedDefs.Interaction) => void
  viaRepost?: {uri: string; cid: string}
  onOpenAuthor?: () => void
  postHref: string
  big?: boolean
  truncate?: boolean
  selectable?: boolean
  textSize?: 'md' | 'lg'
  moderationContext?: 'contentList' | 'contentView'
  ignoreMute?: boolean
  includeMute?: boolean
  alertSize?: 'sm' | 'lg'
  viewContext?: PostEmbedViewContext
  onOpenEmbed?: () => void
  leading?: ReactNode
  notices?: ReactNode
  trailing?: ReactNode
  headerTrailing?: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const t = useTheme()
  const {_} = useLingui()
  const light = t.name === 'light'
  const cardBg = light ? AQUA.white : (t.atoms.bg.backgroundColor ?? AQUA.white)
  const ink = light ? AQUA.ink : t.atoms.text.color
  const muted = light ? AQUA.muted : t.atoms.text_contrast_medium.color
  const whyControl = Dialog.useDialogControl()
  const why = useWhySeeingThis(post.uri)
  const kind = aquaMediaKind(post.embed)
  const [expanded, setExpanded] = useState(false)
  const hiddenReplyAlerts = useHiddenReplyAlerts(post, threadgateRecord)
  const author = useProfileShadow(post.author)
  const displayName = sanitizeDisplayName(
    author.displayName || author.handle,
    moderation.ui('displayName'),
  )
  const lines = kind === 'video' ? VIDEO_CAPTION_LINES : FEED_CAPTION_LINES
  const long =
    richText.text.length > (kind === 'video' ? 90 : 180) ||
    countLines(richText.text) > lines
  const limit = truncate && !expanded && long
  const duration = formatDuration(
    knownDurationSeconds(videoEmbedOf(post.embed)),
  )
  const views =
    kind === 'video' ? formatViewLabel(knownViewCount(post)) : undefined

  const controls = (
    <PostControls
      chrome="aqua"
      big={big}
      post={post}
      record={record}
      richText={richText}
      onPressReply={onPressReply}
      logContext={logContext}
      feedContext={feedContext}
      reqId={reqId}
      threadgateRecord={threadgateRecord}
      onShowLess={onShowLess}
      viaRepost={viaRepost}
    />
  )
  const sparkle = <SparkleButton onPress={whyControl.open} />
  const capsule = (
    <LikeCapsule postUri={post.uri} likeCount={post.likeCount ?? 0} />
  )
  const chrome =
    kind === 'none' ? null : (
      <AquaMediaChrome
        notchColor={cardBg}
        actions={controls}
        capsule={capsule}
        sparkle={sparkle}
        duration={duration}
      />
    )

  const textStyle = [
    textSize === 'lg' ? a.text_lg : a.text_md,
    a.leading_snug,
    {color: ink},
    kind === 'video' && a.font_bold,
  ]

  return (
    <View
      style={[
        {
          backgroundColor: cardBg,
          borderRadius: AQUA_RADIUS.card,
          borderWidth: 1,
          borderColor: light
            ? AQUA.line
            : t.atoms.border_contrast_low.borderColor,
          padding: 14,
        },
        web({boxShadow: '0 10px 30px rgba(15,23,42,0.06)'}),
        style,
      ]}>
      {leading}
      <AquaPostHeader
        post={post}
        moderation={moderation}
        record={record}
        richText={richText}
        postHref={postHref}
        onOpenAuthor={onOpenAuthor}
        threadgateRecord={threadgateRecord}
        feedContext={feedContext}
        reqId={reqId}
        onShowLess={onShowLess}
        big={big}
        trailing={headerTrailing}
      />
      {notices}
      <LabelsOnMyPost post={post} style={[a.pb_xs]} />
      <ContentHider
        testID="contentHider-post"
        modui={moderation.ui(moderationContext)}
        ignoreMute={ignoreMute}
        childContainerStyle={a.gap_xs}>
        <PostAlerts
          modui={moderation.ui(moderationContext)}
          size={alertSize}
          includeMute={includeMute}
          style={[a.pb_2xs]}
          additionalCauses={hiddenReplyAlerts}
        />
        {kind !== 'none' && post.embed ? (
          <Embed
            embed={post.embed}
            moderation={moderation}
            onOpen={onOpenEmbed}
            viewContext={viewContext}
            mediaChrome={chrome}
            style={{marginTop: 0}}
          />
        ) : null}
        {kind === 'none' && richText.text ? (
          <RichText
            enableTags
            selectable={selectable}
            testID="postText"
            value={richText}
            numberOfLines={limit ? Math.min(lines, MAX_POST_LINES) : undefined}
            style={[a.flex_1, textStyle]}
            authorHandle={post.author.handle}
            shouldProxyLinks
          />
        ) : null}
        {kind === 'none' && post.embed ? (
          <Embed
            embed={post.embed}
            moderation={moderation}
            onOpen={onOpenEmbed}
            viewContext={viewContext}
          />
        ) : null}
        {kind !== 'none' && richText.text ? (
          <View style={[a.mt_sm]}>
            <Text
              emoji
              selectable={selectable}
              testID="postText"
              numberOfLines={limit ? lines : undefined}
              style={textStyle}>
              {kind !== 'video' ? (
                <Text style={[a.font_bold, {fontWeight: '800', color: ink}]}>
                  {displayName}{' '}
                </Text>
              ) : null}
              <RichText
                enableTags
                selectable={selectable}
                value={richText}
                style={textStyle}
                authorHandle={post.author.handle}
                shouldProxyLinks
              />
            </Text>
            {limit ? (
              <Button
                label={_(msg`Show more`)}
                onPress={() => setExpanded(true)}
                style={[a.self_start, a.mt_2xs]}>
                {({hovered}) => (
                  <Text
                    style={[
                      a.text_sm,
                      {
                        color: muted,
                        textDecorationLine: hovered ? 'underline' : 'none',
                      },
                    ]}>
                    {_(msg`…more`)}
                  </Text>
                )}
              </Button>
            ) : null}
          </View>
        ) : null}
        {kind === 'none' && limit ? (
          <Button
            label={_(msg`Show more`)}
            onPress={() => setExpanded(true)}
            style={a.self_start}>
            {({hovered}) => (
              <Text
                style={[
                  a.text_sm,
                  {
                    color: muted,
                    textDecorationLine: hovered ? 'underline' : 'none',
                  },
                ]}>
                {_(msg`…more`)}
              </Text>
            )}
          </Button>
        ) : null}
        {views ? (
          <Text style={[a.text_sm, {color: muted}]}>{views}</Text>
        ) : null}
        <LikedByLine postUri={post.uri} likeCount={post.likeCount ?? 0} />
        {kind === 'none' ? (
          <View
            style={[
              a.flex_row,
              a.align_center,
              a.mt_sm,
              a.pl_2xs,
              a.pr_sm,
              {
                minHeight: 50,
                borderRadius: 25,
                backgroundColor: light
                  ? AQUA.surface
                  : t.atoms.bg_contrast_25.backgroundColor,
              },
            ]}>
            {controls}
            {sparkle}
            <View style={a.flex_1} />
            {capsule}
          </View>
        ) : null}
      </ContentHider>
      {trailing}
      <WhySheet control={whyControl} data={why} />
    </View>
  )
}

function AquaPostHeader({
  post,
  moderation,
  record,
  richText,
  postHref,
  onOpenAuthor,
  threadgateRecord,
  feedContext,
  reqId,
  onShowLess,
  big,
  trailing,
}: {
  post: Shadow<AppBskyFeedDefs.PostView>
  moderation: ModerationDecision
  record: AppBskyFeedPost.Record
  richText: RichTextAPI
  postHref: string
  onOpenAuthor?: () => void
  threadgateRecord?: AppBskyFeedThreadgate.Record
  feedContext?: string
  reqId?: string
  onShowLess?: (interaction: AppBskyFeedDefs.Interaction) => void
  big?: boolean
  trailing?: ReactNode
}) {
  const t = useTheme()
  const {_, i18n} = useLingui()
  const queryClient = useQueryClient()
  const author = useProfileShadow(post.author)
  const {isActive: live} = useActorStatus(author)
  const verification = useSimpleVerificationState({profile: author})
  const light = t.name === 'light'
  const ink = light ? AQUA.ink : t.atoms.text.color
  const muted = light ? AQUA.muted : t.atoms.text_contrast_medium.color
  const displayName = sanitizeDisplayName(
    author.displayName || author.handle,
    moderation.ui('displayName'),
  )
  const profileLink = makeProfileLink(author)
  const timestampLabel = niceDate(i18n, post.indexedAt)
  const origin = postOrigin(author)

  return (
    <View style={[a.flex_row, a.align_center, a.gap_sm, a.mb_md, a.z_20]}>
      <View
        style={{
          padding: 2,
          borderRadius: 999,
          backgroundColor: AQUA.iris,
        }}>
        <View
          style={{
            borderRadius: 999,
            borderWidth: 2,
            borderColor: light ? AQUA.white : cardSafe(t),
          }}>
          <PreviewableUserAvatar
            size={42}
            profile={author}
            moderation={moderation.ui('avatar')}
            type={author.associated?.labeler ? 'labeler' : 'user'}
            onBeforePress={onOpenAuthor}
            live={live}
          />
        </View>
      </View>
      <View style={[a.flex_1]}>
        <View style={[a.flex_row, a.align_center]}>
          <ProfileHoverCard did={author.did}>
            <WebOnlyInlineLinkText
              emoji
              numberOfLines={1}
              to={profileLink}
              label={_(msg`View profile`)}
              disableMismatchWarning
              onPress={() => {
                precacheProfile(queryClient, author)
                onOpenAuthor?.()
              }}
              style={[
                a.font_bold,
                a.leading_tight,
                {fontSize: 15, fontWeight: '800', color: ink, maxWidth: '100%'},
              ]}>
              {forceLTR(displayName)}
            </WebOnlyInlineLinkText>
          </ProfileHoverCard>
          {verification.showBadge ? (
            <View style={[a.pl_2xs]}>
              <VerificationCheck
                width={12}
                verifier={verification.role === 'verifier'}
              />
            </View>
          ) : null}
          <OriginBadge origin={origin} />
        </View>
        <View style={[a.flex_row, a.align_center, a.mt_2xs]}>
          <ProfileHoverCard did={author.did}>
            <WebOnlyInlineLinkText
              numberOfLines={1}
              to={profileLink}
              label={_(msg`View profile`)}
              disableMismatchWarning
              disableUnderline
              onPress={() => {
                precacheProfile(queryClient, author)
                onOpenAuthor?.()
              }}
              style={[a.text_sm, a.leading_tight, {color: muted}]}>
              {sanitizeHandle(author.handle, '@')}
            </WebOnlyInlineLinkText>
          </ProfileHoverCard>
          <Text style={[a.text_sm, {color: muted}]} accessible={false}>
            {' '}
            &middot;{' '}
          </Text>
          <TimeElapsed timestamp={post.indexedAt}>
            {({timeElapsed}) => (
              <WebOnlyInlineLinkText
                to={postHref}
                label={timestampLabel}
                title={timestampLabel}
                disableMismatchWarning
                disableUnderline
                style={[a.text_sm, a.leading_tight, {color: muted}]}>
                {timeElapsed}
              </WebOnlyInlineLinkText>
            )}
          </TimeElapsed>
        </View>
      </View>
      {trailing}
      <PostMenuButton
        testID="postDropdownBtn"
        post={post}
        postFeedContext={feedContext}
        postReqId={reqId}
        big={big}
        record={record}
        richText={richText}
        timestamp={post.indexedAt}
        threadgateRecord={threadgateRecord}
        onShowLess={onShowLess}
      />
    </View>
  )
}

function cardSafe(t: ReturnType<typeof useTheme>) {
  return t.atoms.bg.backgroundColor ?? AQUA.white
}

function useHiddenReplyAlerts(
  post: AppBskyFeedDefs.PostView,
  threadgateRecord?: AppBskyFeedThreadgate.Record,
) {
  const {currentAccount} = useSession()
  const hidden = useMergedThreadgateHiddenReplies({threadgateRecord})
  return useMemo<AppModerationCause[]>(() => {
    const isHidden = hidden.has(post.uri)
    const rootUri = bsky.dangerousIsType<AppBskyFeedPost.Record>(
      post.record,
      AppBskyFeedPost.isRecord,
    )
      ? post.record.reply?.root?.uri || post.uri
      : post.uri
    const viewerOwnsThread = new AtUri(rootUri).host === currentAccount?.did
    return viewerOwnsThread && isHidden
      ? [
          {
            type: 'reply-hidden',
            source: {type: 'user', did: currentAccount?.did},
            priority: 6,
          },
        ]
      : []
  }, [post, currentAccount?.did, hidden])
}
