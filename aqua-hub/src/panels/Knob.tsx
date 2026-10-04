import { useRef } from 'react'

/**
 * Rotary knob in the style of audio plugins: a glowing arc for the value, a soft metal body and an LCD
 * readout. Drag up/down to change it (hold Shift for fine steps), scroll, use the arrow keys, double-click
 * to reset. It is a real control: role="slider" with its value for assistive tech.
 */
export function Knob({
  value, min, max, step = 1, onChange, label, format, color = '#ff5a1f', size = 58, defaultValue, bipolar = false
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
}) {
  const drag = useRef<{ y: number; v: number } | null>(null)
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v / step) * step))
  const norm = (v: number) => (v - min) / (max - min)
  const START = 135
  const SWEEP = 270
  const ang = (n: number) => ((START + SWEEP * n) * Math.PI) / 180
  const pt = (r: number, n: number) => [50 + r * Math.cos(ang(n)), 50 + r * Math.sin(ang(n))]
  const arc = (a: number, b: number, r = 40) => {
    const [x1, y1] = pt(r, Math.min(a, b))
    const [x2, y2] = pt(r, Math.max(a, b))
    return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${Math.abs(b - a) * SWEEP > 180 ? 1 : 0} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`
  }
  const n = norm(value)
  const from = bipolar ? 0.5 : 0
  const [ix, iy] = pt(26, n)
  const [ox, oy] = pt(34, n)
  const reset = defaultValue ?? (bipolar ? clamp((min + max) / 2) : min)
  const text = format ? format(value) : String(Math.round(value * 100) / 100)

  return (
    <div className="knob" style={{ width: size + 14 }}>
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
          <radialGradient id={`kb-${label}-${size}`} cx="38%" cy="30%" r="80%">
            <stop offset="0" stopColor="#4a4a53" />
            <stop offset="0.55" stopColor="#23232a" />
            <stop offset="1" stopColor="#121216" />
          </radialGradient>
        </defs>
        <path d={arc(0, 1)} fill="none" stroke="#2a2a31" strokeWidth="6" strokeLinecap="round" />
        {Math.abs(n - from) > 0.002 && <path d={arc(from, n)} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 5px ${color})` }} />}
        <circle cx="50" cy="50" r="31" fill={`url(#kb-${label}-${size})`} stroke="#000" strokeWidth="1.5" />
        <circle cx="50" cy="50" r="31" fill="none" stroke="#ffffff22" strokeWidth="1" />
        <line x1={ix} y1={iy} x2={ox} y2={oy} stroke={color} strokeWidth="4" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
      </svg>
      <div className="knob-lcd" style={{ color, textShadow: `0 0 8px ${color}88` }}>{text}</div>
      {label && <div className="knob-label">{label}</div>}
    </div>
  )
}
