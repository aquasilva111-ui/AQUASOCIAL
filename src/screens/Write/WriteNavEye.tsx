import {Pressable} from 'react-native'

import {atoms as a, useTheme, web} from '#/alf'
import {AquaEyeLogo} from '#/components/AquaEyeLogo'

/** Fixed eye in the top-left corner. Opens the left nav on Write only. */
export function WriteNavEye({
  open,
  onPress,
}: {
  open: boolean
  onPress: () => void
}) {
  const t = useTheme()
  return (
    <Pressable
      testID="writeNavEye"
      accessibilityRole="button"
      accessibilityLabel={open ? 'Hide menu' : 'Show menu'}
      accessibilityHint=""
      accessibilityState={{expanded: open}}
      onPress={onPress}
      style={[
        a.fixed,
        a.align_center,
        a.justify_center,
        a.z_30,
        a.rounded_full,
        t.atoms.bg,
        {
          top: 18,
          left: 20,
          width: 44,
          height: 44,
        },
        web(
          open
            ? {boxShadow: '0 0 0 3px #00A0FF'}
            : {boxShadow: '0 0 0 0 transparent'},
        ),
      ]}>
      <AquaEyeLogo size={44} active={open} />
    </Pressable>
  )
}
