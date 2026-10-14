/*
 * This is a reimplementation of what exists in our HTML template files
 * already. Once the React tree mounts, this is what gets rendered first, until
 * the app is ready to go.
 */

import {View} from 'react-native'
import Svg, {Circle} from 'react-native-svg'

import {atoms as a} from '#/alf'

const size = 100

export function Splash() {
  return (
    <View style={[a.fixed, a.inset_0, a.align_center, a.justify_center]}>
      <Svg
        fill="none"
        viewBox="0 0 1100 1100"
        style={[a.relative, {width: size, height: size, top: -50}]}>
        <Circle cx={550} cy={550} r={510} fill="#002BEF" />
        <Circle cx={550} cy={550} r={320} fill="#FFFFFF" />
        <Circle cx={550} cy={550} r={205} fill="#7EC8F5" />
        <Circle cx={550} cy={550} r={96} fill="#000000" />
      </Svg>
    </View>
  )
}
