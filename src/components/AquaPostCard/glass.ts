import {type StyleProp, type ViewStyle} from 'react-native'

import {web} from '#/alf'

/** Circular control from the glass action bar (38px, fully round). */
export const GLASS_ICON = 38

/**
 * Glass capsule shared by the action buttons, the like count, and the
 * "why am I seeing this" star. Light glass over the photo; a dark glass
 * in dark mode so the icons stay readable.
 */
export function aquaGlass(light: boolean): StyleProp<ViewStyle> {
  return [
    {
      backgroundColor: light ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.72)',
      borderWidth: 1,
      borderColor: light ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.16)',
    },
    web({
      backdropFilter: 'blur(18px) saturate(1.6)',
      boxShadow:
        '0 8px 24px rgba(0,43,239,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
    }),
  ]
}
