import {View} from 'react-native'
import Svg, {Circle} from 'react-native-svg'

import {atoms as a, useTheme} from '#/alf'

const UNSEEN = '#7C3AED'
const MAX_SEGMENTS = 12
const STROKE = 3

/**
 * Ring around an avatar with one arc per story (unseen arcs are coloured,
 * seen ones are dimmed), like Instagram's. Beyond MAX_SEGMENTS stories it
 * falls back to a single arc so it never turns into noise.
 */
/** The arcs only (absolutely positioned), so a ring can sit around any avatar. */
export function RingArcs({size, seen}: {size: number; seen: boolean[]}) {
  const t = useTheme()
  const count = seen.length
  if (count === 0) return null
  const segments = count > MAX_SEGMENTS ? [seen.every(Boolean)] : seen
  const r = (size - STROKE) / 2
  const c = 2 * Math.PI * r
  const gap = segments.length > 1 ? 4 : 0
  const arc = c / segments.length
  return (
    <Svg
      width={size}
      height={size}
      style={a.absolute}
      accessibilityElementsHidden
      pointerEvents="none">
      {segments.map((isSeen, i) => (
        <Circle
          key={i}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={isSeen ? t.atoms.border_contrast_low.borderColor : UNSEEN}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${Math.max(1, arc - gap)} ${c}`}
          strokeDashoffset={-(i * arc)}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      ))}
    </Svg>
  )
}

export function StoryRing({
  size,
  seen,
  children,
}: {
  size: number
  /** One flag per story, oldest first: true when already seen. */
  seen: boolean[]
  children: React.ReactNode
}) {
  const inner = size - STROKE * 2 - 4
  return (
    <View
      style={[a.align_center, a.justify_center, {width: size, height: size}]}>
      <RingArcs size={size} seen={seen} />
      <View
        style={[
          a.rounded_full,
          a.overflow_hidden,
          {width: inner, height: inner},
        ]}>
        {children}
      </View>
    </View>
  )
}
