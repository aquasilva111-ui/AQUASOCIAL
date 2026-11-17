import {useMemo} from 'react'
import {useWindowDimensions} from 'react-native'
import {useMediaQuery} from 'react-responsive'

import {
  CENTER_COLUMN_OFFSET,
  getCollapsedNavContentOffset,
} from '#/components/Layout/const'

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
  const rightNavVisible = useMediaQuery({minWidth: 1100})
  const centerColumnOffset = useMediaQuery({minWidth: 1100, maxWidth: 1300})
  const leftNavMinimal = useMediaQuery({maxWidth: 1300})
  // Wide desktop keeps the feed clear of the collapsed rail only. The
  // expanded nav overlays that column and must not move it.
  const centerContentOffset = centerColumnOffset
    ? CENTER_COLUMN_OFFSET
    : width > 1300
      ? getCollapsedNavContentOffset(width)
      : 0

  return {
    rightNavVisible,
    centerColumnOffset,
    leftNavMinimal,
    centerContentOffset,
  }
}
