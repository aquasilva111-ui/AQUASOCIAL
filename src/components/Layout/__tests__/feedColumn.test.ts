import {
  getNarrowScreenPosition,
  getWideScreenPosition,
} from '#/view/com/util/load-latest/position'
import {
  DOCK_HEIGHT,
  DOCK_INSET,
  DOCK_MAX_WIDTH,
  webFeedBottomSpacer,
} from '#/view/shell/bottom-bar/metrics'
import {
  CENTER_COLUMN_WIDTH,
  DESKTOP_RAIL_MIN_WIDTH,
  FEED_RIGHT_NAV_GAP,
  getFeedColumnLayout,
  getShellChrome,
  placeFeedColumn,
  RAIL_FEED_GAP,
  RIGHT_NAV_WIDTH,
  SIDEBAR_OPEN_WIDTH,
  SIDEBAR_RAIL_WIDTH,
} from '#/components/Layout/const'

const BLOCK_WIDTH = CENTER_COLUMN_WIDTH + FEED_RIGHT_NAV_GAP + RIGHT_NAV_WIDTH

function blockEdges(windowWidth: number) {
  const layout = getFeedColumnLayout(windowWidth)
  const feedRight = layout.feedLeft + CENTER_COLUMN_WIDTH
  const navLeft = feedRight + FEED_RIGHT_NAV_GAP
  const navRight = navLeft + RIGHT_NAV_WIDTH
  return {...layout, feedRight, navLeft, navRight}
}

describe('getFeedColumnLayout', () => {
  it('centers only the 600px feed at 1000px and hides the right nav', () => {
    const layout = getFeedColumnLayout(1000)
    expect(layout.desktopRail).toBe(false)
    expect(layout.showRightNav).toBe(false)
    expect(layout.centerContentOffset).toBe(0)
    expect(layout.feedLeft).toBe((1000 - CENTER_COLUMN_WIDTH) / 2)
  })

  it('centers the feed and the right nav as one block at 1280 and 1920', () => {
    for (const width of [1280, 1920]) {
      const edges = blockEdges(width)
      expect(edges.desktopRail).toBe(true)
      expect(edges.showRightNav).toBe(true)
      expect(edges.navLeft - edges.feedRight).toBe(FEED_RIGHT_NAV_GAP)
      expect(edges.feedLeft).toBe((width - BLOCK_WIDTH) / 2)
      expect(width - edges.navRight).toBe(edges.feedLeft)
      expect(edges.feedLeft).toBeGreaterThanOrEqual(
        SIDEBAR_RAIL_WIDTH + RAIL_FEED_GAP,
      )
    }
  })

  it('uses the same offset at every width where the block fits, so opening the rail cannot push the feed', () => {
    const wide = getFeedColumnLayout(1600)
    const wider = getFeedColumnLayout(1920)
    expect(wide.centerContentOffset).toBe(wider.centerContentOffset)
    expect(wide.showRightNav).toBe(true)
  })

  it('does not show the desktop rail below 1280', () => {
    expect(getFeedColumnLayout(DESKTOP_RAIL_MIN_WIDTH - 1).desktopRail).toBe(
      false,
    )
    expect(getFeedColumnLayout(DESKTOP_RAIL_MIN_WIDTH).desktopRail).toBe(true)
  })

  it('keeps the mobile column unshifted', () => {
    expect(getFeedColumnLayout(390)).toEqual({
      centerContentOffset: 0,
      feedLeft: 0,
      showRightNav: false,
      desktopRail: false,
    })
  })
})

describe('placeFeedColumn', () => {
  it('starts the feed just after the rail when centering would overlap it', () => {
    const minFeedLeft = SIDEBAR_RAIL_WIDTH + RAIL_FEED_GAP
    const layout = placeFeedColumn({
      windowWidth: 700,
      minFeedLeft,
      desktopRail: true,
    })
    expect(layout.showRightNav).toBe(false)
    expect(layout.feedLeft).toBe(minFeedLeft)
    expect(layout.centerContentOffset).toBe(
      minFeedLeft - (700 - CENTER_COLUMN_WIDTH) / 2,
    )
  })
})

