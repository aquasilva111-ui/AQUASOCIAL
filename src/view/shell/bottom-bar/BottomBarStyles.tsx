import {StyleSheet} from 'react-native'

import {colors} from '#/lib/styles'
import {
  DOCK_HEIGHT,
  DOCK_INSET,
  DOCK_INSET_NARROW,
  DOCK_INSET_WIDE,
  DOCK_MAX_WIDTH,
  DOCK_MAX_WIDTH_WIDE,
  webFeedBottomSpacer,
} from '#/view/shell/bottom-bar/metrics'
import {atoms as a} from '#/alf'

export {
  DOCK_HEIGHT,
  DOCK_INSET,
  DOCK_INSET_NARROW,
  DOCK_INSET_WIDE,
  DOCK_MAX_WIDTH,
  DOCK_MAX_WIDTH_WIDE,
  webFeedBottomSpacer,
}

export const styles = StyleSheet.create({
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingLeft: DOCK_INSET,
    paddingRight: DOCK_INSET,
    paddingBottom: DOCK_INSET,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    pointerEvents: 'box-none',
  },
  bottomBarWeb: a.fixed,
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: DOCK_MAX_WIDTH,
    // full pill; the end tabs sit well inside the curve
    borderRadius: 999,
    paddingLeft: 6,
    paddingRight: 6,
    paddingTop: 6,
    paddingBottom: 6,
    borderWidth: 1,
  },
  ctrl: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    paddingBottom: 6,
    minHeight: 44,
  },
  ctrlLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 0.1,
  },
  createCtrl: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
    paddingBottom: 2,
  },
  createBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationCount: {
    position: 'absolute',
    left: '52%',
    top: 4,
    paddingHorizontal: 4,
    paddingBottom: 1,
    borderRadius: 6,
    zIndex: 1,
  },
  notificationCountWeb: {
    paddingTop: 3,
    paddingBottom: 3,
    borderRadius: 12,
  },
  notificationCountLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.white,
    fontVariant: ['tabular-nums'],
  },
  hasNewBadge: {
    position: 'absolute',
    left: '54%',
    marginLeft: 4,
    top: 8,
    width: 8,
    height: 8,
    backgroundColor: colors.blue3,
    borderRadius: 6,
    zIndex: 1,
  },
  ctrlIcon: {
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  ctrlIconSizingWrapper: {},
  homeIcon: {},
  feedsIcon: {},
  searchIcon: {
    top: -1,
  },
  bellIcon: {},
  profileIcon: {
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  messagesIcon: {},
  /** Tablet and desktop web: shorter pill, capped width, closer to the edge. */
  bottomBarWide: {
    paddingLeft: DOCK_INSET_WIDE,
    paddingRight: DOCK_INSET_WIDE,
    paddingBottom: DOCK_INSET_WIDE,
  },
  dockWide: {
    maxWidth: DOCK_MAX_WIDTH_WIDE,
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 4,
    paddingRight: 4,
  },
  ctrlWide: {
    paddingTop: 2,
    paddingBottom: 1,
    minHeight: 0,
  },
  ctrlLabelWide: {
    fontSize: 10,
    marginTop: 1,
  },
  createBtnWide: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  /** Phone web: a light trim. The pill still spans the screen. */
  bottomBarNarrow: {
    paddingBottom: DOCK_INSET_NARROW,
  },
  dockNarrow: {
    paddingTop: 5,
    paddingBottom: 5,
  },
  ctrlNarrow: {
    paddingTop: 4,
    paddingBottom: 4,
    minHeight: 40,
  },
  createBtnNarrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  onProfile: {
    borderWidth: 1,
    borderRadius: 100,
  },
})
