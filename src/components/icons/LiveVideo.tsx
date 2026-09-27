import React from 'react'
import Svg, {Circle, Path} from 'react-native-svg'

import {type Props, useCommonSVGProps} from '#/components/icons/common'

export const LiveVideo_Stroke2_Corner0_Rounded = React.forwardRef<Svg, Props>(
  function LiveVideoImpl(props, ref) {
    const {fill, size, style, ...rest} = useCommonSVGProps(props)

    return (
      <Svg
        fill="none"
        {...rest}
        ref={ref}
        viewBox="0 0 24 24"
        width={size}
        height={size}
        style={[style]}>
        <Path
          d="M4 7.5A2.5 2.5 0 0 1 6.5 5h8A2.5 2.5 0 0 1 17 7.5v1.1"
          stroke={fill}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M20 13v3.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9"
          stroke={fill}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path d="M10 9.5v5l4-2.5-4-2.5Z" fill={fill} />
        <Circle cx={18} cy={7.5} r={3.5} fill={fill} />
        <Circle cx={18} cy={7.5} r={0.9} fill="#fff" />
        <Path
          d="M16.55 6.25a2 2 0 0 0 0 2.5M19.45 6.25a2 2 0 0 1 0 2.5"
          stroke="#fff"
          strokeWidth={0.75}
          strokeLinecap="round"
        />
      </Svg>
    )
  },
)
