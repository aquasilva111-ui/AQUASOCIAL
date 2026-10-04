import {useCallback, useEffect} from 'react'
import {View} from 'react-native'
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, {Circle, Ellipse} from 'react-native-svg'

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse)

const BLINK_MS = 180
const CLOSED = 0.05

/**
 * Aqua logo (an eye). Blinks once on mount and again each time `active`
 * turns true (pass the parent's hovered/pressed state).
 */
export function AquaEyeLogo({
  size = 96,
  active = false,
}: {
  size?: number
  active?: boolean
}) {
  // 1 = open, CLOSED = shut
  const open = useSharedValue(1)

  const blink = useCallback(() => {
    open.set(
      withSequence(
        withTiming(CLOSED, {duration: BLINK_MS}),
        withTiming(1, {duration: BLINK_MS}),
      ),
    )
  }, [open])

  useEffect(() => {
    const id = setTimeout(blink, 300)
    return () => clearTimeout(id)
  }, [blink])

  useEffect(() => {
    if (active) blink()
  }, [active, blink])

  const white = useAnimatedProps(() => ({ry: 320 * open.get()}))
  const iris = useAnimatedProps(() => ({ry: 205 * open.get()}))
  const pupil = useAnimatedProps(() => ({ry: 96 * open.get()}))

  return (
    <View accessible={false}>
      <Svg width={size} height={size} viewBox="0 0 1100 1100">
        <Circle cx={550} cy={550} r={510} fill="#002AF0" />
        <AnimatedEllipse
          cx={550}
          cy={500}
          rx={320}
          fill="#FFFFFF"
          animatedProps={white}
        />
        <AnimatedEllipse
          cx={550}
          cy={500}
          rx={205}
          fill="#00A0FF"
          animatedProps={iris}
        />
        <AnimatedEllipse
          cx={550}
          cy={500}
          rx={96}
          fill="#000000"
          animatedProps={pupil}
        />
      </Svg>
    </View>
  )
}
