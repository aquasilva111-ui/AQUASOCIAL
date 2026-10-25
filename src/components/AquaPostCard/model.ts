import {
  AppBskyEmbedExternal,
  AppBskyEmbedImages,
  AppBskyEmbedRecordWithMedia,
  AppBskyEmbedVideo,
  type AppBskyFeedDefs,
} from '@atproto/api'

export type PostOrigin = 'aqua' | 'bluesky'

/**
 * Client-side guess until a resolver is plugged in.
 * Bluesky-hosted handles are marked; custom domains need `setPostOriginResolver`.
 */
export function postOriginFromHandle(handle: string): PostOrigin {
  const normalized = handle.toLowerCase()
  if (
    normalized.endsWith('.bsky.social') ||
    normalized.endsWith('.bsky.app') ||
    normalized.endsWith('.bsky.team')
  ) {
    return 'bluesky'
  }
  return 'aqua'
}

export type PostOriginAuthor = {did: string; handle: string}

let originResolver: ((author: PostOriginAuthor) => PostOrigin) | undefined

/** Replace the handle heuristic when a directory or PDS check exists. */
export function setPostOriginResolver(
  next: ((author: PostOriginAuthor) => PostOrigin) | undefined,
) {
  originResolver = next
}

export function postOrigin(author: PostOriginAuthor): PostOrigin {
  return originResolver?.(author) ?? postOriginFromHandle(author.handle)
}

export type AquaMediaKind = 'images' | 'video' | 'external' | 'none'

function externalIsMedia(embed: AppBskyEmbedExternal.View) {
  if (embed.external.thumb) return true
  const uri = embed.external.uri.toLowerCase()
  return uri.includes('tenor') || uri.includes('giphy') || uri.includes('.gif')
}

/** Which embeds carry the glass action bar. Quotes and bare links stay with the text. */
export function aquaMediaKind(
  embed: AppBskyFeedDefs.PostView['embed'],
): AquaMediaKind {
  if (!embed) return 'none'
  if (AppBskyEmbedImages.isView(embed)) {
    return embed.images.length > 0 ? 'images' : 'none'
  }
  if (AppBskyEmbedVideo.isView(embed)) return 'video'
  if (AppBskyEmbedExternal.isView(embed)) {
    return externalIsMedia(embed) ? 'external' : 'none'
  }
  if (AppBskyEmbedRecordWithMedia.isView(embed)) {
    return aquaMediaKind(embed.media)
  }
  return 'none'
}

/** Title and description of a link cover, when the post itself has no caption. */
export function externalPreview(embed: AppBskyFeedDefs.PostView['embed']) {
  const view = AppBskyEmbedExternal.isView(embed)
    ? embed
    : AppBskyEmbedRecordWithMedia.isView(embed) &&
        AppBskyEmbedExternal.isView(embed.media)
      ? embed.media
      : undefined
  if (!view) return undefined
  const title = view.external.title?.trim()
  const description = view.external.description?.trim()
  if (!title && !description) return undefined
  return {title, description}
}

export function videoEmbedOf(embed: AppBskyFeedDefs.PostView['embed']) {
  if (AppBskyEmbedVideo.isView(embed)) return embed
  if (
    AppBskyEmbedRecordWithMedia.isView(embed) &&
    AppBskyEmbedVideo.isView(embed.media)
  ) {
    return embed.media
  }
  return undefined
}
