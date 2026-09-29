import {useWindowDimensions} from 'react-native'
import Animated from 'react-native-reanimated'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {useMediaQuery} from 'react-responsive'

import {HITSLOP_20} from '#/lib/constants'
import {PressableScale} from '#/lib/custom-animations/PressableScale'
import {useMinimalShellFabTransform} from '#/lib/hooks/useMinimalShellTransform'
import {useWebMediaQueries} from '#/lib/hooks/useWebMediaQueries'
import {clamp} from '#/lib/numbers'
import {useGate} from '#/lib/statsig/statsig'
import {useSession} from '#/state/session'
import {
  DOCK_HEIGHT,
  DOCK_INSET,
  DOCK_MAX_WIDTH,
} from '#/view/shell/bottom-bar/BottomBarStyles'
import {atoms as a, useLayoutBreakpoints, useTheme} from '#/alf'
import {useInteractionState} from '#/components/hooks/useInteractionState'
import {ArrowTop_Stroke2_Corner0_Rounded as ArrowIcon} from '#/components/icons/Arrow'
import {
  CENTER_COLUMN_OFFSET,
  CENTER_COLUMN_WIDTH,
  getNavEdgeInset,
  LEFT_NAV_WIDTH,
} from '#/components/Layout'
import {SubtleHover} from '#/components/SubtleHover'

export function LoadLatestBtn({
  onPress,
  label,
  showIndicator,
}: {
  onPress: () => void
  label: string
  showIndicator: boolean
}) {
  const {hasSession} = useSession()
  const {isDesktop, isMobile, isTabletOrMobile, isTabletOrDesktop} =
    useWebMediaQueries()
  const {centerColumnOffset, leftNavMinimal} = useLayoutBreakpoints()
  const {width: windowWidth} = useWindowDimensions()
  const fabMinimalShellTransform = useMinimalShellFabTransform()
  const insets = useSafeAreaInsets()
  const t = useTheme()
  const {
    state: hovered,
    onIn: onHoverIn,
    onOut: onHoverOut,
  } = useInteractionState()

  // move button inline if it starts overlapping the left nav
  const isTallViewport = useMediaQuery({minHeight: 700})

  const gate = useGate()
  if (gate('remove_show_latest_button')) {
    return null
  }

  // Adjust height of the fab if we have a session only on mobile web. If we don't have a session, we want to adjust
  // it on both tablet and mobile since we are showing the bottom bar (see createNativeStackNavigatorWithAuth)
  const showBottomBar = hasSession ? isMobile : isTabletOrMobile

  const position = isTabletOrDesktop
    ? getWideScreenPosition({
        windowWidth,
        // The Aqua dock shows whenever signed in, and below 1300px regardless
        // (see createNativeStackNavigatorWithAuth).
        dockVisible: hasSession || leftNavMinimal,
        canGoOutOfLine: isDesktop && isTallViewport && !leftNavMinimal,
        centerColumnOffset,
      })
    : {left: 18, bottom: clamp(insets.bottom, 15, 60) + 15}

  return (
    <Animated.View
      testID="loadLatestBtn"
      style={[
        a.fixed,
        a.z_20,
        position,
        showBottomBar && fabMinimalShellTransform,
      ]}>
      <PressableScale
        style={[
          {
            width: 42,
            height: 42,
          },
          a.rounded_full,
          a.align_center,
          a.justify_center,
          a.border,
          t.atoms.border_contrast_low,
          showIndicator ? {backgroundColor: t.palette.primary_50} : t.atoms.bg,
        ]}
        onPress={onPress}
        hitSlop={HITSLOP_20}
        accessibilityLabel={label}
        accessibilityHint=""
        targetScale={0.9}
        onPointerEnter={onHoverIn}
        onPointerLeave={onHoverOut}>
        <SubtleHover hover={hovered} style={[a.rounded_full]} />
        <ArrowIcon
          size="md"
          style={[
            a.z_10,
            showIndicator
              ? {color: t.palette.primary_500}
              : t.atoms.text_contrast_medium,
          ]}
        />
      </PressableScale>
    </Animated.View>
  )
}

const BUTTON_SIZE = 42
const GAP = 12

/**
 * Beside the floating dock when there's room between it and the left nav,
 * otherwise inside the feed's left edge, lifted above the dock.
 */
function getWideScreenPosition({
  windowWidth,
  dockVisible,
  canGoOutOfLine,
  centerColumnOffset,
}: {
  windowWidth: number
  dockVisible: boolean
  canGoOutOfLine: boolean
  centerColumnOffset: boolean
}) {
  const dockWidth = Math.min(windowWidth - DOCK_INSET * 2, DOCK_MAX_WIDTH)
  const dockLeft = (windowWidth - dockWidth) / 2
  const outOfLineLeft = dockLeft - BUTTON_SIZE - GAP
  const leftNavRight =
    getNavEdgeInset(windowWidth, LEFT_NAV_WIDTH) + LEFT_NAV_WIDTH
  if (canGoOutOfLine && outOfLineLeft >= leftNavRight + GAP) {
    return {left: outOfLineLeft, bottom: 30}
  }
  const feedLeft =
    (windowWidth - CENTER_COLUMN_WIDTH) / 2 +
    (centerColumnOffset ? CENTER_COLUMN_OFFSET : 0)
  return {
    left: feedLeft + 18,
    bottom: dockVisible ? DOCK_INSET + DOCK_HEIGHT + GAP : 30,
  }
}
