import Svg, {Circle} from 'react-native-svg'

export const LAUNCH_BLUE = '#002bef'
export const CREATIVE_ORANGE = '#f04c24'

/**
 * Launch Hub mark: the concentric "lens" from the AQUA Launch artwork.
 * Full color by design, so it doesn't take a fill.
 */
export function LaunchMark({size = 24}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <Circle cx={50} cy={50} r={50} fill={LAUNCH_BLUE} />
      <Circle cx={50} cy={49.7} r={28.7} fill="#ffffff" />
      <Circle cx={50} cy={48.6} r={20.4} fill="#009eff" />
      <Circle cx={50} cy={48.6} r={10.4} fill="#000000" />
    </Svg>
  )
}
