import { createTheme, lightThemePrimitives } from "baseui"
import { AQUA } from "~/lib/brand"

/** Base Web theme with the AQUA identity (blue primary, Inter, soft grays). */
export const aquaTheme = createTheme(
  {
    ...lightThemePrimitives,
    primaryFontFamily: "Inter, system-ui, sans-serif",
    accent: AQUA.blue,
  },
  {
    colors: {
      buttonPrimaryFill: AQUA.blue,
      buttonPrimaryHover: "#0022c2",
      buttonPrimaryActive: "#001a96",
      buttonPrimaryText: AQUA.white,
      primary100: AQUA.surface,
      borderSelected: AQUA.blue,
      linkText: AQUA.blue,
    },
    borders: { radius400: "10px", radius500: "12px" },
  }
)
