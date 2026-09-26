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
        viewBox="0 0 810 810"
        style={[a.relative, {width: size, height: size, top: -50}]}>
        <Circle cx={413.18} cy={413.18} r={381.55} fill="#002bef" />
        <Circle cx={413.18} cy={413.18} r={218.66} fill="#ffffff" />
        <Circle cx={413.18} cy={413.18} r={155.56} fill="#009eff" />
        <Circle cx={413.18} cy={413.18} r={79.69} fill="#000000" />
      </Svg>
    </View>
  )
}
