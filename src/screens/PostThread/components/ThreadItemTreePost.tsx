import {memo, useCallback, useMemo} from 'react'
import {View} from 'react-native'
import {
  type AppBskyFeedDefs,
  type AppBskyFeedThreadgate,
  AtUri,
  RichText as RichTextAPI,
} from '@atproto/api'
import {Trans} from '@lingui/macro'

import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {makeProfileLink} from '#/lib/routes/links'
import {getPostTextAndFacets} from '#/lib/strings/long-post'
import {
  POST_TOMBSTONE,
  type Shadow,
  usePostShadow,
} from '#/state/cache/post-shadow'
import {type ThreadItem} from '#/state/queries/usePostThread/types'
import {type OnPostSuccessData} from '#/state/shell/composer'
import {
  OUTER_SPACE,
  REPLY_LINE_WIDTH,
  TREE_AVI_WIDTH,
  TREE_INDENT,
} from '#/screens/PostThread/const'
import {atoms as a, useTheme} from '#/alf'
import {AquaPostCard} from '#/components/AquaPostCard'
import {DebugFieldDisplay} from '#/components/DebugFieldDisplay'
import {useInteractionState} from '#/components/hooks/useInteractionState'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import {PostHider} from '#/components/moderation/PostHider'
import {PostControlsSkeleton} from '#/components/PostControls'
import * as Skele from '#/components/Skeleton'
import {SubtleHover} from '#/components/SubtleHover'
import {Text} from '#/components/Typography'

/**
 * Mimic the space in PostMeta
 */
const TREE_AVI_PLUS_SPACE = TREE_AVI_WIDTH + a.gap_xs.gap

export function ThreadItemTreePost({
  item,
  overrides,
  onPostSuccess,
  threadgateRecord,
}: {
  item: Extract<ThreadItem, {type: 'threadPost'}>
  overrides?: {
    moderation?: boolean
    topBorder?: boolean
  }
  onPostSuccess?: (data: OnPostSuccessData) => void
  threadgateRecord?: AppBskyFeedThreadgate.Record
}) {
  const postShadow = usePostShadow(item.value.post)

  if (postShadow === POST_TOMBSTONE) {
    return <ThreadItemTreePostDeleted item={item} />
  }

  return (
    <ThreadItemTreePostInner
      // Safeguard from clobbering per-post state below:
      key={postShadow.uri}
      item={item}
      postShadow={postShadow}
      threadgateRecord={threadgateRecord}
      overrides={overrides}
      onPostSuccess={onPostSuccess}
    />
  )
}

function ThreadItemTreePostDeleted({
  item,
}: {
  item: Extract<ThreadItem, {type: 'threadPost'}>
}) {
  const t = useTheme()
  return (
    <ThreadItemTreePostOuterWrapper item={item}>
      <ThreadItemTreePostInnerWrapper item={item}>
        <View
          style={[
            a.flex_row,
            a.align_center,
            a.rounded_sm,
            t.atoms.bg_contrast_25,
            {
              gap: 6,
              paddingHorizontal: OUTER_SPACE / 2,
              height: TREE_AVI_WIDTH,
            },
          ]}>
          <TrashIcon style={[t.atoms.text]} width={14} />
          <Text style={[t.atoms.text_contrast_medium, a.mt_2xs]}>
            <Trans>Post has been deleted</Trans>
          </Text>
        </View>
        {item.ui.isLastChild && !item.ui.precedesChildReadMore && (
          <View style={{height: OUTER_SPACE / 2}} />
        )}
      </ThreadItemTreePostInnerWrapper>
    </ThreadItemTreePostOuterWrapper>
  )
}

const ThreadItemTreePostOuterWrapper = memo(
  function ThreadItemTreePostOuterWrapper({
    item,
    children,
  }: {
    item: Extract<ThreadItem, {type: 'threadPost'}>
    children: React.ReactNode
  }) {
    const t = useTheme()
    const indents = Math.max(0, item.ui.indent - 1)

    return (
      <View
        style={[
          a.flex_row,
          item.ui.indent === 1 &&
            !item.ui.showParentReplyLine && [
              a.border_t,
              t.atoms.border_contrast_low,
            ],
        ]}>
        {Array.from(Array(indents)).map((_, n: number) => {
          const isSkipped = item.ui.skippedIndentIndices.has(n)
          return (
            <View
              key={`${item.value.post.uri}-padding-${n}`}
              style={[
                t.atoms.border_contrast_low,
                {
                  borderRightWidth: isSkipped ? 0 : REPLY_LINE_WIDTH,
                  width: TREE_INDENT + TREE_AVI_WIDTH / 2,
                  left: 1,
                },
              ]}
            />
          )
        })}
        {children}
      </View>
    )
  },
)

const ThreadItemTreePostInnerWrapper = memo(
  function ThreadItemTreePostInnerWrapper({
    item,
    children,
  }: {
    item: Extract<ThreadItem, {type: 'threadPost'}>
    children: React.ReactNode
  }) {
    const t = useTheme()
    return (
      <View
        style={[
          a.flex_1, // TODO check on ios
          {
            paddingHorizontal: OUTER_SPACE,
            paddingTop: OUTER_SPACE / 2,
          },
          item.ui.indent === 1 && [
            !item.ui.showParentReplyLine && {paddingTop: OUTER_SPACE / 1.5},
            !item.ui.showChildReplyLine && a.pb_sm,
          ],
          item.ui.isLastChild &&
            !item.ui.precedesChildReadMore && [
              {
                paddingBottom: OUTER_SPACE / 2,
              },
            ],
        ]}>
        {item.ui.indent > 1 && (
          <View
            style={[
              a.absolute,
              t.atoms.border_contrast_low,
              {
                left: -1,
                top: 0,
                height:
                  TREE_AVI_WIDTH / 2 + REPLY_LINE_WIDTH / 2 + OUTER_SPACE / 2,
                width: OUTER_SPACE,
                borderLeftWidth: REPLY_LINE_WIDTH,
                borderBottomWidth: REPLY_LINE_WIDTH,
                borderBottomLeftRadius: a.rounded_sm.borderRadius,
              },
            ]}
          />
        )}
        {children}
      </View>
    )
  },
)

