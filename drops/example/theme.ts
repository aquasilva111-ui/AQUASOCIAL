import { Platform } from 'react-native';

/** Aqua identity: ink black, Aqua blue (#002BEF to #009EFF), and orange for likes. */
export const color = {
  bg: '#000000',
  surface: '#121219',
  raised: '#1B1B25',
  line: 'rgba(255,255,255,0.08)',
  text: '#F4F4F6',
  muted: '#9A9AA8',
  faint: '#5C5C6B',
  aqua: '#1185FE',
  aquaDeep: '#002BEF',
  aquaLight: '#009EFF',
  onAqua: '#FFFFFF',
  violet: '#5B7CFF',
  coral: '#FF5A5F',
  amber: '#FFB547',
  sky: '#4CC9F0',
  like: '#FF7A00',
  glass: 'rgba(10,10,14,0.45)',
  glassStrong: 'rgba(10,10,14,0.72)',
};

export const font = {
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }) as string,
};

export const radius = { sm: 10, md: 16, lg: 22, pill: 999 };

/** Keeps white text readable over bright video. */
export const textShadow = {
  textShadowColor: 'rgba(0,0,0,0.5)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
};

/** Small uppercase section label. */
export const eyebrow = {
  color: '#9A9AA8',
  fontSize: 11,
  fontWeight: '700' as const,
  letterSpacing: 1.4,
  textTransform: 'uppercase' as const,
};
