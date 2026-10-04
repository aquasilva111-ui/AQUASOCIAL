import type { ItemKind } from './types'

/** Capabilities of the Launch Hub (`src/lib/launch-hub/types.ts`) an export can satisfy. */
export type LaunchCapability = 'image' | 'multi_image' | 'carousel' | 'short_video' | 'long_video' | 'audio' | 'article' | 'page'

export interface ExportOption {
  /** What the tool exports for the Launch Hub. */
  capability: LaunchCapability
  mime: string
  label: string
}

/** What each tool can hand to the Launch Hub. Charts and sheets go out as images. */
export const EXPORTS: Record<ItemKind, ExportOption[]> = {
  doc: [{ capability: 'article', mime: 'text/markdown', label: 'Artigo' }],
  design: [{ capability: 'image', mime: 'image/png', label: 'Imagem' }],
  presentation: [{ capability: 'carousel', mime: 'image/png', label: 'Carrossel (um PNG por slide)' }],
  sheet: [{ capability: 'image', mime: 'image/png', label: 'Tabela como imagem' }],
  video: [
    { capability: 'short_video', mime: 'video/mp4', label: 'Vídeo curto' },
    { capability: 'long_video', mime: 'video/mp4', label: 'Vídeo longo' }
  ],
  audio: [{ capability: 'audio', mime: 'audio/mpeg', label: 'Áudio' }],
  mix: [{ capability: 'audio', mime: 'audio/wav', label: 'Mixagem' }],
  music: [{ capability: 'audio', mime: 'audio/mpeg', label: 'Faixa' }],
  chart: [{ capability: 'image', mime: 'image/png', label: 'Gráfico como imagem' }]
}

export const exportsFor = (kind: ItemKind): ExportOption[] => EXPORTS[kind]

/** Items of a project that can be launched to a destination accepting `capability`. */
export function launchableFor(items: { id: string; kind: ItemKind }[], capability: LaunchCapability) {
  return items.filter((i) => EXPORTS[i.kind].some((e) => e.capability === capability))
}