const ThreadItemTreeReplyChildReplyLine = memo(
  function ThreadItemTreeReplyChildReplyLine({
    item,
  }: {
    item: Extract<ThreadItem, {type: 'threadPost'}>
  }) {
    const t = useTheme()
    return (
      <View style={[a.relative, a.pt_2xs, {width: TREE_AVI_PLUS_SPACE}]}>
        {item.ui.showChildReplyLine && (
          <View
            style={[
              a.flex_1,
              t.atoms.border_contrast_low,
              {borderRightWidth: 2, width: '50%', left: -1},
            ]}
          />
        )}
      </View>
    )
  },
)

const ThreadItemTreePostInner = memo(function ThreadItemTreePostInner({
  item,
  postShadow,
  overrides,
  onPostSuccess,
  threadgateRecord,
}: {
  item: Extract<ThreadItem, {type: 'threadPost'}>
  postShadow: Shadow<AppBskyFeedDefs.PostView>
  overrides?: {
    moderation?: boolean
    topBorder?: boolean
  }
  onPostSuccess?: (data: OnPostSuccessData) => void
  threadgateRecord?: AppBskyFeedThreadgate.Record
}): React.ReactNode {
  const {openComposer} = useOpenComposer()

  const post = item.value.post
  const record = item.value.post.record
  const moderation = item.moderation
  const richText = useMemo(
    () => new RichTextAPI(getPostTextAndFacets(record)),
    [record],
  )
  const postHref = useMemo(() => {
    const urip = new AtUri(post.uri)
    return makeProfileLink(post.author, 'post', urip.rkey)
  }, [post.uri, post.author])

  const onPressReply = useCallback(() => {
    openComposer({
      replyTo: {
        uri: post.uri,
        cid: post.cid,
        text: record.text,
        author: post.author,
        embed: post.embed,
        moderation,
        langs: post.record.langs,
      },
      onPostSuccess: onPostSuccess,
    })
  }, [openComposer, post, record, onPostSuccess, moderation])

  return (
    <ThreadItemTreePostOuterWrapper item={item}>
      <SubtleHoverWrapper>
        <PostHider
          testID={`postThreadItem-by-${post.author.handle}`}
          href={postHref}
          disabled={overrides?.moderation === true}
          modui={moderation.ui('contentList')}
          iconSize={42}
          iconStyles={{marginLeft: 2, marginRight: 2}}
          profile={post.author}
          interpretFilterAsBlur>
          <ThreadItemTreePostInnerWrapper item={item}>
            <View style={[a.flex_row, a.flex_1]}>
              <ThreadItemTreeReplyChildReplyLine item={item} />
              <View style={[a.flex_1, a.pl_2xs]}>
                <AquaPostCard
                  post={postShadow}
                  moderation={moderation}
                  record={record}
                  richText={richText}
                  onPressReply={onPressReply}
                  logContext="PostThreadItem"
                  threadgateRecord={threadgateRecord}
                  postHref={postHref}
                  trailing={<DebugFieldDisplay subject={post} />}
                />
              </View>
            </View>
          </ThreadItemTreePostInnerWrapper>
        </PostHider>
      </SubtleHoverWrapper>
    </ThreadItemTreePostOuterWrapper>
  )
})

function SubtleHoverWrapper({children}: {children: React.ReactNode}) {
  const {
    state: hover,
    onIn: onHoverIn,
    onOut: onHoverOut,
  } = useInteractionState()
  return (
    <View
      onPointerEnter={onHoverIn}
      onPointerLeave={onHoverOut}
      style={[a.flex_1, a.pointer]}>
      <SubtleHover hover={hover} />
      {children}
    </View>
  )
}

export function ThreadItemTreePostSkeleton({index}: {index: number}) {
  const t = useTheme()
  const even = index % 2 === 0
  return (
    <View
      style={[
        {paddingHorizontal: OUTER_SPACE, paddingVertical: OUTER_SPACE / 1.5},
        a.border_t,
        t.atoms.border_contrast_low,
      ]}>
      <Skele.Row style={[a.align_start, a.gap_xs]}>
        <Skele.Circle size={TREE_AVI_WIDTH} />

        <Skele.Col style={[a.gap_xs]}>
          <Skele.Row style={[a.gap_sm]}>
            <Skele.Text style={[a.text_md, {width: '20%'}]} />
            <Skele.Text blend style={[a.text_md, {width: '30%'}]} />
          </Skele.Row>

          <Skele.Col>
            {even ? (
              <>
                <Skele.Text blend style={[a.text_md, {width: '100%'}]} />
                <Skele.Text blend style={[a.text_md, {width: '60%'}]} />
              </>
            ) : (
              <Skele.Text blend style={[a.text_md, {width: '60%'}]} />
            )}
          </Skele.Col>

          <PostControlsSkeleton />
        </Skele.Col>
      </Skele.Row>
    </View>
  )
}
