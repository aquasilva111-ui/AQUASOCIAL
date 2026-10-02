import { AQUA, AQUA_FONTS, AQUA_GRADIENTS, type GradientToken } from './tokens'

/** A brand kit: what the editor offers by default and what a user's own kit overrides. */
export interface BrandKit {
  name: string
  colors: string[]
  gradients: GradientToken[]
  headingFont: string
  bodyFont: string
  fonts: readonly string[]
  logoUrl?: string
}

export const AQUA_BRAND_KIT: BrandKit = {
  name: 'AQUA',
  colors: [AQUA.blue, AQUA.sky, AQUA.orange, AQUA.ink, AQUA.muted, AQUA.surface, AQUA.white],
  gradients: AQUA_GRADIENTS,
  headingFont: AQUA_FONTS.heading,
  bodyFont: AQUA_FONTS.body,
  fonts: AQUA_FONTS.families
}

/** A user's kit replaces colours/fonts it defines and keeps AQUA's for the rest. */
export function mergeBrandKit(custom: Partial<BrandKit> | undefined): BrandKit {
  if (!custom) return AQUA_BRAND_KIT
  return {
    ...AQUA_BRAND_KIT,
    ...custom,
    colors: custom.colors?.length ? custom.colors : AQUA_BRAND_KIT.colors,
    gradients: custom.gradients?.length ? custom.gradients : AQUA_BRAND_KIT.gradients,
    fonts: custom.fonts?.length ? custom.fonts : AQUA_BRAND_KIT.fonts
  }
}
