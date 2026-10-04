import { formatById, StudioFormat } from "./formats"

export type LaunchOptions = {
  format: StudioFormat
  /** Starter template id, see constants/editor.ts */
  template: string | null
  /** Origin allowed to receive the exported design (the AQUA app). */
  host: string | null
}

/** Reads ?format=post&template=chapter-announce&host=https://aquaapp.online */
export function readLaunchOptions(search = window.location.search): LaunchOptions {
  const q = new URLSearchParams(search)
  return {
    format: formatById(q.get("format")),
    template: q.get("template"),
    host: q.get("host"),
  }
}
