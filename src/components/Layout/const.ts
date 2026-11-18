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
 * RightNav sits this far from the viewport's right edge, the same lateral
 * padding X uses. One knob: the feed stays centered, so the space between
 * them grows with the window. No glass on this column.
 */
export const RIGHT_NAV_EDGE_INSET = 16

/**
 * Hide the RightNav when anchoring it to the right edge would come closer
 * than this to the feed. The gap above this minimum is whatever width is left.
 */
export const RIGHT_NAV_MIN_GAP = 16

/** Fixed width of the right column (search, Discover, trending). */
export const RIGHT_NAV_WIDTH = 300

/** Left edge of a right-anchored RightNav, in viewport coordinates. */
export function rightNavLeft(
  windowWidth: number,
  rightNavWidth = RIGHT_NAV_WIDTH,
) {
  return windowWidth - RIGHT_NAV_EDGE_INSET - rightNavWidth
}

/**
 * Clearance kept between the collapsed 72px rail and the feed when a
 * centered column would otherwise slide underneath the rail.
 */
export const RAIL_FEED_GAP = 16

/**
 * Hover rail from this viewport width up. 1280px is a desktop window.
 * The bottom dock stays at every width, including beside the rail.
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
   * margin: auto. Zero while the centered feed clears the left chrome.
   * Positive only when the rail or tablet nav would otherwise cover it.
   * The right nav does not move the feed. The open rail overlays.
   */
  centerContentOffset: number
  /** Left edge of the feed column in viewport coordinates. */
  feedLeft: number
  showRightNav: boolean
  desktopRail: boolean
}

/**
 * Center the 600px feed. Pinning the RightNav to the right edge does not
 * shift it. Hide that nav when its box would overlap the feed.
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
  let feedLeft = centeredFeedLeft
  if (feedLeft < minFeedLeft) feedLeft = minFeedLeft
  const maxFeedLeft = Math.max(0, windowWidth - CENTER_COLUMN_WIDTH)
  if (feedLeft > maxFeedLeft) feedLeft = maxFeedLeft

  const centerContentOffset = Math.round(feedLeft - centeredFeedLeft)
  const resolvedFeedLeft = centeredFeedLeft + centerContentOffset
  const feedRight = resolvedFeedLeft + CENTER_COLUMN_WIDTH
  const navLeft = rightNavLeft(windowWidth, rightNavWidth)
  const navFits =
    navLeft >= feedRight + RIGHT_NAV_MIN_GAP &&
    navLeft + rightNavWidth <= windowWidth - RIGHT_NAV_EDGE_INSET

  return {
    centerContentOffset,
    feedLeft: resolvedFeedLeft,
    showRightNav: navFits,
    desktopRail,
  }
}

/**
 * Shell layout for a viewport width. Mobile keeps a full-width column.
 * From the tablet icon nav upward, the feed stays centered. The right
 * nav is anchored to the viewport edge and only joins when it clears the feed.
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
 * Shell chrome for a viewport. The bottom dock stays at every width where
 * someone is signed in, on the tablet icon nav, or beside the desktop rail.
 * The rail does not replace the dock. Full-page routes hide the rail and
 * keep the dock; UIAI opts out of the dock on its own.
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
  const showBottomBar = hasSession || leftNavMinimal || showRail
  return {showRail, showBottomBar}
}
