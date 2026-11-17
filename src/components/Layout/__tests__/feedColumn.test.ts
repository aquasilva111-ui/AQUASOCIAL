import {
  CENTER_COLUMN_WIDTH,
  DESKTOP_RAIL_MIN_WIDTH,
  FEED_RIGHT_NAV_GAP,
  getFeedColumnLayout,
  getShellChrome,
  placeFeedColumn,
  RAIL_FEED_GAP,
  RIGHT_NAV_WIDTH,
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

  it('shows the rail without the dock at 1280 and 1920', () => {
    for (const width of [1280, 1920]) {
      const chrome = getShellChrome({
        ...loggedInHome,
        leftNavMinimal: width <= 1300,
        desktopRail: getFeedColumnLayout(width).desktopRail,
      })
      expect(chrome).toEqual({showRail: true, showBottomBar: false})
    }
  })

  it('never shows the rail and the dock together', () => {
    const cases = [
      {width: 390, isMobile: true},
      {width: 800, isMobile: false},
      {width: 1000, isMobile: false},
      {width: 1279, isMobile: false},
      {width: 1280, isMobile: false},
      {width: 1920, isMobile: false},
    ]
    for (const {width, isMobile} of cases) {
      for (const hasSession of [true, false]) {
        const chrome = getShellChrome({
          hasSession,
          hasOwnChrome: false,
          isMobile,
          desktopRail: getFeedColumnLayout(width).desktopRail,
          leftNavMinimal: width <= 1300,
        })
        expect(chrome.showRail && chrome.showBottomBar).toBe(false)
      }
    }
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
