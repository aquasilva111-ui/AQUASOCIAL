import Svg, {Circle, Text as SvgText} from 'react-native-svg'

import {type Props, useCommonSVGProps} from './common'

export function Mark(props: Props) {
  const {size, style, gradient, ...rest} = useCommonSVGProps(props)

  return (
    <Svg viewBox="0 0 810 810" width={size} height={size} style={style} {...rest}>
      {gradient}
      <Circle cx={413.18} cy={413.18} r={381.55} fill="#002bef" />
      <Circle cx={413.18} cy={413.18} r={218.66} fill="#ffffff" />
      <Circle cx={413.18} cy={413.18} r={155.56} fill="#009eff" />
      <Circle cx={413.18} cy={413.18} r={79.69} fill="#000000" />
    </Svg>
  )
}

export function Full(
  props: Omit<Props, 'fill' | 'size' | 'height'> & {
    markFill?: Props['fill']
    textFill?: Props['fill']
  },
) {
  const {size, style, gradient, ...rest} = useCommonSVGProps(props)
  const ratio = 810 / 1740

  return (
    <Svg
      {...rest}
      viewBox="0 0 1740 810"
      width={size}
      height={size * ratio}
      style={[style]}>
      {gradient}
      <Circle cx={405} cy={405} r={381.55} fill="#002bef" />
      <Circle cx={405} cy={405} r={218.66} fill="#ffffff" />
      <Circle cx={405} cy={405} r={155.56} fill="#009eff" />
      <Circle cx={405} cy={405} r={79.69} fill="#000000" />
      <SvgText
        x={850}
        y={540}
        fontFamily="InterVariable"
        fontWeight="700"
        fontSize={340}
        fill={props.textFill ?? '#000000'}>
        Aqua
      </SvgText>
    </Svg>
  )
}
