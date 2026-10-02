import { nanoid } from "nanoid"
import { STUDIO_FONTS } from "./fonts"
import { AQUA } from "~/lib/brand"
import { STUDIO_FORMATS } from "~/lib/formats"

export const SecondLevelMenus = ["FontFamily"]
export const FirstLevelMenus = ["Background"]

export enum SubMenuType {
  FONT_FAMILY = "FontFamily",
  BACKGROUND = "Background",
  COLOR = "Color",
  ANIMATIONS = "Animations",
  EFFECTS = "Effects",
}

export const FONT_SIZES = [6, 8, 10, 12, 16, 18, 20, 24, 30, 36, 48, 60, 72, 96, 120, 144, 192, 240]

export const SAMPLE_FONTS = STUDIO_FONTS

export const gradients = [
  { angle: 0, colors: [AQUA.blue, "#12c2a5"] },
  { angle: 0, colors: ["#0b2a6b", AQUA.blue] },
  { angle: 0, colors: [AQUA.orange, "#ffb347"] },
  { angle: 0, colors: ["#2b2a5a", "#7b6cf6"] },
  { angle: 0, colors: ["#6b2a5c", "#e0607e"] },
  { angle: 0, colors: ["#0a5c63", "#12c2a5"] },
]

const svgPreview = (bg: string, fg: string, headline: string, w: number, h: number) => {
  const size = Math.round(Math.min(w, h) / 9)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${bg}"/><text x="${w * 0.08}" y="${h * 0.86}" font-family="Inter, sans-serif" font-weight="700" font-size="${size}" fill="${fg}">${headline}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export const textLayer = (o: {
  text: string
  left: number
  top: number
  width: number
  fontSize: number
  fill: string
  bold?: boolean
  align?: string
}) => {
  const f = STUDIO_FONTS.find((x) => x.family === "Inter" && x.postscript_name.endsWith(o.bold ? "Bold" : "Regular"))!
  return {
    id: nanoid(),
    type: "StaticText",
    name: "Texto",
    left: o.left,
    top: o.top,
    width: o.width,
    text: o.text,
    fontSize: o.fontSize,
    fontFamily: f.postscript_name,
    fontURL: f.url,
    fontStyle: "normal",
    fontWeight: o.bold ? "bold" : "normal",
    textAlign: o.align ?? "left",
    fill: o.fill,
    charSpacing: 0,
    lineHeight: 1.1,
    metadata: {},
  }
}

type StarterDef = { id: string; name: string; format: string; bg: string; fg: string; headline: string; subline: string }

/** Keep ids in sync with TEMPLATES in the app (src/lib/creative-hub/model.ts). */
const STARTERS: StarterDef[] = [
  { id: "chapter-announce", name: "Anúncio de capítulo", format: "post", bg: "#0b2a6b", fg: "#ffffff", headline: "Novo capítulo no ar", subline: "Título do livro · Cap. 1" },
  { id: "book-quote", name: "Citação de livro", format: "post", bg: "#f3e9dc", fg: "#2b2118", headline: "“Uma frase que ficou.”", subline: "Título do livro" },
  { id: "book-cover", name: "Capa simples", format: "book_cover", bg: "#8a3b0b", fg: "#ffffff", headline: "Título do livro", subline: "Nome da autora" },
  { id: "countdown", name: "Contagem regressiva", format: "story", bg: "#f04c24", fg: "#ffffff", headline: "Última chance", subline: "Sexta, 20h" },
  { id: "live-notice", name: "Aviso de live", format: "banner", bg: "#2b2a5a", fg: "#ffffff", headline: "Live hoje às 21h", subline: "Venha conversar" },
  { id: "brand-launch", name: "Lançamento de marca", format: "post", bg: "#0a5c63", fg: "#ffffff", headline: "Nova marca", subline: "Conheça o projeto" },
  { id: "product-drop", name: "Novidade do Shop", format: "story", bg: "#6b2a5c", fg: "#ffffff", headline: "Acabou de chegar", subline: "Só no Aqua Shop" },
  { id: "thanks", name: "Obrigado pelos 1.000", format: "post", bg: AQUA.blue, fg: "#ffffff", headline: "Obrigado!", subline: "1.000 seguidores" },
]

export function sceneFromStarter(s: StarterDef) {
  const fmt = STUDIO_FORMATS.find((f) => f.id === s.format)!
  const { width: w, height: h } = fmt
  const m = Math.round(w * 0.08)
  return {
    id: nanoid(),
    name: s.name,
    frame: { width: w, height: h },
    layers: [
      { id: "background", name: "Fundo", left: 0, top: 0, width: w, height: h, type: "Background", fill: s.bg, metadata: {} },
      textLayer({ text: s.headline, left: m, top: Math.round(h * 0.58), width: w - 2 * m, fontSize: Math.round(Math.min(w, h) / 8), fill: s.fg, bold: true }),
      textLayer({ text: s.subline, left: m, top: Math.round(h * 0.58) + Math.round(Math.min(w, h) / 8) * 2.4, width: w - 2 * m, fontSize: Math.round(Math.min(w, h) / 22), fill: s.fg }),
    ],
    metadata: {},
  }
}

/** Starter templates written for AQUA (no third-party artwork). */
export const SAMPLE_TEMPLATES = STARTERS.map((s) => {
  const fmt = STUDIO_FORMATS.find((f) => f.id === s.format)!
  return {
    ...sceneFromStarter(s),
    id: s.id,
    name: s.name,
    format: s.format,
    preview: svgPreview(s.bg, s.fg, s.headline, 320, Math.round((320 * fmt.height) / fmt.width)),
  }
})

export const starterById = (id: string | null) => SAMPLE_TEMPLATES.find((t) => t.id === id)

export const textComponents = [
  textLayer({ text: "Adicionar título", left: 0, top: 0, width: 640, fontSize: 96, fill: AQUA.ink, bold: true }),
  textLayer({ text: "Adicionar texto de corpo", left: 0, top: 0, width: 640, fontSize: 44, fill: AQUA.ink }),
]

export const sampleFrames = STUDIO_FORMATS.map((f, i) => ({
  id: i + 1,
  name: f.label,
  width: f.width,
  height: f.height,
  unit: "px",
  preview: svgPreview("#eff2f6", "#405168", f.label, 160, Math.round((160 * f.height) / f.width)),
}))
