import {type FeedPostSliceItem} from '#/state/queries/post-feed'
import {type FeedExperienceMode} from '#/state/shell/feed-experience'
import {parseEmbed} from '#/types/bsky/post'

export function isCompatibleWithExperience(
  item: FeedPostSliceItem,
  mode: FeedExperienceMode,
  isConversation: boolean,
): boolean {
  const embed = parseEmbed(item.post.embed)
  const media = embed.type === 'post_with_media' ? embed.media : embed
  switch (mode) {
    case 'images':
      return media.type === 'images' && media.view.images.length > 0
    case 'drops':
    case 'video':
      // The feed's video view has no duration. Both presentations reuse it.
      return media.type === 'video'
    case 'streams':
      return isConversation || !!item.record.reply || !!item.post.replyCount
    case 'editorial':
      return item.record.text.trim().length > 0
    default:
      return true
  }
}
