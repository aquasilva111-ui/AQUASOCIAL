import {type ReactNode} from 'react'
import {View} from 'react-native'
import Svg, {Path} from 'react-native-svg'

import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'
import {AQUA_RADIUS, aquaMediaFrame} from './palette'

/**
 * Inverted corner: a square the size of the notch curve, minus the circle
 * centered on its top-right. Same cut the mockup draws with a radial gradient.
 */
function ConcaveCorner({color}: {color: string}) {
  const s = AQUA_RADIUS.notch
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <Path
        fill={color}
        fillRule="evenodd"
        d={`M0 0 H${s} V${s} H0 Z M0 0 a ${s} ${s} 0 1 0 ${s * 2} 0 a ${s} ${s} 0 1 0 ${-s * 2} 0`}
      />
    </Svg>
  )
}

export function AquaMediaChrome({
  actions,
  capsule,
  sparkle,
  duration,
  notchColor,
  header,
  placement = 'tile',
}: {
  actions: ReactNode
  capsule?: ReactNode
  sparkle?: ReactNode
  duration?: string
  notchColor: string
  /** Author row drawn over the top of a full-bleed card. */
  header?: ReactNode
  /**
   * `card` matches card-sem-moldura: sparkle and duration sit just above the
   * notch, because the header already occupies the top of the media.
   */
  placement?: 'tile' | 'card'
}) {
  const onCard = placement === 'card'
  return (
    <View pointerEvents="box-none" style={[a.absolute, a.inset_0, {zIndex: 2}]}>
      {header}
      {duration ? (
        <DurationChip
          label={duration}
          placement={onCard ? 'above-notch' : 'top-left'}
        />
      ) : null}
      {sparkle ? (
        <View
          pointerEvents="box-none"
          style={[
            a.absolute,
            onCard
              ? {right: 14, bottom: 60, zIndex: 3}
              : {top: 10, right: 10, zIndex: 3},
          ]}>
          {sparkle}
        </View>
      ) : null}
      <View
        pointerEvents="box-none"
        style={[a.absolute, {left: 0, bottom: 0, zIndex: 3}]}>
        <View
          pointerEvents="none"
          style={[a.absolute, {left: 0, top: -AQUA_RADIUS.notch}]}>
          <ConcaveCorner color={notchColor} />
        </View>
        <View
          style={[
            a.flex_row,
            a.align_center,
            {
              backgroundColor: notchColor,
              borderTopRightRadius: AQUA_RADIUS.notch,
              paddingTop: 6,
              paddingBottom: 2,
              paddingRight: 4,
              paddingLeft: 2,
              gap: 0,
            },
          ]}>
          {actions}
        </View>
        <View
          pointerEvents="none"
          style={[a.absolute, {right: -AQUA_RADIUS.notch, bottom: 0}]}>
          <ConcaveCorner color={notchColor} />
        </View>
      </View>
      {capsule ? (
        <View
          pointerEvents="box-none"
          style={[
            a.absolute,
            {right: 10, bottom: 10, maxWidth: '48%', zIndex: 3},
          ]}>
          {capsule}
        </View>
      ) : null}
    </View>
  )
}

export function DurationChip({
  label,
  placement = 'top-left',
}: {
  label: string
  placement?: 'top-left' | 'above-notch'
}) {
  const t = useTheme()
  return (
    <View
      pointerEvents="none"
      accessibilityLabel={label}
      accessibilityHint=""
      style={[
        a.absolute,
        a.rounded_sm,
        a.px_xs,
        placement === 'above-notch'
          ? {right: 60, bottom: 62, zIndex: 3}
          : {top: 12, left: 12, zIndex: 3},
        {
          backgroundColor: 'rgba(15,23,42,0.72)',
          paddingVertical: 3,
        },
      ]}>
      <Text style={[a.text_xs, a.font_bold, {color: t.palette.white}]}>
        {label}
      </Text>
    </View>
  )
}

export function mediaChromeClip(active: boolean) {
  if (!active) return null
  return {
    marginTop: 0,
    ...aquaMediaFrame(),
    position: 'relative' as const,
  }
}
