import {
  AppBskyFeedDefs,
  type AppBskyFeedPost,
  AtUri,
  moderatePost,
  type ModerationDecision,
  RichText,
} from '@atproto/api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  replyRefsFor,
  validPinnedUri,
  VIEW_PIN_COLLECTION,
} from '#/lib/view-watch/comments'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {useAgent, useSession} from '#/state/session'

const COMMENTS_KEY = (uri: string) => ['view-comments', uri]
const PIN_KEY = (uri: string) => ['view-comment-pin', uri]

export type VideoComment = {
  post: AppBskyFeedDefs.PostView
  moderation: ModerationDecision
}

function parentOf(post: AppBskyFeedDefs.PostView) {
  const record = post.record as AppBskyFeedPost.Record
  return record.reply?.parent?.uri
}

/** Direct replies to the video, moderated like any other thread. */
export function useVideoCommentsQuery(videoUri: string) {
  const agent = useAgent()
  const moderationOpts = useModerationOpts()
  return useQuery<VideoComment[]>({
    queryKey: COMMENTS_KEY(videoUri),
    enabled: !!moderationOpts,
    staleTime: 15_000,
    queryFn: async () => {
      const {data} = await agent.getPostThread({
        uri: videoUri,
        depth: 1,
        parentHeight: 0,
      })
      const replies = AppBskyFeedDefs.isThreadViewPost(data.thread)
        ? (data.thread.replies ?? [])
        : []
      return replies
        .filter(AppBskyFeedDefs.isThreadViewPost)
        .map(r => ({
          post: r.post,
          moderation: moderatePost(r.post, moderationOpts!),
        }))
        .filter(c => !c.moderation.ui('contentList').filter)
    },
  })
}

/**
 * The creator's pinned comment for this video, if the pin is valid (see
 * validPinnedUri). Fetches the post directly when it isn't among the
 * loaded replies.
 */
export function usePinnedCommentQuery(
  video: AppBskyFeedDefs.PostView,
  loaded: VideoComment[] | undefined,
) {
  const agent = useAgent()
  const moderationOpts = useModerationOpts()
  const rkey = new AtUri(video.uri).rkey
  return useQuery<VideoComment | null>({
    queryKey: [...PIN_KEY(video.uri), loaded?.length ?? -1],
    enabled: !!moderationOpts && loaded !== undefined,
    staleTime: 15_000,
    queryFn: async () => {
      const pin = await agent.com.atproto.repo
        .getRecord({
          repo: video.author.did,
          collection: VIEW_PIN_COLLECTION,
          rkey,
        })
        .then(
          r => r.data.value,
          () => undefined,
        )
      if (!pin) return null
      const inList = new Map(loaded!.map(c => [c.post.uri, c]))
      const candidate = (pin as {comment?: {uri?: string}}).comment?.uri
      let found = candidate ? inList.get(candidate) : undefined
      if (!found && candidate) {
        const {data} = await agent.getPosts({uris: [candidate]})
        const post = data.posts[0]
        if (post)
          found = {post, moderation: moderatePost(post, moderationOpts!)}
      }
      if (!found || found.moderation.ui('contentList').filter) return null
      const uri = validPinnedUri(pin, video.uri, u =>
        u === found!.post.uri ? parentOf(found!.post) : undefined,
      )
      return uri ? found : null
    },
  })
}

/** Pin/unpin: only the video's author, writing to their own repo. */
export function usePinCommentMutation(video: AppBskyFeedDefs.PostView) {
  const agent = useAgent()
  const {currentAccount} = useSession()
  const qc = useQueryClient()
  const rkey = new AtUri(video.uri).rkey
  return useMutation({
    mutationFn: async (comment: {uri: string; cid: string} | null) => {
      if (currentAccount?.did !== video.author.did)
        throw new Error('only_the_creator_can_pin')
      if (comment)
        await agent.com.atproto.repo.putRecord({
          repo: currentAccount.did,
          collection: VIEW_PIN_COLLECTION,
          rkey,
          record: {
            $type: VIEW_PIN_COLLECTION,
            subject: video.uri,
            comment,
            createdAt: new Date().toISOString(),
          },
        })
      else
        await agent.com.atproto.repo.deleteRecord({
          repo: currentAccount.did,
          collection: VIEW_PIN_COLLECTION,
          rkey,
        })
    },
    onSuccess: () => qc.invalidateQueries({queryKey: PIN_KEY(video.uri)}),
  })
}

/** Posts a comment (a reply to the video) with links/mentions detected. */
export function usePostCommentMutation(video: AppBskyFeedDefs.PostView) {
  const agent = useAgent()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (text: string) => {
      const rt = new RichText({text: text.trim()})
      await rt.detectFacets(agent)
      const record = video.record as AppBskyFeedPost.Record
      await agent.post({
        text: rt.text,
        facets: rt.facets,
        reply: replyRefsFor({
          uri: video.uri,
          cid: video.cid,
          record,
        }),
      })
    },
    onSuccess: () => {
      // The AppView indexes new replies within a moment.
      setTimeout(
        () => qc.invalidateQueries({queryKey: COMMENTS_KEY(video.uri)}),
        1500,
      )
    },
  })
}
