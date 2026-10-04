import type { ButtonHTMLAttributes, ReactNode } from 'react'

/** One consistent icon set (24×24, drawn with currentColor) so no control depends on emoji or font glyphs. */
const PATHS: Record<string, ReactNode> = {
  play: <path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2z" fill="currentColor" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2.2" fill="currentColor" />,
  pause: <><rect x="6.5" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" /><rect x="13.9" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" /></>,
  toStart: <><rect x="5" y="5" width="2.4" height="14" rx="1" fill="currentColor" /><path d="M19.5 6.2v11.6a.9.9 0 0 1-1.4.74l-8.6-5.8a.9.9 0 0 1 0-1.48l8.6-5.8a.9.9 0 0 1 1.4.74z" fill="currentColor" /></>,
  rewind: <path d="M11 6 5 12l6 6M19 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  forward: <path d="m13 6 6 6-6 6M5 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  undo: <path d="M9 14 4 9l5-5M4 9h9.5a6 6 0 0 1 0 12H11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  redo: <path d="m15 14 5-5-5-5M20 9h-9.5a6 6 0 0 0 0 12H13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  cursor: <path d="M5.5 3.6 19 10.2a.7.7 0 0 1-.05 1.3l-5.3 1.9a.7.7 0 0 0-.43.43l-1.9 5.3a.7.7 0 0 1-1.3.05L3.6 5.5a.7.7 0 0 1 .9-.9z" fill="currentColor" />,
  ibeam: <path d="M9 4h6M9 20h6M12 4v16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  scissors: <><circle cx="6.5" cy="6.5" r="2.7" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="6.5" cy="17.5" r="2.7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M8.7 8 20 18M8.7 16 20 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
  plus: <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  minus: <path d="M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  close: <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  grip: <>{[8, 12, 16].flatMap((y) => [9, 15].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.35" fill="currentColor" />))}</>,
  trash: <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.9 12.2a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.5 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
  record: <circle cx="12" cy="12" r="6.5" fill="currentColor" />,
  download: <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2.2" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M15.5 8.5V6.7A2.2 2.2 0 0 0 13.3 4.5H6.7A2.2 2.2 0 0 0 4.5 6.7v6.6a2.2 2.2 0 0 0 2.2 2.2h1.8" fill="none" stroke="currentColor" strokeWidth="2" /></>,
  edit: <path d="m4 20 1-4.2L16.4 4.4a1.6 1.6 0 0 1 2.2 0l1 1a1.6 1.6 0 0 1 0 2.2L8.2 19 4 20zM14.5 6.5l3 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  chart: <path d="M5 20V10M12 20V4M19 20v-7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />,
  print: <><path d="M7 9V4h10v5M7 17H5.5A1.5 1.5 0 0 1 4 15.5v-5A1.5 1.5 0 0 1 5.5 9h13a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><rect x="7" y="14" width="10" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="2" /></>,
  home: <path d="M4 11.2 12 4l8 7.2V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  list: <path d="M8 6.5h11M8 12h11M8 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />,
  clock: <><circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></>,
  wand: <path d="m5 19 9-9M13 4l.8 2.2L16 7l-2.2.8L13 10l-.8-2.2L10 7l2.2-.8zM18.5 12l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
}

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" style={{ display: 'block', flex: 'none' }}>{PATHS[name]}</svg>
}

type Variant = 'round' | 'tool' | 'play' | 'ghost' | 'pill' | 'primary' | 'danger'

/**
 * A real icon button: always has an accessible name (`label`, also the tooltip), keeps keyboard focus
 * visible, and has hover, pressed, active and disabled states defined in one place (`.ibtn` in style.css).
 */
export function IconButton({
  icon, label, variant = 'round', active = false, size, text, ...rest
}: { icon: IconName; label: string; variant?: Variant; active?: boolean; size?: number; text?: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  const px = size ?? (variant === 'play' ? 26 : variant === 'tool' ? 18 : 16)
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={active || undefined} {...rest} className={`ibtn ${variant}${active ? ' on' : ''}${rest.className ? ' ' + rest.className : ''}`}>
      <Icon name={icon} size={px} />
      {text && <span>{text}</span>}
    </button>
  )
}
