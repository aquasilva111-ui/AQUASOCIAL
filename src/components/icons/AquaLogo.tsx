import React from 'react'
import Svg, {Circle} from 'react-native-svg'

import {type Props, useCommonSVGProps} from '#/components/icons/common'

/**
 * Aqua eye mark, option A (Clássico), from aqua-olho.svg.
 * Circles are centered: outer #002BEF, sclera #FFFFFF, iris #7EC8F5, pupil #000000.
 * `fill` and `gradient` stay on the props API so existing callers typecheck;
 * the mark keeps these brand colors.
 */
export const AquaLogo = React.forwardRef<Svg, Props>(
  function AquaLogo(props, ref) {
    const {
      fill: _fill,
      size,
      style,
      gradient: _gradient,
      ...rest
    } = useCommonSVGProps(props)

    return (
      <Svg
        fill="none"
        {...rest}
        ref={ref}
        viewBox="0 0 1100 1100"
        width={size}
        height={size}
        style={[style]}>
        <Circle cx={550} cy={550} r={510} fill="#002BEF" />
        <Circle cx={550} cy={550} r={320} fill="#FFFFFF" />
        <Circle cx={550} cy={550} r={205} fill="#7EC8F5" />
        <Circle cx={550} cy={550} r={96} fill="#000000" />
      </Svg>
    )
  },
)
