import {
  DOCK_HEIGHT,
  DOCK_INSET,
  DOCK_MAX_WIDTH,
} from '#/view/shell/bottom-bar/metrics'
import {
  CENTER_COLUMN_WIDTH,
  SIDEBAR_RAIL_WIDTH,
} from '#/components/Layout/const'

const BUTTON_SIZE = 42
const GAP = 12

/** Phone web: left edge, lifted above the dock when it is on screen. */
export function getNarrowScreenPosition({
  dockVisible,
  bottomWithoutDock,
}: {
  dockVisible: boolean
  bottomWithoutDock: number
}) {
  return {
    left: 18,
    bottom: dockVisible ? DOCK_INSET + DOCK_HEIGHT + GAP : bottomWithoutDock,
  }
}

/**
 * Beside the floating dock when there's room between it and the left nav,
 * otherwise inside the feed's left edge, lifted above the dock.
 */
export function getWideScreenPosition({
  windowWidth,
  dockVisible,
  canGoOutOfLine,
  centerContentOffset,
}: {
  windowWidth: number
  dockVisible: boolean
  canGoOutOfLine: boolean
  centerContentOffset: number
}) {
  const dockWidth = Math.min(windowWidth - DOCK_INSET * 2, DOCK_MAX_WIDTH)
  const dockLeft = (windowWidth - dockWidth) / 2
  const outOfLineLeft = dockLeft - BUTTON_SIZE - GAP
  // The desktop rail rests at the collapsed width; hover overlays and
  // must not move this button.
  const leftNavRight = SIDEBAR_RAIL_WIDTH
  if (canGoOutOfLine && outOfLineLeft >= leftNavRight + GAP) {
    return {left: outOfLineLeft, bottom: 30}
  }
  const feedLeft = (windowWidth - CENTER_COLUMN_WIDTH) / 2 + centerContentOffset
  return {
    left: feedLeft + 18,
    bottom: dockVisible ? DOCK_INSET + DOCK_HEIGHT + GAP : 30,
  }
}
