import {type ReactNode} from 'react'
import {View} from 'react-native'

import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'

/**
 * Glass controls floating on a photo, video, or link cover.
 * The like / reply / send / react capsules and the like count sit on the
 * bottom edge. The star sits at the top-right. Nothing cuts the media.
 */
export function AquaMediaChrome({
  actions,
  capsule,
  sparkle,
  duration,
  header,
  placement = 'tile',
}: {
  actions: ReactNode
  capsule?: ReactNode
  sparkle?: ReactNode
  duration?: string
  /** Author row drawn over the top of a full-bleed card. */
  header?: ReactNode
  /**
   * `card` keeps the author row on the photo, so the duration chip sits
   * just under that row instead of covering the avatar.
   */
  placement?: 'tile' | 'card'
}) {
  const onCard = placement === 'card'
  return (
    <View pointerEvents="box-none" style={[a.absolute, a.inset_0, {zIndex: 2}]}>
      {header}
      {duration ? <DurationChip label={duration} belowHeader={onCard} /> : null}
      {sparkle ? (
        <View
          pointerEvents="box-none"
          style={[a.absolute, {top: 12, right: 12, zIndex: 6}]}>
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

export function DurationChip({
  label,
  belowHeader = false,
}: {
  label: string
  /** Clear the overlaid author row on a full-bleed card. */
  belowHeader?: boolean
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
        belowHeader
          ? {top: 78, left: 16, zIndex: 5}
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
