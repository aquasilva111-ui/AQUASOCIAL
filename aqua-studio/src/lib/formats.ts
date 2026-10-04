/**
 * Artboard sizes. Keep in sync with FORMATS in the app
 * (src/lib/creative-hub/model.ts): same ids, same pixels.
 */
export type StudioFormatId = "post" | "story" | "video" | "presentation" | "banner" | "book_cover"

export type StudioFormat = {
  id: StudioFormatId
  label: string
  width: number
  height: number
  editor: "GRAPHIC" | "PRESENTATION"
  publishTo: "post" | "story" | "banner" | "book_cover" | "none"
}

export const STUDIO_FORMATS: StudioFormat[] = [
  { id: "post", label: "Post", width: 1080, height: 1350, editor: "GRAPHIC", publishTo: "post" },
  { id: "story", label: "Story", width: 1080, height: 1920, editor: "GRAPHIC", publishTo: "story" },
  { id: "video", label: "Vídeo", width: 1920, height: 1080, editor: "GRAPHIC", publishTo: "post" },
  { id: "presentation", label: "Apresentação", width: 1920, height: 1080, editor: "PRESENTATION", publishTo: "none" },
  { id: "banner", label: "Banner de canal", width: 2560, height: 1440, editor: "GRAPHIC", publishTo: "banner" },
  { id: "book_cover", label: "Capa de livro", width: 1600, height: 2400, editor: "GRAPHIC", publishTo: "book_cover" },
]

export const DEFAULT_FORMAT = STUDIO_FORMATS[0]

export function formatById(id: string | null | undefined): StudioFormat {
  return STUDIO_FORMATS.find((f) => f.id === id) ?? DEFAULT_FORMAT
}
