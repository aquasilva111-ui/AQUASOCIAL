import {useMemo} from 'react'
import {useWindowDimensions} from 'react-native'
import {useMediaQuery} from 'react-responsive'

import {getFeedColumnLayout} from '#/components/Layout/const'

export type Breakpoint = 'gtPhone' | 'gtMobile' | 'gtTablet'

export function useBreakpoints(): Record<Breakpoint, boolean> & {
  activeBreakpoint: Breakpoint | undefined
} {
  const gtPhone = useMediaQuery({minWidth: 500})
  const gtMobile = useMediaQuery({minWidth: 800})
  const gtTablet = useMediaQuery({minWidth: 1300})
  return useMemo(() => {
    let active: Breakpoint | undefined
    if (gtTablet) {
      active = 'gtTablet'
    } else if (gtMobile) {
      active = 'gtMobile'
    } else if (gtPhone) {
      active = 'gtPhone'
    }
    return {
      activeBreakpoint: active,
      gtPhone,
      gtMobile,
      gtTablet,
    }
  }, [gtPhone, gtMobile, gtTablet])
}

/**
 * Fine-tuned breakpoints for the shell layout
 */
export function useLayoutBreakpoints() {
  const {width} = useWindowDimensions()
  const leftNavMinimal = useMediaQuery({maxWidth: 1300})
  // The rail's open state is intentionally not an input: the 240px panel
  // overlays the column and must not push it.
  const {centerContentOffset, showRightNav, desktopRail} =
    getFeedColumnLayout(width)

  return {
    rightNavVisible: showRightNav,
    leftNavMinimal,
    centerContentOffset,
    desktopRail,
  }
}
