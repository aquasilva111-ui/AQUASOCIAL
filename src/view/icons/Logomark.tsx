import Svg, {Circle, Path, type PathProps, type SvgProps} from 'react-native-svg'

import {usePalette} from '#/lib/hooks/usePalette'

const ratio = 810 / 810

export function Logomark({
  fill,
  ...rest
}: {fill?: PathProps['fill']} & SvgProps) {
  const pal = usePalette('default')
  // @ts-ignore it's fiiiiine
  const size = parseInt(rest.width || 32, 10)
  const color = fill || pal.text.color

  return (
    <Svg
      viewBox="0 0 810 810"
      {...rest}
      width={size}
      height={Number(size) * ratio}>
      <Path
        fill={color}
        fillRule="evenodd"
        d="M31.63 413.18a381.55 381.55 0 1 0 763.1 0a381.55 381.55 0 1 0 -763.1 0ZM194.52 413.18a218.66 218.66 0 1 0 437.32 0a218.66 218.66 0 1 0 -437.32 0Z"
      />
      <Circle cx={413.18} cy={413.18} r={155.56} fill={color} />
    </Svg>
  )
}
