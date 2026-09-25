import React from 'react'
import {type TextProps} from 'react-native'
import Svg, {Circle, type PathProps, type SvgProps} from 'react-native-svg'

import {flatten} from '#/alf'

const ratio = 810 / 810

type Props = {
  fill?: PathProps['fill']
  style?: TextProps['style']
} & Omit<SvgProps, 'style'>

export const Logo = React.forwardRef(function LogoImpl(props: Props, ref) {
  const styles = flatten(props.style)
  // @ts-ignore it's fiiiiine
  const size = parseInt(props.width || 32, 10)

  return (
    <Svg
      // @ts-ignore it's fiiiiine
      ref={ref}
      viewBox="0 0 810 810"
      accessibilityLabel="Aqua"
      accessibilityHint=""
      accessibilityRole="image"
      {...props}
      style={[{width: size, height: size * ratio}, styles]}>
      <Circle cx={413.18} cy={413.18} r={381.55} fill="#002bef" />
      <Circle cx={413.18} cy={413.18} r={218.66} fill="#ffffff" />
      <Circle cx={413.18} cy={413.18} r={155.56} fill="#009eff" />
      <Circle cx={413.18} cy={413.18} r={79.69} fill="#000000" />
    </Svg>
  )
})
