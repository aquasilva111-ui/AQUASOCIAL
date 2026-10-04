import {
  type AppBskyFeedDefs,
  moderatePost,
  type ModerationOpts,
} from '@atproto/api'

import {getPostMedia} from '#/lib/media/experiences'

export type PinImage = {
  thumb: string
  fullsize: string
  alt: string
  /** width / height; 1 when the post does not say. */
  aspectRatio: number
}

/**
 * The image a pin points at, or undefined when the post has no such image or
 * moderation says it must not be shown (filtered, blurred or alerted media):
 * pins are rendered from third-party posts, so labels still apply.
 */
export function pinImage(
  post: AppBskyFeedDefs.PostView | undefined,
  imageIndex: number,
  moderationOpts: ModerationOpts | undefined,
): PinImage | undefined {
  if (!post || !moderationOpts) return undefined
  const ui = moderatePost(post, moderationOpts).ui('contentMedia')
  const list = moderatePost(post, moderationOpts).ui('contentList')
  if (
    ui.filter ||
    list.filter ||
    ui.blur ||
    list.blur ||
    ui.blurs.length ||
    list.blurs.length
  ) {
    return undefined
  }
  const media = getPostMedia(post)
  if (media.type !== 'images') return undefined
  const images = media.view.images
  const image = images[Math.min(imageIndex, images.length - 1)]
  if (!image) return undefined
  const ratio = image.aspectRatio
  return {
    thumb: image.thumb,
    fullsize: image.fullsize,
    alt: image.alt,
    aspectRatio: ratio && ratio.height > 0 ? ratio.width / ratio.height : 1,
  }
}
