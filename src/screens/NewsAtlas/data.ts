// Placeholder content for the Notícias + Convenções page.
// NOTÍCIAS are temporal events; CONVENÇÕES are persistent semantic structures.
// A news item activates several Convenções and a Convenção relates to many news (many-to-many).
// Replace with real sources once the Convenções logic and news feeds are wired up.

export type NetworkKind =
  | 'sphere'
  | 'hex'
  | 'flows'
  | 'radial'
  | 'dotworld'
  | 'tree'

export type Convention = {
  id: string
  name: string
  kind: NetworkKind
  palette: [string, string, string]
  seed: number
  // card aspect ratio (width / height) so the mosaic is not a uniform grid
  ratio: number
  // names of related Convenções
  related: string[]
}

export type NewsItem = {
  id: string
  title: string
  source: string
  ago: string
  tag: string
  summary: string
  live?: boolean
  conventions: string[]
  // media aspect ratio (width / height); undefined = no media
  ratio?: number
  gradient?: [string, string]
}

export const CONVENTIONS: Convention[] = [
  {
    id: 'dem',
    name: 'Democracia',
    kind: 'sphere',
    palette: ['#9ad0ff', '#ffffff', '#ffb86b'],
    seed: 3,
    ratio: 1,
    related: ['Eleição', 'Governo', 'Voto'],
  },
  {
    id: 'ia',
    name: 'Inteligência Artificial',
    kind: 'hex',
    palette: ['#4da3ff', '#ffffff', '#7cf3ff'],
    seed: 5,
    ratio: 0.8,
    related: ['Trabalho', 'Dados', 'Ética'],
  },
  {
    id: 'mig',
    name: 'Migração',
    kind: 'flows',
    palette: ['#ff3b30', '#ffe83a', '#2a8bff'],
    seed: 7,
    ratio: 1.25,
    related: ['Território', 'Economia', 'Guerra'],
  },
  {
    id: 'ene',
    name: 'Energia',
    kind: 'radial',
    palette: ['#8fa8ff', '#ffffff', '#ffd24d'],
    seed: 9,
    ratio: 0.9,
    related: ['Economia', 'Clima', 'Território'],
  },
  {
    id: 'ter',
    name: 'Território',
    kind: 'dotworld',
    palette: ['#69b5ff', '#c8e4ff', '#ffffff'],
    seed: 11,
    ratio: 1.5,
    related: ['Migração', 'Guerra', 'País'],
  },
  {
    id: 'gue',
    name: 'Guerra',
    kind: 'tree',
    palette: ['#ff4d2e', '#ff9a2e', '#ffe83a'],
    seed: 13,
    ratio: 1,
    related: ['Território', 'Migração', 'Energia'],
  },
  {
    id: 'eco',
    name: 'Economia',
    kind: 'flows',
    palette: ['#2bff7a', '#ffe83a', '#27d9ff'],
    seed: 17,
    ratio: 1.3,
    related: ['Energia', 'Trabalho', 'Mercado'],
  },
  {
    id: 'cul',
    name: 'Cultura',
    kind: 'sphere',
    palette: ['#ff6ab0', '#ffd24d', '#6ad1ff'],
    seed: 19,
    ratio: 0.85,
    related: ['Religião', 'Música', 'Identidade'],
  },
  {
    id: 'rel',
    name: 'Religião',
    kind: 'radial',
    palette: ['#d6a8ff', '#ffffff', '#6ad1ff'],
    seed: 23,
    ratio: 1.1,
    related: ['Cultura', 'Território', 'Democracia'],
  },
]

