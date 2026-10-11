import {Pressable} from 'react-native'

import {atoms as a} from '#/alf'
import {type Props as SVGIconProps} from '#/components/icons/common'

/**
 * Icon-only button for the always-dark story screens (viewer, creator),
 * where theme-coloured buttons would turn dark-on-black in light mode.
 */
export function OnDarkIconButton({
  label,
  icon: Icon,
  size = 'lg',
  disabled,
  onPress,
}: {
  label: string
  icon: React.ComponentType<SVGIconProps>
  size?: SVGIconProps['size']
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint=""
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={[
        a.align_center,
        a.justify_center,
        {width: 40, height: 40, opacity: disabled ? 0.5 : 1},
      ]}>
      <Icon size={size} fill="#fff" />
    </Pressable>
  )
}
