import type { ReactNode } from 'react'

import type { ToolId } from './route'
import type { RulerIcon } from './tools'

const svg = (size: number, body: ReactNode, view = 24) => (
  <svg viewBox={`0 0 ${view} ${view}`} width={size} height={size} aria-hidden="true" focusable="false">
    {body}
  </svg>
)

/** Four-point star. Always AQUA blue — it only marks an AI action. */
export function Star4({ size = 18 }: { size?: number }) {
  return svg(size, <path fill="#002BEF" d="M12 1.2 14.55 9.45 22.8 12 14.55 14.55 12 22.8 9.45 14.55 1.2 12 9.45 9.45Z" />)
}

/** Blue disc, white field, black pupil, iris ring. */
export function CreateEye({ size = 28 }: { size?: number }) {
  return svg(
    size,
    <>
      <circle cx="16" cy="16" r="16" fill="#002BEF" />
      <circle cx="16" cy="16" r="7.2" fill="#fff" />
      <circle cx="16" cy="16" r="4.1" fill="none" stroke="#7EC8F5" strokeWidth="1.7" />
      <circle cx="16" cy="16" r="2.15" fill="#0F172A" />
    </>,
    32
  )
}

/** Eye drawn on top of an already-blue (or iris) disc. */
export function CreateEyeOnDisc({ size = 28 }: { size?: number }) {
  return svg(
    size,
    <>
      <circle cx="16" cy="16" r="7.4" fill="#fff" />
      <circle cx="16" cy="16" r="4.2" fill="none" stroke="#7EC8F5" strokeWidth="1.7" />
      <circle cx="16" cy="16" r="2.15" fill="#0F172A" />
    </>,
    32
  )
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
}

