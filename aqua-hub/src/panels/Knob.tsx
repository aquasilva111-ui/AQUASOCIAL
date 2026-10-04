import { useId, useRef } from 'react'

/**
 * Rotary knob in the style of audio plugins: a glowing arc for the value, a soft metal body and an LCD
 * readout. Drag up/down to change it (hold Shift for fine steps), scroll, use the arrow keys, double-click
 * to reset. It is a real control: role="slider" with its value for assistive tech.
 */
export function Knob({
  value, min, max, step = 1, onChange, label, format, color = '#ff5a1f', size = 58, defaultValue, bipolar = false, compact = false
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  label?: string
  format?: (v: number) => string
  color?: string
  size?: number
  /** Value to jump back to on double-click (defaults to the centre for bipolar knobs, else `min`). */
  defaultValue?: number
  /** Arc grows from the middle (pan, gain) instead of from the minimum. */
  bipolar?: boolean
  /** Hide the caption (the label stays as the accessible name and tooltip). */
  compact?: boolean
}) {
  const drag = useRef<{ y: number; v: number } | null>(null)
  const uid = useId().replace(/:/g, '')
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v / step) * step))
  const norm = (v: number) => (v - min) / (max - min)
  const START = 135
  const SWEEP = 270
  const ang = (n: number) => ((START + SWEEP * n) * Math.PI) / 180
  const pt = (r: number, n: number) => [50 + r * Math.cos(ang(n)), 50 + r * Math.sin(ang(n))]
  const arc = (a: number, b: number, r = 46) => {
    const [x1, y1] = pt(r, Math.min(a, b))
    const [x2, y2] = pt(r, Math.max(a, b))
    return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${Math.abs(b - a) * SWEEP > 180 ? 1 : 0} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`
  }
  const n = norm(value)
  const from = bipolar ? 0.5 : 0
  const reset = defaultValue ?? (bipolar ? clamp((min + max) / 2) : min)
  const text = format ? format(value) : String(Math.round(value * 100) / 100)

  return (
    <div className="knob" style={{ width: size + 14 }} title={label}>
      <svg
        viewBox="0 0 100 100" width={size} height={size} role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={text}
        style={{ touchAction: 'none', cursor: 'ns-resize', overflow: 'visible' }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { y: e.clientY, v: value }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const per = (max - min) / (e.shiftKey ? 600 : 160) // value per pixel
          onChange(clamp(drag.current.v + (drag.current.y - e.clientY) * per))
        }}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => onChange(reset)}
        onWheel={(e) => onChange(clamp(value - Math.sign(e.deltaY) * step * (e.shiftKey ? 1 : 3)))}
        onKeyDown={(e) => {
          const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0
          if (d) (e.preventDefault(), onChange(clamp(value + d * step * (e.shiftKey ? 5 : 1))))
          if (e.key === 'Home') onChange(min)
          if (e.key === 'End') onChange(max)
        }}
      >
        <defs>
          <linearGradient id={`rim${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fbfbfd" /><stop offset=".28" stopColor="#9c9ca6" /><stop offset=".52" stopColor="#eceef2" /><stop offset=".78" stopColor="#6f6f79" /><stop offset="1" stopColor="#cdcdd4" />
          </linearGradient>
          <radialGradient id={`face${uid}`} cx=".34" cy=".3" r=".9">
            <stop offset="0" stopColor="#ffffff" /><stop offset=".3" stopColor="#d6d7dd" /><stop offset=".68" stopColor="#979aa4" /><stop offset="1" stopColor="#5f616b" />
          </radialGradient>
          <radialGradient id={`cap${uid}`} cx=".4" cy=".35" r=".8">
            <stop offset="0" stopColor="#fff" /><stop offset=".5" stopColor="#bcbdc5" /><stop offset="1" stopColor="#6a6c76" />
          </radialGradient>
        </defs>
        {/* dark plate behind the knob, with the engraved scale */}
        <circle cx="50" cy="50" r="48" fill="#08080a" stroke="#34343b" strokeWidth="1.2" />
        {Array.from({ length: 11 }, (_, i) => {
          const t = i / 10
          const [x1, y1] = pt(i % 5 === 0 ? 38.5 : 40.5, t)
          const [x2, y2] = pt(44.5, t)
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#9a9aa6" strokeWidth={i % 5 === 0 ? 1.8 : 1} strokeLinecap="round" />
        })}
        {Math.abs(n - from) > 0.002 && <path d={arc(from, n, 46.5)} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${color})` }} />}
        {/* the knob itself turns */}
        <g transform={`rotate(${SWEEP * n - 135} 50 50)`}>
          <circle cx="50" cy="50" r="35" fill={`url(#rim${uid})`} stroke="#18181c" strokeWidth="1.2" />
          <circle cx="50" cy="50" r="32.6" fill="none" stroke="#2c2c33" strokeOpacity=".62" strokeWidth="4.6" strokeDasharray="1.55 1.55" />
          <circle cx="50" cy="50" r="28" fill={`url(#face${uid})`} stroke="#44444c" strokeWidth=".8" />
          {[6, 9.5, 13, 16.5, 20, 23.5, 26.5].map((r) => (
            <g key={r}><circle cx="50" cy="50" r={r} fill="none" stroke="#000" strokeOpacity=".16" strokeWidth=".6" /><circle cx="50" cy="50" r={r + 0.7} fill="none" stroke="#fff" strokeOpacity=".4" strokeWidth=".4" /></g>
          ))}
          <line x1="50" y1="38" x2="50" y2="24.5" stroke={color} strokeWidth="3.4" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 2.5px ${color})` }} />
          <line x1="50" y1="38" x2="50" y2="24.5" stroke="#fff" strokeOpacity=".5" strokeWidth=".8" strokeLinecap="round" />
          <circle cx="50" cy="50" r="7.5" fill={`url(#cap${uid})`} stroke="#4a4a52" strokeWidth=".8" />
          <line x1="46.5" y1="50" x2="53.5" y2="50" stroke="#3a3a42" strokeWidth="1.4" strokeLinecap="round" />
        </g>
        <ellipse cx="39" cy="35" rx="15" ry="6.5" transform="rotate(-32 39 35)" fill="#fff" opacity=".22" pointerEvents="none" />
      </svg>
      <div className="knob-lcd" style={{ color, textShadow: `0 0 8px ${color}88` }}>{text}</div>
      {label && !compact && <div className="knob-label">{label}</div>}
    </div>
  )
}
