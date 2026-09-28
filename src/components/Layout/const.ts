export const SCROLLBAR_OFFSET =
  'calc(-1 * var(--removed-body-scroll-bar-size, 0px) / 2)' as any
export const SCROLLBAR_OFFSET_POSITIVE =
  'calc(var(--removed-body-scroll-bar-size, 0px) / 2)' as any

/**
 * Useful for visually aligning icons within header buttons with the elements
 * below them on the screen. Apply positively or negatively depending on side
 * of the screen you're on.
 */
export const BUTTON_VISUAL_ALIGNMENT_OFFSET = 3

/**
 * Corresponds to the width of a small square or round button
 */
export const HEADER_SLOT_SIZE = 33

/**
 * How far to shift the center column when in the tablet breakpoint
 */
export const CENTER_COLUMN_OFFSET = -105

/**
 * Width of the center (feed) column on desktop. The left/right nav
 * columns anchor themselves off half this value, so keep them in sync
 * with CENTER_COLUMN_HALF_WIDTH rather than hardcoding 300/-300 again.
 */
export const CENTER_COLUMN_WIDTH = 700
export const CENTER_COLUMN_HALF_WIDTH = CENTER_COLUMN_WIDTH / 2