export function HomeIcon({ size = 24 }: { size?: number }) {
  return svg(size, <path {...stroke} d="M4 11.2 12 4l8 7.2V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />)
}

export function SearchIcon({ size = 24 }: { size?: number }) {
  return svg(
    size,
    <>
      <circle {...stroke} cx="11" cy="11" r="6.2" />
      <path {...stroke} d="m16 16 4 4" />
    </>
  )
}

export function ProfileIcon({ size = 24 }: { size?: number }) {
  return svg(
    size,
    <>
      <circle {...stroke} cx="12" cy="8" r="3.2" />
      <path {...stroke} d="M5.2 19.2c1.4-3 3.8-4.4 6.8-4.4s5.4 1.4 6.8 4.4" />
    </>
  )
}

export function MoonIcon({ size = 22 }: { size?: number }) {
  return svg(size, <path {...stroke} d="M16.5 14.2A6.2 6.2 0 0 1 9.8 6.2 6.4 6.4 0 1 0 16.5 14.2z" />)
}

export function SunIcon({ size = 22 }: { size?: number }) {
  return svg(
    size,
    <>
      <circle {...stroke} cx="12" cy="12" r="3.4" />
      <path {...stroke} d="M12 3.2v1.8M12 19v1.8M3.2 12h1.8M19 12h1.8M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M18.4 5.6l-1.3 1.3M6.9 17.1l-1.3 1.3" />
    </>
  )
}

export function UndoIcon({ size = 22 }: { size?: number }) {
  return svg(size, <path {...stroke} d="M9 14 4 9l5-5M4 9h9.2a5.8 5.8 0 1 1 0 11.6H11" />)
}

export function RedoIcon({ size = 22 }: { size?: number }) {
  return svg(size, <path {...stroke} d="m15 14 5-5-5-5M20 9h-9.2a5.8 5.8 0 1 0 0 11.6H13" />)
}

const RULER: Record<RulerIcon, ReactNode> = {
  cursor: <path fill="currentColor" d="M5.2 3.4 19.2 10a.8.8 0 0 1-.05 1.45l-5.5 2 .2.2 2 5.5a.8.8 0 0 1-1.45.05L3.4 5.2a.8.8 0 0 1 .9-.9z" />,
  type: <path {...stroke} d="M8 5h8M12 5v14M9 19h6" />,
  rect: <rect {...stroke} x="4.5" y="6" width="15" height="12" rx="2" />,
  ellipse: <ellipse {...stroke} cx="12" cy="12" rx="7.5" ry="5.5" />,
  image: (
    <>
      <rect {...stroke} x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.4" fill="currentColor" />
      <path {...stroke} d="m7 16 3.2-3.2a1 1 0 0 1 1.4 0L16 17" />
    </>
  ),
  star: <Star4 size={22} />,
  title: <path {...stroke} d="M6 6h12M8 6v12M16 6v12M6 12h12" />,
  list: <path {...stroke} d="M9 7h10M9 12h10M9 17h10M5 7h.01M5 12h.01M5 17h.01" />,
  quote: <path {...stroke} d="M8 8c-2 1-3 2.6-3 4.5V17h5v-5H8.2M16 8c-2 1-3 2.6-3 4.5V17h5v-5h-1.8" />,
  present: (
    <>
      <rect {...stroke} x="3.5" y="5" width="17" height="11" rx="2" />
      <path {...stroke} d="M8 20h8M10 16.2 12 20l2-3.8" />
    </>
  ),
  formula: <path {...stroke} d="M7 6h10M9 6l4 12h4M8 14h5" />,
  filter: <path {...stroke} d="M4 6h16l-6 7.2V19l-4-2v-3.8z" />,
  chart: <path {...stroke} d="M5 19V10M12 19V5M19 19v-7" />,
  play: <path fill="currentColor" d="M8 5.4v13.2a1 1 0 0 0 1.52.85l10.2-6.6a1 1 0 0 0 0-1.7L9.52 4.55A1 1 0 0 0 8 5.4z" />,
  pencil: <path {...stroke} d="m4 20 1.1-4.2L16.2 4.7a1.6 1.6 0 0 1 2.2 0l.9.9a1.6 1.6 0 0 1 0 2.2L8.2 18.9 4 20z" />,
  note: (
    <>
      <path {...stroke} d="M9 17.5V6.5l9-2v11" />
      <circle cx="7.2" cy="17.5" r="2.2" fill="currentColor" />
      <circle cx="16" cy="15.5" r="2.2" fill="currentColor" />
    </>
  ),
  wave: <path {...stroke} d="M3 12h2l2-5 2 10 2-7 2 4 2-2h4" />,
  cut: (
    <>
      <circle {...stroke} cx="7" cy="7" r="2.3" />
      <circle {...stroke} cx="7" cy="17" r="2.3" />
      <path {...stroke} d="m9 8.4 11 8.2M9 15.6 20 7.4" />
    </>
  ),
  fade: <path {...stroke} d="M4 18 20 6M4 18h16" />,
  faders: (
    <>
      <path {...stroke} d="M7 4v16M12 4v16M17 4v16" />
      <circle cx="7" cy="9" r="2" fill="currentColor" />
      <circle cx="12" cy="15" r="2" fill="currentColor" />
      <circle cx="17" cy="8" r="2" fill="currentColor" />
    </>
  ),
  bars: <path {...stroke} d="M5 19V11M10 19V7M15 19v-5M20 19V9" />,
  line: <path {...stroke} d="M4 16 9 10l4 3 7-8" />,
  pie: (
    <>
      <path {...stroke} d="M12 4a8 8 0 1 0 8 8h-8z" />
      <path {...stroke} d="M12 12 17.5 6.5" />
    </>
  ),
  orbit: (
    <>
      <circle {...stroke} cx="12" cy="12" r="3" />
      <ellipse {...stroke} cx="12" cy="12" rx="9" ry="4.2" transform="rotate(-28 12 12)" />
    </>
  ),
  cube: <path {...stroke} d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12 4 7.5" />,
  light: (
    <>
      <circle {...stroke} cx="12" cy="12" r="3.2" />
      <path {...stroke} d="M12 4V2.8M12 21.2V20M4 12H2.8M21.2 12H20M6.2 6.2 5.3 5.3M18.7 18.7l-.9-.9M17.8 6.2l.9-.9M5.3 18.7l.9-.9" />
    </>
  )
}

export function RulerGlyph({ icon, size = 22 }: { icon: RulerIcon; size?: number }) {
  if (icon === 'star') return <Star4 size={size} />
  return svg(size, RULER[icon])
}

function mark(body: ReactNode) {
  return (
    <>
      <rect width="56" height="56" rx="16" fill="#0F172A" />
      {body}
    </>
  )
}

const white = { fill: 'none', stroke: '#fff', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const MARKS: Record<ToolId, ReactNode> = {
  design: mark(
    <>
      <rect x="16" y="16" width="24" height="24" rx="4" {...white} />
      <path {...white} d="M30 16v-4M40 26h4M30 40v4M16 26h-4" />
      <circle cx="30" cy="28" r="2" fill="#fff" />
    </>
  ),
  write: mark(
    <>
      <path {...white} d="M18 14h16a3 3 0 0 1 3 3v22a3 3 0 0 1-3 3H18a3 3 0 0 1-3-3V17a3 3 0 0 1 3-3z" />
      <path {...white} d="M21 24h14M21 30h14M21 36h8" />
    </>
  ),
  slides: mark(
    <>
      <rect x="14" y="16" width="22" height="16" rx="2" {...white} />
      <path {...white} d="M28 32v6M24 38h8" />
      <path fill="#fff" d="m23 21 6 3.2-6 3.2z" />
    </>
  ),
  sheet: mark(
    <>
      <rect x="14" y="14" width="28" height="28" rx="3" {...white} />
      <path {...white} d="M14 24h28M14 32h28M24 14v28M34 14v28" />
    </>
  ),
  music: mark(
    <>
      <path {...white} d="M24 40V18l16-3.5V36" />
      <circle cx="20.5" cy="40" r="4" fill="#fff" />
      <circle cx="36" cy="36" r="4" fill="#fff" />
    </>
  ),
  mix: mark(
    <>
      <path {...white} d="M20 16v24M28 16v24M36 16v24" />
      <rect x="17" y="24" width="6" height="5" rx="1.2" fill="#fff" />
      <rect x="25" y="20" width="6" height="5" rx="1.2" fill="#fff" />
      <rect x="33" y="28" width="6" height="5" rx="1.2" fill="#fff" />
    </>
  ),
  audio: mark(<path {...white} d="M12 28h4l3-8 4 16 4-12 3 6 3-2h11" />),
  video: mark(
    <>
      <rect x="12" y="16" width="32" height="24" rx="4" {...white} />
      <path fill="#fff" d="m24 22 10 6-10 6z" />
    </>
  ),
  chart: mark(
    <>
      <path {...white} d="M16 42V18M16 42h26" />
      <path fill="#fff" d="M20 42V30h5v12zM28 42V22h5v20zM36 42V26h5v16z" />
    </>
  ),
  cube: mark(<path {...white} d="m28 12 14 8v14l-14 8-14-8V20zM28 26l14-8M28 26v16M28 26 14 18" />)
}

export function ToolMark({ id }: { id: ToolId }) {
  return (
    <svg className="tool-mark" viewBox="0 0 56 56" width="56" height="56" aria-hidden="true" focusable="false">
      {MARKS[id]}
    </svg>
  )
}
