import inter_400 from "@fonts/inter/files/inter-latin-400-normal.woff2?url"
import inter_700 from "@fonts/inter/files/inter-latin-700-normal.woff2?url"
import poppins_400 from "@fonts/poppins/files/poppins-latin-400-normal.woff2?url"
import poppins_700 from "@fonts/poppins/files/poppins-latin-700-normal.woff2?url"
import montserrat_400 from "@fonts/montserrat/files/montserrat-latin-400-normal.woff2?url"
import montserrat_700 from "@fonts/montserrat/files/montserrat-latin-700-normal.woff2?url"
import roboto_400 from "@fonts/roboto/files/roboto-latin-400-normal.woff2?url"
import roboto_700 from "@fonts/roboto/files/roboto-latin-700-normal.woff2?url"
import open_sans_400 from "@fonts/open-sans/files/open-sans-latin-400-normal.woff2?url"
import open_sans_700 from "@fonts/open-sans/files/open-sans-latin-700-normal.woff2?url"
import playfair_display_400 from "@fonts/playfair-display/files/playfair-display-latin-400-normal.woff2?url"
import playfair_display_700 from "@fonts/playfair-display/files/playfair-display-latin-700-normal.woff2?url"
import lora_400 from "@fonts/lora/files/lora-latin-400-normal.woff2?url"
import lora_700 from "@fonts/lora/files/lora-latin-700-normal.woff2?url"
import bebas_neue_400 from "@fonts/bebas-neue/files/bebas-neue-latin-400-normal.woff2?url"
import pacifico_400 from "@fonts/pacifico/files/pacifico-latin-400-normal.woff2?url"

/** Open-license (OFL / Apache) families bundled with the Studio via @fontsource. */
export const STUDIO_FONTS = [
  { id: "inter-400", family: "Inter", full_name: "Inter Regular", postscript_name: "Inter-Regular", style: "Inter-Regular", url: inter_400, category: "sans-serif" },
  { id: "inter-700", family: "Inter", full_name: "Inter Bold", postscript_name: "Inter-Bold", style: "Inter-Bold", url: inter_700, category: "sans-serif" },
  { id: "poppins-400", family: "Poppins", full_name: "Poppins Regular", postscript_name: "Poppins-Regular", style: "Poppins-Regular", url: poppins_400, category: "sans-serif" },
  { id: "poppins-700", family: "Poppins", full_name: "Poppins Bold", postscript_name: "Poppins-Bold", style: "Poppins-Bold", url: poppins_700, category: "sans-serif" },
  { id: "montserrat-400", family: "Montserrat", full_name: "Montserrat Regular", postscript_name: "Montserrat-Regular", style: "Montserrat-Regular", url: montserrat_400, category: "sans-serif" },
  { id: "montserrat-700", family: "Montserrat", full_name: "Montserrat Bold", postscript_name: "Montserrat-Bold", style: "Montserrat-Bold", url: montserrat_700, category: "sans-serif" },
  { id: "roboto-400", family: "Roboto", full_name: "Roboto Regular", postscript_name: "Roboto-Regular", style: "Roboto-Regular", url: roboto_400, category: "sans-serif" },
  { id: "roboto-700", family: "Roboto", full_name: "Roboto Bold", postscript_name: "Roboto-Bold", style: "Roboto-Bold", url: roboto_700, category: "sans-serif" },
  { id: "open-sans-400", family: "Open Sans", full_name: "Open Sans Regular", postscript_name: "OpenSans-Regular", style: "OpenSans-Regular", url: open_sans_400, category: "sans-serif" },
  { id: "open-sans-700", family: "Open Sans", full_name: "Open Sans Bold", postscript_name: "OpenSans-Bold", style: "OpenSans-Bold", url: open_sans_700, category: "sans-serif" },
  { id: "playfair-display-400", family: "Playfair Display", full_name: "Playfair Display Regular", postscript_name: "PlayfairDisplay-Regular", style: "PlayfairDisplay-Regular", url: playfair_display_400, category: "serif" },
  { id: "playfair-display-700", family: "Playfair Display", full_name: "Playfair Display Bold", postscript_name: "PlayfairDisplay-Bold", style: "PlayfairDisplay-Bold", url: playfair_display_700, category: "serif" },
  { id: "lora-400", family: "Lora", full_name: "Lora Regular", postscript_name: "Lora-Regular", style: "Lora-Regular", url: lora_400, category: "serif" },
  { id: "lora-700", family: "Lora", full_name: "Lora Bold", postscript_name: "Lora-Bold", style: "Lora-Bold", url: lora_700, category: "serif" },
  { id: "bebas-neue-400", family: "Bebas Neue", full_name: "Bebas Neue Regular", postscript_name: "BebasNeue-Regular", style: "BebasNeue-Regular", url: bebas_neue_400, category: "display" },
  { id: "pacifico-400", family: "Pacifico", full_name: "Pacifico Regular", postscript_name: "Pacifico-Regular", style: "Pacifico-Regular", url: pacifico_400, category: "handwriting" },
]

/** Loaded at startup so the interface and new text use Inter. */
export const editorFonts = [
  { name: "Inter", url: inter_400, options: { style: "normal", weight: 400 } },
  { name: "Inter", url: inter_700, options: { style: "normal", weight: 700 } },
]

export const fontStyleLabels = {
  "100": {
    id: 0,
    label: "Thin",
  },
  "100italic": {
    id: 1,
    label: "Thin Italic",
  },
  "200": {
    id: 2,
    label: "ExtraLight",
  },
  "200italic": {
    id: 3,
    label: "ExtraLight Italic",
  },
  "300": {
    id: 4,
    label: "Light",
  },
  "300italic": {
    id: 5,
    label: "Light Italic",
  },
  regular: {
    id: 6,
    label: "Regular",
  },
  italic: {
    id: 7,
    label: "Regular Italic",
  },
  "500": {
    id: 8,
    label: "Medium",
  },
  "500italic": {
    id: 9,
    label: "Medium Italic",
  },
  "600": {
    id: 10,
    label: "SemiBold",
  },
  "600italic": {
    id: 11,
    label: "SemiBold Italic",
  },
  "700": {
    id: 12,
    label: "Bold",
  },
  "700italic": {
    id: 13,
    label: "Bold Italic",
  },
  "800": {
    id: 14,
    label: "ExtraBold",
  },
  "800italic": {
    id: 15,
    label: "ExtraBold Italic",
  },
  "900": {
    id: 16,
    label: "Black",
  },
  "900italic": {
    id: 17,
    label: "Black Italic",
  },
}
