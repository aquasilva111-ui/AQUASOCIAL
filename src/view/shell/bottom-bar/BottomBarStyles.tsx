import {StyleSheet} from 'react-native'

import {colors} from '#/lib/styles'
import {atoms as a} from '#/alf'

export const DOCK_INSET = 12
export const DOCK_MAX_WIDTH = 720
/** Tallest dock variant: 48px create button + label, padding and border. */
export const DOCK_HEIGHT = 82

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
    borderRadius: 28,
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
  onProfile: {
    borderWidth: 1,
    borderRadius: 100,
  },
})
