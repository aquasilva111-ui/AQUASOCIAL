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
 * Width of the center (feed) column. Matches the Bluesky column so the
 * left/right chrome can anchor off CENTER_COLUMN_HALF_WIDTH.
 */
export const CENTER_COLUMN_WIDTH = 600
export const CENTER_COLUMN_HALF_WIDTH = CENTER_COLUMN_WIDTH / 2

/**
 * The feed and the right nav are one centered block, with this gap
 * between the column edges (Bluesky's desktop rhythm).
 */
export const FEED_RIGHT_NAV_GAP = 24

/** Fixed width of the right column (search, Discover, trending). */
export const RIGHT_NAV_WIDTH = 300

/**
 * Clearance kept between the collapsed 72px rail and the feed when a
 * centered column would otherwise slide underneath the rail.
 */
export const RAIL_FEED_GAP = 16

/**
 * Hover rail (and no bottom dock) from this viewport width up. 1280px
 * is a desktop window; below that the tablet/mobile dock stays.
 */
export const DESKTOP_RAIL_MIN_WIDTH = 1280

/** Icon nav that sits just left of the feed below the rail breakpoint. */
const TABLET_NAV_MIN_WIDTH = 800
const TABLET_NAV_SCREEN_GAP = 12

/**
 * Gap between the edge-pinned nav columns and the viewport edge on wide
 * screens (half a CSS inch). Shrinks toward 0 when there isn't enough
 * room beside the center column, so the navs never overlap the feed.
 */
export const NAV_EDGE_INSET = 48

/**
 * Width of the full (non-minimal) desktop left nav. Sized so the Creative
 * Hub and Launch pills fit on one row.
 */
export const LEFT_NAV_WIDTH = 260

/**
 * Icon-only left nav used below the desktop breakpoint.
 */
export const LEFT_NAV_MINIMAL_WIDTH = 86

/** Desktop hover rail. Collapsed width, then the glass panel. */
export const SIDEBAR_RAIL_WIDTH = 72
export const SIDEBAR_OPEN_WIDTH = 240

export function getNavEdgeInset(windowWidth: number, navWidth: number) {
  const slack = (windowWidth - CENTER_COLUMN_WIDTH) / 2 - navWidth
  return Math.max(0, Math.min(NAV_EDGE_INSET, slack))
}

export type FeedColumnLayout = {
  /**
   * translateX applied to a column that is already centered with
   * margin: auto. Negative values shift the feed left so the feed and
   * the right nav share the viewport center. Does not change when the
   * rail opens: the 240px panel overlays the column.
   */
  centerContentOffset: number
  /** Left edge of the feed column in viewport coordinates. */
  feedLeft: number
  showRightNav: boolean
  desktopRail: boolean
}

/**
 * Place the 600px feed, and the right nav beside it when the pair fits.
 *
 * The open sidebar is not an input: it overlays and must not push.
 * `minFeedLeft` is the rail (plus a breath) or the tablet icon nav.
 */
export function placeFeedColumn({
  windowWidth,
  minFeedLeft,
  desktopRail = false,
  rightNavWidth = RIGHT_NAV_WIDTH,
}: {
  windowWidth: number
  minFeedLeft: number
  desktopRail?: boolean
  rightNavWidth?: number
}): FeedColumnLayout {
  if (windowWidth <= CENTER_COLUMN_WIDTH) {
    return {
      centerContentOffset: 0,
      feedLeft: 0,
      showRightNav: false,
      desktopRail,
    }
  }

  const centeredFeedLeft = (windowWidth - CENTER_COLUMN_WIDTH) / 2
  const blockWidth = CENTER_COLUMN_WIDTH + FEED_RIGHT_NAV_GAP + rightNavWidth
  const centeredBlockLeft = (windowWidth - blockWidth) / 2
  const blockFits =
    centeredBlockLeft >= minFeedLeft &&
    centeredBlockLeft + blockWidth <= windowWidth

  let feedLeft = blockFits ? centeredBlockLeft : centeredFeedLeft
  if (feedLeft < minFeedLeft) feedLeft = minFeedLeft
  const maxFeedLeft = Math.max(0, windowWidth - CENTER_COLUMN_WIDTH)
  if (feedLeft > maxFeedLeft) feedLeft = maxFeedLeft

  const centerContentOffset = Math.round(feedLeft - centeredFeedLeft)
  return {
    centerContentOffset,
    feedLeft: centeredFeedLeft + centerContentOffset,
    showRightNav: blockFits,
    desktopRail,
  }
}

/**
 * Shell layout for a viewport width. Mobile keeps a full-width column.
 * From the tablet icon nav upward, the feed is centered, and the right
 * nav joins it as one centered block when that block clears the left chrome.
 */
export function getFeedColumnLayout(windowWidth: number): FeedColumnLayout {
  const desktopRail = windowWidth >= DESKTOP_RAIL_MIN_WIDTH
  if (windowWidth < TABLET_NAV_MIN_WIDTH) {
    return {
      centerContentOffset: 0,
      feedLeft: 0,
      showRightNav: false,
      desktopRail: false,
    }
  }

  const minFeedLeft = desktopRail
    ? SIDEBAR_RAIL_WIDTH + RAIL_FEED_GAP
    : LEFT_NAV_MINIMAL_WIDTH + TABLET_NAV_SCREEN_GAP

  return placeFeedColumn({windowWidth, minFeedLeft, desktopRail})
}

/**
 * The hover rail and the bottom dock never show together. The dock stays
 * on the widths (and full-page routes) where the rail is not mounted.
 */
export function getShellChrome({
  hasSession,
  hasOwnChrome,
  isMobile,
  desktopRail,
  leftNavMinimal,
}: {
  hasSession: boolean
  hasOwnChrome: boolean
  isMobile: boolean
  desktopRail: boolean
  leftNavMinimal: boolean
}) {
  const showRail = !isMobile && !hasOwnChrome && desktopRail
  const showBottomBar = !showRail && (hasSession || leftNavMinimal)
  return {showRail, showBottomBar}
}
