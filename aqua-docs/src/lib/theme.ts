import {
  darkDefaultTheme,
  lightDefaultTheme,
  type Theme,
} from '@blocknote/mantine'
import {AQUA} from './brand'

const FONT_FAMILY =
  '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

export const aquaLightTheme: Theme = {
  ...lightDefaultTheme,
  colors: {
    ...lightDefaultTheme.colors,
    editor: {
      text: AQUA.ink,
      background: AQUA.white,
    },
    menu: {
      text: AQUA.ink,
      background: AQUA.white,
    },
    tooltip: {
      text: AQUA.ink,
      background: AQUA.surface,
    },
    hovered: {
      text: AQUA.ink,
      background: AQUA.surface,
    },
    selected: {
      text: AQUA.white,
      background: AQUA.blue,
    },
    disabled: {
      text: AQUA.muted,
      background: AQUA.surface,
    },
    shadow: AQUA.line,
    border: AQUA.line,
    sideMenu: AQUA.muted,
    highlights: {
      ...lightDefaultTheme.colors?.highlights,
      blue: {
        text: AQUA.blue,
        background: AQUA.blueSoft,
      },
    },
  },
  borderRadius: 10,
  fontFamily: FONT_FAMILY,
}

export const aquaDarkTheme: Theme = {
  ...darkDefaultTheme,
  colors: {
    ...darkDefaultTheme.colors,
    editor: {
      text: AQUA.blueSoft,
      background: AQUA.darkBg,
    },
    menu: {
      text: AQUA.blueSoft,
      background: AQUA.darkSurface,
    },
    tooltip: {
      text: AQUA.blueSoft,
      background: AQUA.darkSurface,
    },
    hovered: {
      text: AQUA.blueSoft,
      background: '#24334a',
    },
    selected: {
      text: AQUA.white,
      background: AQUA.blue,
    },
    disabled: {
      text: AQUA.muted,
      background: AQUA.darkSurface,
    },
    shadow: '#0b1119',
    border: '#2b3a4f',
    sideMenu: AQUA.muted,
    highlights: {
      ...darkDefaultTheme.colors?.highlights,
      blue: {
        text: AQUA.blueSoft,
        background: '#0a2fa8',
      },
    },
  },
  borderRadius: 10,
  fontFamily: FONT_FAMILY,
}
