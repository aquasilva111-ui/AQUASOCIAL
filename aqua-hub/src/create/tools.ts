import type { ItemKind } from 'aqua-project/src/index'

import type { ToolId } from './route'

export type RulerIcon =
  | 'cursor'
  | 'type'
  | 'rect'
  | 'ellipse'
  | 'image'
  | 'star'
  | 'title'
  | 'list'
  | 'quote'
  | 'present'
  | 'formula'
  | 'filter'
  | 'chart'
  | 'play'
  | 'pencil'
  | 'note'
  | 'wave'
  | 'cut'
  | 'fade'
  | 'faders'
  | 'bars'
  | 'line'
  | 'pie'
  | 'orbit'
  | 'cube'
  | 'light'

export type Ratio = '1' | '16-9' | '3-4' | '16-10'

export type ToolDef = {
  id: ToolId
  kind: ItemKind | null
  label: string
  description: string
  chip: 'IA' | 'Melody Lab'
  ai: string
  empty: string
  emptyMeta: string
  ratio: Ratio
  ruler: { id: string; label: string; icon: RulerIcon }[]
}

const star = { id: 'star', label: 'IA', icon: 'star' as const }

export const TOOLS: ToolDef[] = [
  {
    id: 'design',
    kind: 'design',
    label: 'Design',
    description: 'Post social e peças visuais',
    chip: 'IA',
    ai: 'Adaptar com IA',
    empty: 'Nova prancheta',
    emptyMeta: 'Post social 1080×1080',
    ratio: '1',
    ruler: [
      { id: 'cursor', label: 'Cursor', icon: 'cursor' },
      { id: 'type', label: 'Tipo', icon: 'type' },
      { id: 'rect', label: 'Retângulo', icon: 'rect' },
      { id: 'ellipse', label: 'Elipse', icon: 'ellipse' },
      { id: 'image', label: 'Imagem', icon: 'image' },
      star
    ]
  },
  {
    id: 'write',
    kind: 'doc',
    label: 'Write',
    description: 'Texto longo em página',
    chip: 'IA',
    ai: 'Ajudar com IA',
    empty: 'Página em branco',
    emptyMeta: 'A4',
    ratio: '3-4',
    ruler: [
      { id: 'type', label: 'Tipo', icon: 'type' },
      { id: 'title', label: 'Título', icon: 'title' },
      { id: 'list', label: 'Lista', icon: 'list' },
      { id: 'quote', label: 'Citação', icon: 'quote' },
      { id: 'image', label: 'Imagem', icon: 'image' },
      star
    ]
  },
  {
    id: 'slides',
    kind: 'presentation',
    label: 'Slides',
    description: 'Apresentação quadro a quadro',
    chip: 'IA',
    ai: 'Gerar com IA',
    empty: 'Primeiro slide',
    emptyMeta: '1920×1080',
    ratio: '16-9',
    ruler: [
      { id: 'cursor', label: 'Cursor', icon: 'cursor' },
      { id: 'type', label: 'Tipo', icon: 'type' },
      { id: 'rect', label: 'Retângulo', icon: 'rect' },
      { id: 'image', label: 'Imagem', icon: 'image' },
      { id: 'present', label: 'Apresentar', icon: 'present' },
      star
    ]
  },
  {
    id: 'sheet',
    kind: 'sheet',
    label: 'Planilha',
    description: 'Contas e grade',
    chip: 'IA',
    ai: 'Analisar com IA',
    empty: 'Grade vazia',
    emptyMeta: 'Planilha',
    ratio: '16-10',
    ruler: [
      { id: 'cursor', label: 'Cursor', icon: 'cursor' },
      { id: 'formula', label: 'Fórmula', icon: 'formula' },
      { id: 'filter', label: 'Filtro', icon: 'filter' },
      { id: 'chart', label: 'Gráfico', icon: 'chart' },
      star
    ]
  },
  {
    id: 'music',
    kind: 'music',
    label: 'Música',
    description: 'Piano roll e Melody Lab',
    chip: 'Melody Lab',
    ai: 'Melody Lab',
    empty: 'Piano roll',
    emptyMeta: 'Nova música',
    ratio: '16-9',
    ruler: [
      { id: 'play', label: 'Play', icon: 'play' },
      { id: 'pencil', label: 'Lápis', icon: 'pencil' },
      { id: 'note', label: 'Nota', icon: 'note' },
      { id: 'wave', label: 'Onda', icon: 'wave' },
      star
    ]
  },
  {
    id: 'mix',
    kind: 'mix',
    label: 'Mix',
    description: 'Várias faixas juntas',
    chip: 'IA',
    ai: 'Sugerir mix com IA',
    empty: 'Mesa de faixas',
    emptyMeta: '44,1 kHz',
    ratio: '16-9',
    ruler: [
      { id: 'play', label: 'Play', icon: 'play' },
      { id: 'cut', label: 'Corte', icon: 'cut' },
      { id: 'fade', label: 'Fade', icon: 'fade' },
      { id: 'faders', label: 'Faders', icon: 'faders' },
      star
    ]
  },
  {
    id: 'audio',
    kind: 'audio',
    label: 'Áudio',
    description: 'Um arquivo de som',
    chip: 'IA',
    ai: 'Transcrever com IA',
    empty: 'Onda vazia',
    emptyMeta: 'Um arquivo',
    ratio: '16-9',
    ruler: [
      { id: 'play', label: 'Play', icon: 'play' },
      { id: 'cut', label: 'Corte', icon: 'cut' },
      { id: 'fade', label: 'Fade', icon: 'fade' },
      { id: 'wave', label: 'Onda', icon: 'wave' },
      star
    ]
  },
  {
    id: 'video',
    kind: 'video',
    label: 'Vídeo',
    description: 'Linha do tempo',
    chip: 'IA',
    ai: 'Legendas com IA',
    empty: 'Linha do tempo',
    emptyMeta: '1920×1080',
    ratio: '16-9',
    ruler: [
      { id: 'play', label: 'Play', icon: 'play' },
      { id: 'cut', label: 'Corte', icon: 'cut' },
      { id: 'type', label: 'Tipo', icon: 'type' },
      { id: 'image', label: 'Imagem', icon: 'image' },
      star
    ]
  },
  {
    id: 'chart',
    kind: 'chart',
    label: 'Gráfico',
    description: 'Barras, linha e pizza',
    chip: 'IA',
    ai: 'Sugerir gráfico com IA',
    empty: 'Prancheta de dados',
    emptyMeta: 'Gráfico',
    ratio: '16-9',
    ruler: [
      { id: 'bars', label: 'Barras', icon: 'bars' },
      { id: 'line', label: 'Linha', icon: 'line' },
      { id: 'pie', label: 'Pizza', icon: 'pie' },
      { id: 'type', label: 'Tipo', icon: 'type' },
      star
    ]
  },
  {
    id: 'cube',
    kind: null,
    label: 'Estúdio 3D',
    description: 'Cena e materiais',
    chip: 'IA',
    ai: 'Gerar material com IA',
    empty: 'Cena vazia',
    emptyMeta: 'Estúdio 3D',
    ratio: '1',
    ruler: [
      { id: 'orbit', label: 'Órbita', icon: 'orbit' },
      { id: 'cube', label: 'Cubo', icon: 'cube' },
      { id: 'light', label: 'Luz', icon: 'light' },
      { id: 'cursor', label: 'Cursor', icon: 'cursor' },
      star
    ]
  }
]

const BY_ID = new Map(TOOLS.map((tool) => [tool.id, tool]))

export function toolById(id: ToolId): ToolDef {
  return BY_ID.get(id)!
}

export function toolForKind(kind: ItemKind): ToolDef | undefined {
  return TOOLS.find((tool) => tool.kind === kind)
}
