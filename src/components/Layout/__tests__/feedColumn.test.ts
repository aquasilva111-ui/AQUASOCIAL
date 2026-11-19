import {
  getNarrowScreenPosition,
  getWideScreenPosition,
} from '#/view/com/util/load-latest/position'
import {
  DOCK_HEIGHT_NARROW,
  DOCK_HEIGHT_WIDE,
  DOCK_INSET_NARROW,
  DOCK_INSET_WIDE,
  DOCK_MAX_WIDTH_WIDE,
  webFeedBottomSpacer,
} from '#/view/shell/bottom-bar/metrics'
import {
  CENTER_COLUMN_WIDTH,
  DESKTOP_RAIL_MIN_WIDTH,
  getFeedColumnLayout,
  getShellChrome,
  placeFeedColumn,
  RAIL_FEED_GAP,
  RIGHT_NAV_EDGE_INSET,
  RIGHT_NAV_MIN_GAP,
  RIGHT_NAV_WIDTH,
  rightNavLeft,
  SIDEBAR_OPEN_WIDTH,
  SIDEBAR_RAIL_WIDTH,
} from '#/components/Layout/const'

function edges(windowWidth: number) {
  const layout = getFeedColumnLayout(windowWidth)
  const feedRight = layout.feedLeft + CENTER_COLUMN_WIDTH
  const navLeft = rightNavLeft(windowWidth)
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

  it('keeps the feed centered and pins the right nav to the viewport edge', () => {
    let previousGap = 0
    for (const width of [1280, 1440, 1920]) {
      const box = edges(width)
      expect(box.desktopRail).toBe(true)
      expect(box.showRightNav).toBe(true)
      expect(box.centerContentOffset).toBe(0)
      expect(box.feedLeft).toBe((width - CENTER_COLUMN_WIDTH) / 2)
      expect(width - box.navRight).toBe(RIGHT_NAV_EDGE_INSET)
      expect(box.navLeft - box.feedRight).toBeGreaterThanOrEqual(
        RIGHT_NAV_MIN_GAP,
      )
      expect(box.navLeft - box.feedRight).toBeGreaterThan(previousGap)
      expect(box.feedLeft).toBeGreaterThanOrEqual(
        SIDEBAR_RAIL_WIDTH + RAIL_FEED_GAP,
      )
      previousGap = box.navLeft - box.feedRight
    }
  })

  it('hides the right nav instead of covering a centered feed', () => {
    for (const width of [1024, 1200]) {
      const box = edges(width)
      expect(box.showRightNav).toBe(false)
      expect(box.centerContentOffset).toBe(0)
      expect(box.feedLeft).toBe((width - CENTER_COLUMN_WIDTH) / 2)
      expect(box.navLeft).toBeLessThan(box.feedRight + RIGHT_NAV_MIN_GAP)
    }
  })

  it('never overlaps the feed at any width where the right nav is shown', () => {
    for (let width = 800; width <= 2560; width += 1) {
      const box = edges(width)
      if (!box.showRightNav) continue
      expect(box.navLeft).toBeGreaterThanOrEqual(
        box.feedRight + RIGHT_NAV_MIN_GAP,
      )
      expect(box.navRight).toBeLessThanOrEqual(width)
      expect(width - box.navRight).toBe(RIGHT_NAV_EDGE_INSET)
    }
  })

  it('does not move the feed when the right nav appears', () => {
    const wide = getFeedColumnLayout(1600)
    const wider = getFeedColumnLayout(1920)
    expect(wide.centerContentOffset).toBe(0)
    expect(wider.centerContentOffset).toBe(0)
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
    const clearance = Math.max(
      DOCK_INSET_WIDE + DOCK_HEIGHT_WIDE,
      DOCK_INSET_NARROW + DOCK_HEIGHT_NARROW,
    )
    expect(webFeedBottomSpacer(0)).toBeGreaterThanOrEqual(clearance)
    expect(webFeedBottomSpacer(80)).toBe(80 + clearance)
  })

  it('keeps the compact desktop dock clear of the rail, including the open panel', () => {
    expect(DOCK_MAX_WIDTH_WIDE).toBeGreaterThanOrEqual(420)
    expect(DOCK_MAX_WIDTH_WIDE).toBeLessThanOrEqual(460)
    expect(DOCK_HEIGHT_WIDE).toBeLessThanOrEqual(62)
    for (const width of [1280, 1440, 1920]) {
      const dockWidth = Math.min(
        width - DOCK_INSET_WIDE * 2,
        DOCK_MAX_WIDTH_WIDE,
      )
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
      const dockWidth = Math.min(
        width - DOCK_INSET_WIDE * 2,
        DOCK_MAX_WIDTH_WIDE,
      )
      const dockLeft = (width - dockWidth) / 2
      const dockTop = DOCK_INSET_WIDE + DOCK_HEIGHT_WIDE
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
    expect(pos.bottom).toBeGreaterThanOrEqual(
      DOCK_INSET_NARROW + DOCK_HEIGHT_NARROW,
    )
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
