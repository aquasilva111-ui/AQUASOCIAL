import {type ReactNode} from 'react'
import {View} from 'react-native'

import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'

/**
 * Glass controls floating on a photo, video, or link cover.
 * The like / reply / send / react capsules and the like count sit on the
 * bottom edge. The star sits at the top-right and the duration pill at the
 * top-left. Nothing cuts the media.
 */
export function AquaMediaChrome({
  actions,
  capsule,
  sparkle,
  duration,
}: {
  actions: ReactNode
  capsule?: ReactNode
  sparkle?: ReactNode
  duration?: string
}) {
  return (
    <View pointerEvents="box-none" style={[a.absolute, a.inset_0, {zIndex: 2}]}>
      {duration ? <DurationChip label={duration} /> : null}
      {sparkle ? (
        <View
          pointerEvents="box-none"
          style={[a.absolute, {top: 10, right: 10, zIndex: 6}]}>
          {sparkle}
        </View>
      ) : null}
      <View
        pointerEvents="box-none"
        style={[
          a.absolute,
          a.flex_row,
          a.align_center,
          {left: 10, right: 10, bottom: 10, gap: 6, zIndex: 3},
        ]}>
        {actions}
        {capsule ? (
          <>
            <View pointerEvents="none" style={a.flex_1} />
            <View
              pointerEvents="box-none"
              style={{maxWidth: '48%', flexShrink: 1}}>
              {capsule}
            </View>
          </>
        ) : null}
      </View>
    </View>
  )
}

export function DurationChip({label}: {label: string}) {
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
        {
          top: 12,
          left: 12,
          zIndex: 3,
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
