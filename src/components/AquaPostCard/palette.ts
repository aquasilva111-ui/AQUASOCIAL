/**
 * Aqua post-card palette.
 * iris / blue / primary are the product colors.
 */
export const AQUA = {
  iris: '#7EC8F5',
  blue: '#0D2BDB',
  primary: '#002BEF',
  ink: '#0F172A',
  muted: '#405168',
  line: '#DCE2EA',
  surface: '#EFF2F6',
  like: '#FF2D55',
  white: '#FFFFFF',
  requestedBg: '#E6EBFF',
} as const

/**
 * Single source for the post-card rounding.
 * Media (photo / video / cover) 22. The post itself has no frame, so `card`
 * only rounds the standalone tiles that still sit in a surface.
 */
export const AQUA_RADIUS = {
  media: 22,
  card: 40,
} as const

/** Hairline that separates one frameless post from the next. */
export const AQUA_DIVIDER = '#EEF0F4'

/**
 * Clip for a photo, video, or link cover: the media radius on every corner.
 * The post has no frame, so the media rounds itself.
 */
export function aquaChromeRadii() {
  return {
    borderRadius: AQUA_RADIUS.media,
    overflow: 'hidden' as const,
  }
}
