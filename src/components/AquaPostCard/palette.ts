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
 * Media (photo / video / cover) 36, card 40.
 */
export const AQUA_RADIUS = {
  media: 36,
  card: 40,
} as const

/**
 * Clip for a photo, video, or link cover.
 * Full-bleed media is square: the card clips the outer corners, and the
 * picture runs to every edge so no white frame shows around it.
 * Standalone tiles keep the media radius on every corner.
 */
export function aquaChromeRadii(bleed: boolean) {
  if (bleed) {
    return {
      borderRadius: 0,
      overflow: 'hidden' as const,
    }
  }
  return {
    borderRadius: AQUA_RADIUS.media,
    overflow: 'hidden' as const,
  }
}
