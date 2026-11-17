/** Native dock, and the phone web capsule before the light trim below. */
export const DOCK_INSET = 12
export const DOCK_MAX_WIDTH = 720
/** Tallest native variant: 48px create button + label, padding and border. */
export const DOCK_HEIGHT = 82

/**
 * Desktop and tablet web. About 30% shorter than the native capsule,
 * capped near 440px, and sat closer to the bottom edge.
 */
export const DOCK_INSET_WIDE = 6
export const DOCK_MAX_WIDTH_WIDE = 440
export const DOCK_HEIGHT_WIDE = 58

/** Phone web: a light trim of the same capsule. */
export const DOCK_INSET_NARROW = 10
export const DOCK_HEIGHT_NARROW = 74

/**
 * Web feed tail spacer so the last post clears the floating dock.
 * Uses the taller of the wide and phone capsules. Native keeps its own offset.
 */
export function webFeedBottomSpacer(headerOffset: number) {
  const clearance = Math.max(
    DOCK_INSET_WIDE + DOCK_HEIGHT_WIDE,
    DOCK_INSET_NARROW + DOCK_HEIGHT_NARROW,
  )
  return Math.max(headerOffset, 32) + clearance
}
