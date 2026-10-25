import {type ReactNode, useMemo, useState} from 'react'
import {type StyleProp, View, type ViewStyle} from 'react-native'
import {LinearGradient} from 'expo-linear-gradient'
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
import {AquaMediaChrome, AquaTextActionBar} from './MediaChrome'
import {aquaMediaKind, externalPreview, postOrigin, videoEmbedOf} from './model'
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
  const bleed = kind !== 'none' && !!post.embed
  const header = (
    <AquaPostHeader
      overlay={bleed}
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
  )
  const chrome = bleed ? (
    <AquaMediaChrome
      placement="card"
      actions={controls}
      capsule={capsule}
      sparkle={sparkle}
      duration={duration}
      header={header}
    />
  ) : null

  const textStyle = [
    textSize === 'lg' ? a.text_lg : a.text_md,
    a.leading_snug,
    {color: ink},
    kind === 'video' && a.font_bold,
  ]
  const preview = richText.text ? undefined : externalPreview(post.embed)
  const showAbove =
    bleed &&
    (!!richText.text ||
      !!views ||
      !!notices ||
      !!preview?.title ||
      !!preview?.description)

  return (
    <View
      style={[
        {
          backgroundColor: cardBg,
          borderRadius: AQUA_RADIUS.card,
          overflow: bleed ? 'hidden' : undefined,
          borderWidth: bleed ? 0 : 1,
          borderColor: light
            ? AQUA.line
            : t.atoms.border_contrast_low.borderColor,
          padding: bleed ? 0 : 14,
        },
        web({boxShadow: '0 10px 30px rgba(15,23,42,0.06)'}),
        style,
      ]}>
      {leading}
      {bleed ? null : header}
      {bleed ? null : notices}
      {bleed ? null : <LabelsOnMyPost post={post} style={[a.pb_xs]} />}
      <ContentHider
        testID="contentHider-post"
        modui={moderation.ui(moderationContext)}
        ignoreMute={ignoreMute}
        childContainerStyle={bleed ? undefined : a.gap_xs}>
        {bleed ? null : (
          <PostAlerts
            modui={moderation.ui(moderationContext)}
            size={alertSize}
            includeMute={includeMute}
            style={[a.pb_2xs]}
            additionalCauses={hiddenReplyAlerts}
          />
        )}
        {showAbove ? (
          <View
            style={{paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10}}>
            {notices}
            <LabelsOnMyPost post={post} style={[a.pb_xs]} />
            <PostAlerts
              modui={moderation.ui(moderationContext)}
              size={alertSize}
              includeMute={includeMute}
              style={[a.pb_2xs]}
              additionalCauses={hiddenReplyAlerts}
            />
            {richText.text ? (
              <View>
                <Text
                  emoji
                  selectable={selectable}
                  testID="postText"
                  numberOfLines={limit ? lines : undefined}
                  style={textStyle}>
                  {kind !== 'video' ? (
                    <Text
                      style={[a.font_bold, {fontWeight: '800', color: ink}]}>
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
            ) : preview ? (
              <View style={{gap: 4}}>
                {preview.title ? (
                  <Text
                    emoji
                    style={[a.font_bold, {fontWeight: '800', color: ink}]}>
                    {preview.title}
                  </Text>
                ) : null}
                {preview.description ? (
                  <Text
                    emoji
                    numberOfLines={2}
                    style={[a.text_sm, a.leading_snug, {color: muted}]}>
                    {preview.description}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {views ? (
              <Text style={[a.text_sm, {color: muted}]}>{views}</Text>
            ) : null}
            <LikedByLine postUri={post.uri} likeCount={post.likeCount ?? 0} />
          </View>
        ) : null}
        {bleed && post.embed ? (
          <Embed
            embed={post.embed}
            moderation={moderation}
            onOpen={onOpenEmbed}
            viewContext={viewContext}
            mediaChrome={chrome}
            bleed
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
        {bleed ? null : (
          <View>
            {kind !== 'none' && richText.text ? (
              <View style={bleed ? undefined : [a.mt_sm]}>
                <Text
                  emoji
                  selectable={selectable}
                  testID="postText"
                  numberOfLines={limit ? lines : undefined}
                  style={textStyle}>
                  {kind !== 'video' ? (
                    <Text
                      style={[a.font_bold, {fontWeight: '800', color: ink}]}>
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
              <AquaTextActionBar
                actions={controls}
                sparkle={sparkle}
                capsule={capsule}
              />
            ) : null}
          </View>
        )}
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
  overlay,
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
  /** Name and menu sit on the media, in white, under a dark fade. */
  overlay?: boolean
}) {
  const t = useTheme()
  const {_, i18n} = useLingui()
  const queryClient = useQueryClient()
  const author = useProfileShadow(post.author)
  const {isActive: live} = useActorStatus(author)
  const verification = useSimpleVerificationState({profile: author})
  const light = t.name === 'light'
  const ink = overlay ? '#FFFFFF' : light ? AQUA.ink : t.atoms.text.color
  const muted = overlay
    ? 'rgba(255,255,255,0.92)'
    : light
      ? AQUA.muted
      : t.atoms.text_contrast_medium.color
  const legible = overlay
    ? {
        textShadowColor: 'rgba(0,0,0,0.45)',
        textShadowOffset: {width: 0, height: 1},
        textShadowRadius: 3,
      }
    : null
  const displayName = sanitizeDisplayName(
    author.displayName || author.handle,
    moderation.ui('displayName'),
  )
  const profileLink = makeProfileLink(author)
  const timestampLabel = niceDate(i18n, post.indexedAt)
  const origin = postOrigin(author)

  return (
    <View
      pointerEvents={overlay ? 'box-none' : 'auto'}
      style={[
        a.flex_row,
        a.align_center,
        a.gap_sm,
        overlay
          ? {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 4,
              paddingTop: 16,
              paddingLeft: 16,
              // Room for the star capsule pinned to the top-right of the photo.
              paddingRight: 58,
              paddingBottom: 34,
            }
          : [a.mb_md, a.z_20],
      ]}>
      {overlay ? (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(10,16,40,0.45)', 'rgba(10,16,40,0)']}
          style={[a.absolute, {top: 0, left: 0, right: 0, bottom: 0}]}
        />
      ) : null}
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
            borderColor: overlay || light ? AQUA.white : cardSafe(t),
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
                legible,
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
              style={[a.text_sm, a.leading_tight, {color: muted}, legible]}>
              {sanitizeHandle(author.handle, '@')}
            </WebOnlyInlineLinkText>
          </ProfileHoverCard>
          <Text style={[a.text_sm, {color: muted}, legible]} accessible={false}>
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
                style={[a.text_sm, a.leading_tight, {color: muted}, legible]}>
                {timeElapsed}
              </WebOnlyInlineLinkText>
            )}
          </TimeElapsed>
        </View>
      </View>
      {trailing}
      <PostMenuButton
        testID="postDropdownBtn"
        iconColor={overlay ? '#FFFFFF' : undefined}
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
