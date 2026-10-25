import {useMemo} from 'react'
import {
  type AppBskyFeedDefs,
  AppBskyFeedPost,
  RichText as RichTextAPI,
} from '@atproto/api'

import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {getPostTextAndFacets} from '#/lib/strings/long-post'
import {formatDuration, knownDurationSeconds} from '#/lib/views/format'
import {POST_TOMBSTONE, usePostShadow} from '#/state/cache/post-shadow'
import * as Dialog from '#/components/Dialog'
import {PostControls} from '#/components/PostControls'
import * as bsky from '#/types/bsky'
import {type AquaLogContext} from './AquaActionRow'
import {LikeCapsule} from './LikeCapsule'
import {AquaMediaChrome} from './MediaChrome'
import {videoEmbedOf} from './model'
import {useWhySeeingThis} from './plugins'
import {SparkleButton} from './SparkleButton'
import {WhySheet} from './WhySheet'

/**
 * Glass chrome for tiles that are not the full post card (video grid,
 * Views cards, image covers). Same actions, capsule, and sparkle sheet.
 */
export function AquaEmbedChrome({
  post,
  logContext,
  duration,
}: {
  post: AppBskyFeedDefs.PostView
  logContext: AquaLogContext
  duration?: string
}) {
  const shadowed = usePostShadow(post)
  const whyControl = Dialog.useDialogControl()
  const why = useWhySeeingThis(post.uri)
  const {openComposer} = useOpenComposer()
  const record = bsky.dangerousIsType<AppBskyFeedPost.Record>(
    post.record,
    AppBskyFeedPost.isRecord,
  )
    ? post.record
    : undefined
  const richText = useMemo(
    () => new RichTextAPI(record ? getPostTextAndFacets(record) : {text: ''}),
    [record],
  )
  const chip =
    duration ?? formatDuration(knownDurationSeconds(videoEmbedOf(post.embed)))

  if (shadowed === POST_TOMBSTONE || !record) return null

  return (
    <>
      <AquaMediaChrome
        duration={chip}
        actions={
          <PostControls
            chrome="aqua"
            post={shadowed}
            record={record}
            richText={richText}
            logContext={logContext}
            onPressReply={() => {
              openComposer({
                replyTo: {
                  uri: shadowed.uri,
                  cid: shadowed.cid,
                  text: record.text || '',
                  author: shadowed.author,
                  embed: shadowed.embed,
                  langs: record.langs,
                },
              })
            }}
          />
        }
        capsule={
          <LikeCapsule
            postUri={shadowed.uri}
            likeCount={shadowed.likeCount ?? 0}
          />
        }
        sparkle={<SparkleButton onPress={whyControl.open} />}
      />
      <WhySheet control={whyControl} data={why} />
    </>
  )
}
