import {memo, useMemo} from 'react'
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg'

import {type Convention} from './data'
import {generateNetwork} from './network'

/** Relational artwork for a Convenção: always dark so the network reads the same in any theme. */
export const NetworkArt = memo(function NetworkArt({
  convention,
}: {
  convention: Convention
}) {
  const prims = useMemo(
    () => generateNetwork(convention.kind, convention.seed, convention.palette),
    [convention],
  )
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice">
      <Rect width="100" height="100" fill="#05070d" />
      {prims.map((p, i) => {
        if (p.k === 'dot') {
          return (
            <Circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={p.r}
              fill={p.color}
              opacity={p.o}
            />
          )
        }
        if (p.k === 'fill') {
          return <Path key={i} d={p.d} fill={p.color} opacity={p.o} />
        }
        return (
          <Path
            key={i}
            d={p.d}
            stroke={p.color}
            strokeWidth={p.w}
            strokeOpacity={p.o}
            strokeLinecap="round"
            fill="none"
          />
        )
      })}
    </Svg>
  )
})

/** Placeholder media for a news card when there is no image yet. */
export const NewsMediaArt = memo(function NewsMediaArt({
  gradient,
}: {
  gradient: [string, string]
}) {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={gradient[0]} />
          <Stop offset="1" stopColor={gradient[1]} />
        </LinearGradient>
      </Defs>
      <Rect width="100" height="100" fill="url(#g)" />
    </Svg>
  )
})

const DOTS = (() => {
  const out: {x: number; y: number; o: number}[] = []
  const N = 420
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N
    const rr = Math.sqrt(1 - y * y)
    const th = i * 2.399963
    const lon = Math.atan2(Math.sin(th) * rr, Math.cos(th) * rr)
    const lat = Math.asin(y)
    const v =
      Math.sin(lon * 1.7 + 1) * Math.cos(lat * 2.2) +
      0.5 * Math.sin(lon * 3.3 - lat * 2) -
      0.1
    const z = Math.sin(th) * rr
    if (v > 0.25 && z > -0.1)
      out.push({
        x: 50 + Math.cos(th) * rr * 44,
        y: 50 + y * 44,
        o: 0.2 + 0.4 * (z + 0.1),
      })
  }
  return out
})()

/** Small header globe: events + places + Convenções as one connected reality. */
export const MiniGlobe = memo(function MiniGlobe() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="sphere" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#ffffff" />
          <Stop offset="1" stopColor="#dfe3ea" />
        </LinearGradient>
      </Defs>
      <Circle cx="50" cy="50" r="46" fill="url(#sphere)" />
      {DOTS.map((d, i) => (
        <Circle
          key={i}
          cx={d.x}
          cy={d.y}
          r="0.9"
          fill="#586272"
          opacity={d.o}
        />
      ))}
      <Circle cx="38" cy="40" r="2.6" fill="#d9ff3a" />
      <Circle cx="62" cy="58" r="2.2" fill="#d9ff3a" />
      <Circle cx="30" cy="62" r="1.8" fill="#d9ff3a" />
    </Svg>
  )
})
