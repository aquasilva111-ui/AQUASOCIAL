/**
 * AQUA identity for the Design Core. Values mirror the app (`src/alf/tokens.ts`,
 * `src/components/icons/Logo.tsx`) and `aqua-studio/src/lib/brand.ts`; keep in sync.
 */
export const AQUA = {
  blue: '#002BEF',
  blueHover: '#0022C2',
  blueActive: '#001A96',
  blueSoft: '#E6EBFF',
  sky: '#009EFF',
  orange: '#F04C24',
  ink: '#0F172A',
  muted: '#405168',
  line: '#DCE2EA',
  surface: '#EFF2F6',
  white: '#FFFFFF',
  darkBg: '#151D28',
  darkSurface: '#1C2736'
} as const

export type GradientToken = { id: string; label: string; stops: [number, string][] }

/** Same stops as `gradients` in `src/alf/tokens.ts`. */
export const AQUA_GRADIENTS: GradientToken[] = [
  { id: 'primary', label: 'Aqua', stops: [[0, '#002BEF'], [0.4, '#0057FF'], [0.6, '#0057FF'], [1, '#009EFF']] },
  { id: 'sky', label: 'Céu', stops: [[0, '#002BEF'], [1, '#009EFF']] },
  { id: 'midnight', label: 'Meia-noite', stops: [[0, '#022C5E'], [1, '#4079BC']] },
  { id: 'sunrise', label: 'Amanhecer', stops: [[0, '#4E90AE'], [0.4, '#AEA3AB'], [0.8, '#E6A98F'], [1, '#F3A84C']] },
  { id: 'sunset', label: 'Pôr do sol', stops: [[0, '#6772AF'], [0.6, '#B88BB6'], [1, '#FFA6AC']] },
  { id: 'summer', label: 'Verão', stops: [[0, '#FF6A56'], [0.3, '#FF9156'], [1, '#FFDD87']] }
]

export const AQUA_FONTS = {
  /** Open-license families (OFL), the same set shipped by aqua-studio via @fontsource. */
  body: 'Inter',
  heading: 'Inter',
  families: ['Inter', 'Poppins', 'Montserrat', 'Playfair Display', 'Lora', 'Bebas Neue', 'Pacifico', 'Open Sans', 'Roboto']
} as const

export type DesignFormatId = 'post' | 'story' | 'video' | 'presentation' | 'banner' | 'book_cover'

export const AQUA_FORMATS: Record<DesignFormatId, { label: string; width: number; height: number }> = {
  post: { label: 'Post', width: 1080, height: 1080 },
  story: { label: 'Story', width: 1080, height: 1920 },
  video: { label: 'Vídeo', width: 1920, height: 1080 },
  presentation: { label: 'Apresentação', width: 1920, height: 1080 },
  banner: { label: 'Banner de canal', width: 2560, height: 1440 },
  book_cover: { label: 'Capa de livro', width: 1600, height: 2400 }
}
