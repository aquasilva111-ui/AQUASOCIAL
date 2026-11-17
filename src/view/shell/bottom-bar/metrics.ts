export const DOCK_INSET = 12
export const DOCK_MAX_WIDTH = 720
/** Tallest dock variant: 48px create button + label, padding and border. */
export const DOCK_HEIGHT = 82

/**
 * Web feed tail spacer so the last post clears the floating dock.
 * Native keeps its own doubled header offset.
 */
export function webFeedBottomSpacer(headerOffset: number) {
  return Math.max(headerOffset, 32) + DOCK_INSET + DOCK_HEIGHT
}
