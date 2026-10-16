import {View} from 'react-native'

import {atoms as a, useTheme, type ViewStyleProp} from '#/alf'

export function Divider({style}: ViewStyleProp) {
  return <View style={[a.w_full, a.my_xs, style]} />
}
