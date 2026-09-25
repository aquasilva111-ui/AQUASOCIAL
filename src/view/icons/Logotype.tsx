import Svg, {type PathProps, type SvgProps,Text as SvgText} from 'react-native-svg'

import {usePalette} from '#/lib/hooks/usePalette'

const ratio = 34 / 72

export function Logotype({
  fill,
  ...rest
}: {fill?: PathProps['fill']} & SvgProps) {
  const pal = usePalette('default')
  // @ts-ignore it's fiiiiine
  const size = parseInt(rest.width || 32, 10)

  return (
    <Svg
      viewBox="0 0 72 34"
      {...rest}
      width={size}
      height={Number(size) * ratio}>
      <SvgText
        x={0}
        y={26.5}
        fontFamily="InterVariable"
        fontWeight="700"
        fontSize={26}
        fill={fill || pal.text.color}>
        Aqua
      </SvgText>
    </Svg>
  )
}
