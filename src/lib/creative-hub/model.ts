/**
 * AQUA Creative Hub — one page to make things (designs, docs) and publish
 * them to AQUA. This file is the pure part: sections, formats and starter
 * templates. Nothing here stores user data; docs live in `state/docs`.
 */

export type HubTabId = 'home' | 'templates' | 'projects' | 'docs' | 'brand'

export const HUB_TABS: {id: HubTabId; label: string}[] = [
  {id: 'home', label: 'Início'},
  {id: 'templates', label: 'Modelos'},
  {id: 'projects', label: 'Projetos'},
  {id: 'docs', label: 'Docs'},
  {id: 'brand', label: 'Kit de marca'},
]

const TAB_IDS = new Set<string>(HUB_TABS.map(t => t.id))

export function isHubTab(v: unknown): v is HubTabId {
  return typeof v === 'string' && TAB_IDS.has(v)
}

/** Home is the bare route; every other section has its own path. */
export function hubPath(tab: HubTabId = 'home') {
  return tab === 'home' ? '/creative-hub' : `/creative-hub/${tab}`
}

export type FormatId =
  | 'post'
  | 'story'
  | 'video'
  | 'presentation'
  | 'banner'
  | 'book_cover'
  | 'doc'

export type DesignFormat = {
  id: FormatId
  label: string
  /** Pixel size of the artboard; docs have none. */
  width?: number
  height?: number
  color: string
  /** Where "Publish to AQUA" sends the result. */
  publishTo: 'post' | 'story' | 'banner' | 'book_cover' | 'none'
  /** false until the matching editor exists. */
  available: boolean
}

export const FORMATS: DesignFormat[] = [
  {
    id: 'post',
    label: 'Post',
    width: 1080,
    height: 1350,
    color: '#002bef',
    publishTo: 'post',
    available: false,
  },
  {
    id: 'story',
    label: 'Story',
    width: 1080,
    height: 1920,
    color: '#f04c24',
    publishTo: 'story',
    available: false,
  },
  {
    id: 'video',
    label: 'Vídeo',
    width: 1920,
    height: 1080,
    color: '#12a58a',
    publishTo: 'post',
    available: false,
  },
  {
    id: 'presentation',
    label: 'Apresentação',
    width: 1920,
    height: 1080,
    color: '#7b6cf6',
    publishTo: 'none',
    available: false,
  },
  {
    id: 'banner',
    label: 'Banner de canal',
    width: 2560,
    height: 1440,
    color: '#e0607e',
    publishTo: 'banner',
    available: false,
  },
  {
    id: 'book_cover',
    label: 'Capa de livro',
    width: 1600,
    height: 2400,
    color: '#8a3b0b',
    publishTo: 'book_cover',
    available: false,
  },
  {
    id: 'doc',
    label: 'Doc',
    color: '#0b2a6b',
    publishTo: 'none',
    available: true,
  },
]

export function formatSize(f: DesignFormat) {
  return f.width && f.height ? `${f.width} × ${f.height}` : 'Documento'
}

const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x)

/** "4:5", "9:16"…; docs have no artboard. */
export function formatRatio(f: DesignFormat) {
  if (!f.width || !f.height) return 'Aa'
  const d = gcd(f.width, f.height)
  return `${f.width / d}:${f.height / d}`
}

export type HubTemplate = {
  id: string
  name: string
  format: Exclude<FormatId, 'doc'>
  category: 'lancamento' | 'livros' | 'eventos' | 'redes'
  headline: string
  subline: string
  /** Solid background and text colors; real artwork comes with the editor. */
  bg: string
  fg: string
}

export const TEMPLATE_CATEGORIES: {
  id: HubTemplate['category']
  label: string
}[] = [
  {id: 'redes', label: 'Redes'},
  {id: 'lancamento', label: 'Lançamento'},
  {id: 'livros', label: 'Livros'},
  {id: 'eventos', label: 'Eventos'},
]

export const TEMPLATES: HubTemplate[] = [
  {
    id: 'chapter-announce',
    name: 'Anúncio de capítulo',
    format: 'post',
    category: 'livros',
    headline: 'Novo capítulo no ar',
    subline: 'Título do livro · Cap. 1',
    bg: '#0b2a6b',
    fg: '#ffffff',
  },
  {
    id: 'book-quote',
    name: 'Citação de livro',
    format: 'post',
    category: 'livros',
    headline: '"Uma frase que ficou."',
    subline: 'Título do livro',
    bg: '#f3e9dc',
    fg: '#2b2118',
  },
  {
    id: 'book-cover',
    name: 'Capa simples',
    format: 'book_cover',
    category: 'livros',
    headline: 'Título do livro',
    subline: 'Nome da autora',
    bg: '#8a3b0b',
    fg: '#ffffff',
  },
  {
    id: 'countdown',
    name: 'Contagem regressiva',
    format: 'story',
    category: 'eventos',
    headline: 'Última chance',
    subline: 'Sexta, 20h',
    bg: '#f04c24',
    fg: '#ffffff',
  },
  {
    id: 'live-notice',
    name: 'Aviso de live',
    format: 'banner',
    category: 'eventos',
    headline: 'Live hoje às 21h',
    subline: 'Venha conversar',
    bg: '#2b2a5a',
    fg: '#ffffff',
  },
  {
    id: 'brand-launch',
    name: 'Lançamento de marca',
    format: 'post',
    category: 'lancamento',
    headline: 'Nova marca',
    subline: 'Conheça o projeto',
    bg: '#0a5c63',
    fg: '#ffffff',
  },
  {
    id: 'product-drop',
    name: 'Novidade do Shop',
    format: 'story',
    category: 'lancamento',
    headline: 'Acabou de chegar',
    subline: 'Só no Aqua Shop',
    bg: '#6b2a5c',
    fg: '#ffffff',
  },
  {
    id: 'thanks',
    name: 'Obrigado pelos 1.000',
    format: 'post',
    category: 'redes',
    headline: 'Obrigado!',
    subline: '1.000 seguidores',
    bg: '#002bef',
    fg: '#ffffff',
  },
]

export function filterTemplates(
  list: HubTemplate[],
  opts: {category?: HubTemplate['category']; query?: string},
) {
  const q = opts.query?.trim().toLowerCase()
  return list.filter(
    t =>
      (!opts.category || t.category === opts.category) &&
      (!q ||
        t.name.toLowerCase().includes(q) ||
        t.headline.toLowerCase().includes(q)),
  )
}

export function formatById(id: FormatId) {
  return FORMATS.find(f => f.id === id)!
}
