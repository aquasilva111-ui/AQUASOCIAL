import {useEffect} from 'react'
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, {Circle, G, Path} from 'react-native-svg'

import {web} from '#/alf'
import {useInteractionState} from '#/components/hooks/useInteractionState'
import {type Props, useCommonSVGProps} from '#/components/icons/common'

const AnimatedPath = Animated.createAnimatedComponent(Path)
const AnimatedCircle = Animated.createAnimatedComponent(Circle)
const AnimatedG = Animated.createAnimatedComponent(G)

/**
 * Same silhouette as the app's "video+stream" icon (rounded screen, play
 * triangle, broadcast dot with signal arcs) — see assets/icons/video-stream.png
 * and #/components/icons/LiveVideo, which this reuses the anatomy of.
 */
const SCREEN_PATH =
  'M2 8.2A3.2 3.2 0 0 1 5.2 5h9.6a3.2 3.2 0 0 1 3.2 3.2v7.6a3.2 3.2 0 0 1-3.2 3.2H5.2A3.2 3.2 0 0 1 2 15.8V8.2Z'
const PLAY_PATH = 'M9 9v6l5-3-5-3Z'
const WAVE_SMALL = 'M16.4 6.85a2 2 0 0 1 0 2.5'
const WAVE_LARGE = 'M18.4 5.4a4.6 4.6 0 0 1 0 5.4'

export type ViewIconState = 'idle' | 'hover' | 'video' | 'live' | 'loading'

export interface ViewIconProps extends Props {
  /**
   * `video`/`live` reflect what's being shown; `hover` forces the hover
   * motion (e.g. from a parent's own hover state); `idle` is the resting
   * default. `loading` breathes gently while data is pending.
   */
  state?: ViewIconState
  /** Plays the reveal micro-intro once on mount (screen → play → waves). */
  introOnMount?: boolean
}

const EASE_OUT = Easing.out(Easing.cubic)

/**
 * Animated "VIEW" icon — communicates "something is being watched" and
 * "something may be broadcasting" through the icon's existing parts
 * (screen, play, broadcast waves) rather than swapping icons per state.
 * Respects reduced-motion (renders the settled end-state with no motion).
 */
export function ViewIcon({
  state = 'idle',
  introOnMount = false,
  ...props
}: ViewIconProps) {
  const {fill, size, style, ...rest} = useCommonSVGProps(props)
  const reducedMotion = useReducedMotion()
  const {
    state: hovered,
    onIn: onMouseEnter,
    onOut: onMouseLeave,
  } = useInteractionState()
  const isLive = state === 'live'
  const isLoading = state === 'loading'
  const active = state === 'hover' || hovered

  const screenReveal = useSharedValue(reducedMotion || !introOnMount ? 1 : 0)
  const playReveal = useSharedValue(reducedMotion || !introOnMount ? 1 : 0)
  const waveReveal = useSharedValue(reducedMotion ? (isLive ? 1 : 0) : 0)
  const livePulse = useSharedValue(0)
  const loadingPulse = useSharedValue(0)
  const hoverScale = useSharedValue(1)
  const playShift = useSharedValue(0)

  // Micro-intro: screen fades in, then play reveals just after.
  useEffect(() => {
    if (reducedMotion || !introOnMount) return
    screenReveal.set(withTiming(1, {duration: 260, easing: EASE_OUT}))
    playReveal.set(
      withDelay(180, withTiming(1, {duration: 220, easing: EASE_OUT})),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introOnMount, reducedMotion])

  // Broadcast waves fade in/out with live state (no icon swap).
  useEffect(() => {
    if (reducedMotion) {
      waveReveal.set(isLive ? 1 : 0)
      return
    }
    waveReveal.set(
      withDelay(
        introOnMount ? 380 : 0,
        withTiming(isLive ? 1 : 0, {duration: 260, easing: EASE_OUT}),
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, reducedMotion])

  // Low-frequency, elegant pulse on the waves while live.
  useEffect(() => {
    if (reducedMotion || !isLive) {
      livePulse.set(withTiming(0, {duration: 200}))
      return
    }
    livePulse.set(
      withRepeat(
        withSequence(
          withTiming(1, {duration: 900, easing: Easing.inOut(Easing.sin)}),
          withTiming(0, {duration: 900, easing: Easing.inOut(Easing.sin)}),
        ),
        -1,
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, reducedMotion])

  // Gentle whole-icon breathing while loading.
  useEffect(() => {
    if (reducedMotion || !isLoading) {
      loadingPulse.set(withTiming(0, {duration: 200}))
      return
    }
    loadingPulse.set(
      withRepeat(
        withSequence(
          withTiming(1, {duration: 700, easing: Easing.inOut(Easing.sin)}),
          withTiming(0, {duration: 700, easing: Easing.inOut(Easing.sin)}),
        ),
        -1,
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, reducedMotion])

  // Hover: subtle scale breath + play nudges 1.5px forward.
  useEffect(() => {
    if (reducedMotion) return
    hoverScale.set(
      active
        ? withSequence(
            withTiming(1.03, {duration: 160, easing: EASE_OUT}),
            withTiming(1, {duration: 220, easing: EASE_OUT}),
          )
        : withTiming(1, {duration: 160, easing: EASE_OUT}),
    )
    playShift.set(
      withTiming(active ? 1.5 : 0, {duration: 160, easing: EASE_OUT}),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reducedMotion])

  const svgAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{scale: hoverScale.get()}],
    opacity: 1 - loadingPulse.get() * 0.25,
  }))
  const screenAnimatedProps = useAnimatedProps(() => ({
    opacity: screenReveal.get(),
  }))
  const playAnimatedProps = useAnimatedProps(() => ({
    opacity: playReveal.get(),
    transform: `translate(${playShift.get()}, 0)`,
  }))
  const waveAnimatedProps = useAnimatedProps(() => ({
    opacity: waveReveal.get() * (1 - livePulse.get() * 0.35),
  }))
  const dotAnimatedProps = useAnimatedProps(() => ({
    opacity: 0.6 + waveReveal.get() * 0.4,
    r: 1 + livePulse.get() * 0.25,
  }))

  return (
    <Animated.View
      {...web({onMouseEnter, onMouseLeave})}
      style={[{width: size, height: size}, style, svgAnimatedStyle]}>
      <Svg fill="none" {...rest} viewBox="0 0 24 24" width={size} height={size}>
        <AnimatedPath
          animatedProps={screenAnimatedProps}
          d={SCREEN_PATH}
          stroke={fill}
          strokeWidth={1.6}
        />
        <AnimatedPath
          animatedProps={playAnimatedProps}
          d={PLAY_PATH}
          fill={fill}
        />
        <AnimatedCircle
          animatedProps={dotAnimatedProps}
          cx={18.4}
          cy={7.4}
          fill={fill}
        />
        <AnimatedG animatedProps={waveAnimatedProps}>
          <Path
            d={WAVE_SMALL}
            stroke={fill}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
          <Path
            d={WAVE_LARGE}
            stroke={fill}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </AnimatedG>
      </Svg>
    </Animated.View>
  )
}
