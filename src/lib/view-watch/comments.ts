/**
 * Comments on a View video are the post's replies — the same conversation
 * people see in the social thread, not a separate comment store. The only
 * View-specific piece is the creator's pinned comment, a small record in
 * the creator's own repo:
 *
 *   at://<creatorDid>/place.aqua.view.pin/<videoRkey>
 *   {subject: <video uri>, comment: {uri, cid}, createdAt}
 */

export const VIEW_PIN_COLLECTION = 'place.aqua.view.pin'

export type CommentSort = 'top' | 'recent'

export type CommentStat = {
  uri: string
  indexedAt: string
  likeCount?: number
  replyCount?: number
}

/** Pinned first; then top (likes, then replies, then newest) or newest. */
export function sortComments<T extends CommentStat>(
  comments: T[],
  sort: CommentSort,
  pinnedUri?: string,
): T[] {
  const pinned = comments.filter(c => c.uri === pinnedUri)
  const rest = comments.filter(c => c.uri !== pinnedUri)
  rest.sort((x, y) =>
    sort === 'recent'
      ? y.indexedAt.localeCompare(x.indexedAt)
      : (y.likeCount ?? 0) - (x.likeCount ?? 0) ||
        (y.replyCount ?? 0) - (x.replyCount ?? 0) ||
        y.indexedAt.localeCompare(x.indexedAt),
  )
  return [...pinned, ...rest]
}

/**
 * A pin only counts when it is the creator's own record, it names this
 * video, and the pinned post really is a direct reply to the video. Pin
 * records are public data anyone could craft, so all three are checked.
 */
export function validPinnedUri(
  pin: unknown,
  videoUri: string,
  replyParentOf: (uri: string) => string | undefined,
): string | undefined {
  const p = pin as {subject?: unknown; comment?: {uri?: unknown}} | undefined
  if (!p || p.subject !== videoUri) return undefined
  const uri = p.comment?.uri
  if (typeof uri !== 'string' || !uri.startsWith('at://')) return undefined
  return replyParentOf(uri) === videoUri ? uri : undefined
}

export type StrongRef = {uri: string; cid: string}

/** Reply refs for a comment on `video` (the thread root is kept). */
export function replyRefsFor(video: {
  uri: string
  cid: string
  record: {reply?: {root?: StrongRef}}
}): {root: StrongRef; parent: StrongRef} {
  const parent = {uri: video.uri, cid: video.cid}
  const root = video.record.reply?.root
  return {
    root: root?.uri && root?.cid ? {uri: root.uri, cid: root.cid} : parent,
    parent,
  }
}

/** Quick emoji row for the comment box (the full picker is in the composer). */
export const QUICK_EMOJI = [
  '😂',
  '😍',
  '🔥',
  '👏',
  '😮',
  '😢',
  '🙏',
  '💙',
  '🎉',
  '👀',
]

export const COMMENT_MAX_GRAPHEMES = 300