describe('getShellChrome', () => {
  const loggedInHome = {
    hasSession: true,
    hasOwnChrome: false,
    isMobile: false,
    leftNavMinimal: true,
  }

  it('shows the dock without the rail at 1000px', () => {
    const chrome = getShellChrome({
      ...loggedInHome,
      desktopRail: getFeedColumnLayout(1000).desktopRail,
    })
    expect(chrome).toEqual({showRail: false, showBottomBar: true})
  })

  it('shows the rail and the dock together at 1024-and-up desktop widths', () => {
    // 1024 CSS px is still below the rail. From 1280 the rail is up, and
    // the dock stays with it (Home and Write /books share this shell).
    expect(getFeedColumnLayout(1024).desktopRail).toBe(false)
    for (const width of [1024, 1280, 1440, 1920]) {
      const chrome = getShellChrome({
        ...loggedInHome,
        leftNavMinimal: width <= 1300,
        desktopRail: getFeedColumnLayout(width).desktopRail,
      })
      expect(chrome.showBottomBar).toBe(true)
      expect(chrome.showRail).toBe(width >= 1280)
    }
  })

  it('keeps the dock beside the rail for a logged-out desktop window', () => {
    const chrome = getShellChrome({
      hasSession: false,
      hasOwnChrome: false,
      isMobile: false,
      desktopRail: true,
      leftNavMinimal: false,
    })
    expect(chrome).toEqual({showRail: true, showBottomBar: true})
  })

  it('pads the web feed past the floating dock', () => {
    expect(webFeedBottomSpacer(0)).toBeGreaterThanOrEqual(
      DOCK_INSET + DOCK_HEIGHT,
    )
    expect(webFeedBottomSpacer(80)).toBe(80 + DOCK_INSET + DOCK_HEIGHT)
  })

  it('keeps the centered dock clear of the rail, including the open panel', () => {
    for (const width of [1280, 1440, 1920]) {
      const dockWidth = Math.min(width - DOCK_INSET * 2, DOCK_MAX_WIDTH)
      const dockLeft = (width - dockWidth) / 2
      expect(dockLeft).toBeGreaterThanOrEqual(SIDEBAR_OPEN_WIDTH)
    }
  })

  it('lifts the load-latest button off the dock on a desktop home', () => {
    const button = 42
    for (const width of [1280, 1440, 1920]) {
      const layout = getFeedColumnLayout(width)
      const pos = getWideScreenPosition({
        windowWidth: width,
        dockVisible: true,
        canGoOutOfLine: width > 1300,
        centerContentOffset: layout.centerContentOffset,
      })
      const dockWidth = Math.min(width - DOCK_INSET * 2, DOCK_MAX_WIDTH)
      const dockLeft = (width - dockWidth) / 2
      const dockTop = DOCK_INSET + DOCK_HEIGHT
      const overlaps =
        pos.left < dockLeft + dockWidth &&
        pos.left + button > dockLeft &&
        pos.bottom < dockTop
      expect(overlaps).toBe(false)
      expect(pos.left).toBeGreaterThanOrEqual(SIDEBAR_RAIL_WIDTH)
    }
  })

  it('lifts the load-latest button off the dock on a phone', () => {
    const pos = getNarrowScreenPosition({
      dockVisible: true,
      bottomWithoutDock: 30,
    })
    expect(pos.bottom).toBeGreaterThanOrEqual(DOCK_INSET + DOCK_HEIGHT)
  })

  it('leaves the dock available on full-page routes that hide the rail', () => {
    const chrome = getShellChrome({
      hasSession: true,
      hasOwnChrome: true,
      isMobile: false,
      desktopRail: true,
      leftNavMinimal: false,
    })
    expect(chrome).toEqual({showRail: false, showBottomBar: true})
  })
})
