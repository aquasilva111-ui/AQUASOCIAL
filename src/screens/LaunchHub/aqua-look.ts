/**
 * Visual tokens for the "Publicar em todas" screen, following Aquarela's
 * mockup (launch-hub-publicar-em-todas.html). Colors mirror
 * `aqua-design-core/src/brand/tokens.ts` (AQUA) and `src/alf/tokens.ts`
 * (gradients); keep them in sync.
 */
import {type ViewStyle} from 'react-native'

import {web} from '#/alf'

export const AQUA = {
  blue: '#002BEF',
  blueHover: '#0022C2',
  blueSoft: '#E6EBFF',
  sky: '#009EFF',
  mid: '#0057FF',
  orange: '#F04C24',
  ink: '#0F172A',
  muted: '#405168',
  ok: '#12A150',
  tile: '#0A0A0B',
} as const

/** Page background (light): the Aqua sky. */
export const SKY_GRADIENT = ['#9fd0f3', '#c4e3f8', '#eaf5fd'] as const
/** Progress bar: Aqua "sky" gradient (alf `gradients.sky`). */
export const BAR_GRADIENT = [AQUA.blue, AQUA.sky] as const

export type AssistTone = 'pend' | 'open' | 'ok' | 'err' | 'skip'

export function toneColors(tone: AssistTone, dark: boolean) {
  switch (tone) {
    case 'open':
      return {
        fg: dark ? '#7f9bff' : AQUA.blue,
        bg: dark ? 'rgba(0,43,239,0.22)' : AQUA.blueSoft,
      }
    case 'ok':
      return {fg: dark ? '#3ccf7c' : AQUA.ok, bg: 'rgba(18,161,80,0.12)'}
    case 'err':
      return {fg: AQUA.orange, bg: 'rgba(240,76,36,0.12)'}
    case 'skip':
    case 'pend':
      return {
        fg: dark ? '#a3b0c2' : '#55657d',
        bg: dark ? 'rgba(255,255,255,0.08)' : 'rgba(64,81,104,0.10)',
      }
  }
}

/** `.glass`: translucent card over the sky (fallback when no native Liquid Glass). */
export function glass(dark: boolean): ViewStyle {
  return {
    backgroundColor: dark ? 'rgba(28,39,54,0.62)' : 'rgba(255,255,255,0.62)',
    borderWidth: 1,
    borderColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.75)',
    ...(web({
      backdropFilter: 'saturate(160%) blur(22px)',
      WebkitBackdropFilter: 'saturate(160%) blur(22px)',
      boxShadow: dark
        ? '0 10px 30px rgba(0,0,0,0.35)'
        : '0 1px 1px rgba(15,23,42,0.04), 0 10px 30px rgba(15,40,90,0.10)',
    }) as ViewStyle),
  }
}

/** `.row` / `.card` / `.post`: the stronger inner surface. */
export function strong(dark: boolean): ViewStyle {
  return {
    backgroundColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)',
  }
}

export const RADIUS = {section: 22, card: 18, row: 16, tile: 11} as const
