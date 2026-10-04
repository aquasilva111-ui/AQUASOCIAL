/**
 * How a Visionboard looks: background theme, font, pin frame, layout and an
 * optional music link. Stored on the board record; every value is validated
 * on read because repo data is public and writable by any client.
 */
export const BOARD_THEMES = {
  paper: {bg: '#F1E7D8', fg: '#2B2118', label: 'Papel'},
  sky: {bg: '#DCE7F2', fg: '#14263A', label: 'Céu'},
  sage: {bg: '#E4EBDD', fg: '#1F2E1A', label: 'Sálvia'},
  rose: {bg: '#F3D9D2', fg: '#3A1D18', label: 'Rosa'},
  night: {bg: '#1A1712', fg: '#F3E9D8', label: 'Noite'},
  lilac: {bg: '#EDE7F6', fg: '#2A1F44', label: 'Lilás'},
} as const
export type BoardTheme = keyof typeof BOARD_THEMES

export const BOARD_FONTS = {
  modern: {family: undefined, label: 'Moderna'},
  serif: {family: "Georgia, 'Times New Roman', serif", label: 'Serifada'},
  hand: {
    family: "'Segoe Script', 'Bradley Hand', cursive",
    label: 'Manuscrita',
  },
} as const
export type BoardFont = keyof typeof BOARD_FONTS

export const BOARD_FRAMES = ['polaroid', 'clean'] as const
export type BoardFrame = (typeof BOARD_FRAMES)[number]

export const BOARD_LAYOUTS = ['mural', 'grid'] as const
export type BoardLayout = (typeof BOARD_LAYOUTS)[number]

export const DEFAULT_LOOK = {
  theme: 'paper',
  font: 'modern',
  frame: 'polaroid',
  layout: 'mural',
} as const satisfies {
  theme: BoardTheme
  font: BoardFont
  frame: BoardFrame
  layout: BoardLayout
}

const has = <T extends object>(obj: T, key: unknown): key is keyof T =>
  typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key)

export const normalizeTheme = (v: unknown): BoardTheme | undefined =>
  has(BOARD_THEMES, v) ? v : undefined
export const normalizeFont = (v: unknown): BoardFont | undefined =>
  has(BOARD_FONTS, v) ? v : undefined
export const normalizeFrame = (v: unknown): BoardFrame | undefined =>
  (BOARD_FRAMES as readonly unknown[]).includes(v)
    ? (v as BoardFrame)
    : undefined
export const normalizeLayout = (v: unknown): BoardLayout | undefined =>
  (BOARD_LAYOUTS as readonly unknown[]).includes(v)
    ? (v as BoardLayout)
    : undefined

const SPOTIFY_PATH =
  /^\/(?:intl-[a-z]+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

export type MusicEmbed = {
  provider: 'spotify' | 'youtube' | 'soundcloud'
  url: string
  /** Suggested iframe height. */
  height: number
}

/**
 * Maps a Spotify / YouTube / SoundCloud link to a trusted embed URL. Only
 * those hosts are accepted, so the music field can never put an arbitrary
 * page in an iframe.
 */
export function musicEmbed(input: unknown): MusicEmbed | undefined {
  if (typeof input !== 'string' || !input.trim()) return undefined
  let url: URL
  try {
    const raw = input.trim()
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return undefined
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
  const host = url.hostname.toLowerCase().replace(/^www\./, '')

  if (host === 'open.spotify.com') {
    const m = url.pathname.match(SPOTIFY_PATH)
    if (m) {
      return {
        provider: 'spotify',
        url: `https://open.spotify.com/embed/${m[1]}/${m[2]}`,
        height: 152,
      }
    }
  } else if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com'
  ) {
    const id = url.searchParams.get('v') ?? ''
    if (YOUTUBE_ID.test(id)) {
      return {
        provider: 'youtube',
        url: `https://www.youtube-nocookie.com/embed/${id}`,
        height: 220,
      }
    }
  } else if (host === 'youtu.be') {
    const id = url.pathname.replace(/^\//, '')
    if (YOUTUBE_ID.test(id)) {
      return {
        provider: 'youtube',
        url: `https://www.youtube-nocookie.com/embed/${id}`,
        height: 220,
      }
    }
  } else if (host === 'soundcloud.com' && url.pathname.split('/').length >= 3) {
    return {
      provider: 'soundcloud',
      url: `https://w.soundcloud.com/player/?url=${encodeURIComponent(
        `https://soundcloud.com${url.pathname}`,
      )}`,
      height: 166,
    }
  }
  return undefined
}

export type ResolvedLook = {
  bg: string
  fg: string
  fontFamily: string | undefined
  frame: BoardFrame
  layout: BoardLayout
  theme: BoardTheme
  font: BoardFont
}

/** A board's look with the defaults filled in. */
export function resolveLook(board: {
  theme?: BoardTheme
  font?: BoardFont
  frame?: BoardFrame
  layout?: BoardLayout
}): ResolvedLook {
  const theme = board.theme ?? DEFAULT_LOOK.theme
  const font = board.font ?? DEFAULT_LOOK.font
  return {
    bg: BOARD_THEMES[theme].bg,
    fg: BOARD_THEMES[theme].fg,
    fontFamily: BOARD_FONTS[font].family,
    frame: board.frame ?? DEFAULT_LOOK.frame,
    layout: board.layout ?? DEFAULT_LOOK.layout,
    theme,
    font,
  }
}