export const NEWS: NewsItem[] = [
  {
    id: 'n1',
    title: 'Eleições no Brasil entram na reta final e movimentam o mercado',
    source: 'Agência Aqua',
    ago: 'há 12 min',
    tag: 'Política',
    live: true,
    summary:
      'Pesquisas mostram disputa acirrada; analistas observam a reação da bolsa e do câmbio.',
    conventions: ['dem', 'eco'],
    ratio: 1.6,
    gradient: ['#1185ff', '#7cf3ff'],
  },
  {
    id: 'n2',
    title: 'Nova geração de modelos de IA chega aos celulares',
    source: 'Tech Aqua',
    ago: 'há 1 h',
    tag: 'Tecnologia',
    summary:
      'Rodar IA no aparelho reduz custo e reforça a discussão sobre privacidade.',
    conventions: ['ia', 'eco'],
    ratio: 1.33,
    gradient: ['#6a2cff', '#27d9ff'],
  },
  {
    id: 'n3',
    title: 'Cúpula discute transição energética',
    source: 'Mundo',
    ago: 'há 2 h',
    tag: 'Energia',
    summary: 'Países divergem sobre metas e prazos.',
    conventions: ['ene', 'ter'],
    ratio: 1,
    gradient: ['#ffd24d', '#ff7a00'],
  },
  {
    id: 'n4',
    title: 'Fluxo migratório volta ao centro do debate europeu',
    source: 'Mundo',
    ago: 'há 3 h',
    tag: 'Sociedade',
    summary: 'Governos revisam regras de fronteira.',
    conventions: ['mig', 'ter', 'dem'],
    ratio: 0.75,
    gradient: ['#ff3b30', '#ffe83a'],
  },
  {
    id: 'n5',
    title: 'Festival reúne artistas e debate identidade cultural',
    source: 'Cultura',
    ago: 'há 5 h',
    tag: 'Cultura',
    summary: 'Programação mistura música, religião e memória.',
    conventions: ['cul', 'rel'],
    ratio: 1.33,
    gradient: ['#ff6ab0', '#ffd24d'],
  },
  {
    id: 'n6',
    title: 'Cessar-fogo é anunciado após semanas de conflito',
    source: 'Agência Aqua',
    ago: 'há 6 h',
    tag: 'Mundo',
    live: true,
    summary: 'Mediadores internacionais confirmam trégua inicial de 72 horas.',
    conventions: ['gue', 'ter', 'mig'],
    ratio: 2.3,
    gradient: ['#2a3a55', '#ff4d2e'],
  },
  {
    id: 'n7',
    title: 'Petróleo oscila com tensão geopolítica',
    source: 'Economia',
    ago: 'há 8 h',
    tag: 'Economia',
    summary: 'Mercado reage a ruído político.',
    conventions: ['eco', 'ene', 'gue'],
    ratio: 1.78,
    gradient: ['#2bff7a', '#27d9ff'],
  },
  {
    id: 'n8',
    title: 'Debate sobre fé e espaço público',
    source: 'Sociedade',
    ago: 'ontem',
    tag: 'Religião',
    summary: 'Especialistas comparam modelos de laicidade.',
    conventions: ['rel', 'dem'],
  },
]

const CONVENTION_BY_ID = Object.fromEntries(CONVENTIONS.map(c => [c.id, c]))

export function conventionById(id: string): Convention | undefined {
  return CONVENTION_BY_ID[id]
}

export function newsForConvention(id: string): NewsItem[] {
  return NEWS.filter(n => n.conventions.includes(id))
}

export type Focus = {kind: 'news' | 'conv'; id: string} | null

/** Which news and Convenções stay lit while `focus` is active. */
export function relatedTo(focus: Focus): {
  news: Set<string>
  conv: Set<string>
} {
  if (!focus) return {news: new Set(), conv: new Set()}
  if (focus.kind === 'news') {
    const item = NEWS.find(n => n.id === focus.id)
    return {news: new Set([focus.id]), conv: new Set(item?.conventions ?? [])}
  }
  return {
    news: new Set(newsForConvention(focus.id).map(n => n.id)),
    conv: new Set([focus.id]),
  }
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Search across both layers: a Convenção query also finds the news that activate it. */
export function searchAtlas(query: string): {
  news: NewsItem[]
  conv: Convention[]
} {
  const q = fold(query.trim())
  if (!q) return {news: NEWS, conv: CONVENTIONS}
  const conv = CONVENTIONS.filter(c =>
    fold(`${c.name} ${c.related.join(' ')}`).includes(q),
  )
  const convIds = new Set(conv.map(c => c.id))
  const news = NEWS.filter(
    n =>
      fold(`${n.title} ${n.summary} ${n.tag}`).includes(q) ||
      n.conventions.some(id => convIds.has(id)),
  )
  return {news, conv}
}
