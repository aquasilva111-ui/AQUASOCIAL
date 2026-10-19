/**
 * Aqua post-card palette from the recorte mockups.
 * iris / blue / primary are the product colors; the notch itself is the card
 * surface so the cut-out reads as paper, not as a second button bar.
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
 * Single source for the post-card rounding. Designer values:
 * media (photo / video / cover) 36, card 40, white-notch curve 34.
 */
export const AQUA_RADIUS = {
  media: 36,
  card: 40,
  notch: 34,
} as const

export const NOTCH_RADIUS = AQUA_RADIUS.notch

/** Clip for photo, video, and cover when the white notch is attached. */
export function aquaMediaFrame() {
  return {
    borderRadius: AQUA_RADIUS.media,
    borderBottomLeftRadius: 0,
    overflow: 'hidden' as const,
  }
}
