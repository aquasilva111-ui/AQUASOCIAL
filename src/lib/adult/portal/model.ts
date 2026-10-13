/**
 * Aqua +18 portal model: age check, catalog, external index and the
 * hash-matching hook that runs before anything is published or indexed.
 * Screens render the seed below when the API is not configured. There is
 * no web crawler — external rows are curated.
 */

export type PortalFormat =
  | 'post'
  | 'video'
  | 'article'
  | 'book'
  | 'visionboard'
  | 'web'

export type PortalLane = 'foryou' | 'trending' | 'following' | 'saved'

export type PortalItem = {
  id: string
  format: PortalFormat
  title: string
  handle: string
  likes: number
  comments: number
  duration?: string
  /** Shown without the blur veil until the viewer hides it again. */
  startsRevealed?: boolean
  /** Stays in "Para você" even when the Web format chip is off. */
  pinned?: boolean
  trending?: boolean
  categories: Array<'artistico' | 'literatura' | 'explicito' | 'fetiche'>
  tags: string[]
  adult: true
}

export type WebResult = {
  id: string
  title: string
  domain: string
  url: string
  snippet: string
  category: 'Fotografia' | 'Literatura' | 'Portfólios' | 'Saúde'
  indexedLabel: string
}

export type FormatPrefs = {
  post: boolean
  video: boolean
  article: boolean
  visionboard: boolean
  web: boolean
}

export type CategoryPrefs = Record<
  'artistico' | 'literatura' | 'explicito' | 'fetiche',
  boolean
>

/** Sentinel the stub treats as a hash-list hit. Real providers replace this. */
export const QUARANTINE_CONTENT_HASH = 'hash:quarantine'

export const FOLLOWING_HANDLES = ['luna.art', 'studio.k', 'clara.le']

export const PORTAL_SEED: PortalItem[] = [
  {
    id: 'pi-ensaio',
    format: 'post',
    title: 'Ensaio noturno — série completa',
    handle: 'luna.art',
    likes: 128,
    comments: 34,
    categories: ['artistico'],
    tags: ['ensaio', 'artistico'],
    trending: true,
    adult: true,
  },
  {
    id: 'pi-bastidores',
    format: 'video',
    title: 'Bastidores do estúdio',
    handle: 'studio.k',
    likes: 128,
    comments: 34,
    duration: '12:04',
    categories: ['artistico'],
    tags: ['estudio'],
    trending: true,
    adult: true,
  },
  {
    id: 'pi-desejo',
    format: 'article',
    title: 'Sobre desejo e literatura',
    handle: 'clara.le',
    likes: 128,
    comments: 34,
    startsRevealed: true,
    categories: ['literatura'],
    tags: ['literatura'],
    trending: true,
    adult: true,
  },
  {
    id: 'pi-mood',
    format: 'visionboard',
    title: 'Moodboard: veludo e luz',
    handle: 'm.atelie',
    likes: 128,
    comments: 34,
    categories: ['artistico'],
    tags: ['veludo'],
    trending: true,
    adult: true,
  },
  {
    id: 'pi-contos',
    format: 'book',
    title: 'Contos de madrugada - 14 cap.',
    handle: 'r.autor',
    likes: 128,
    comments: 34,
    categories: ['literatura'],
    tags: ['contos'],
    adult: true,
  },
  {
    id: 'pi-galeria',
    format: 'web',
    title: 'Galeria independente',
    handle: 'exemplo-galeria',
    likes: 128,
    comments: 34,
    pinned: true,
    categories: ['artistico'],
    tags: ['galeria'],
    adult: true,
  },
  {
    id: 'pi-noir',
    format: 'video',
    title: 'Sessão em preto e branco',
    handle: 'noir.foto',
    likes: 128,
    comments: 34,
    duration: '03:41',
    categories: ['artistico'],
    tags: ['foto'],
    adult: true,
  },
  {
    id: 'pi-serie',
    format: 'post',
    title: 'Nova série chegando sexta',
    handle: 'duo.vibes',
    likes: 128,
    comments: 34,
    categories: ['artistico'],
    tags: ['serie'],
    adult: true,
  },
]

export const WEB_SEED: WebResult[] = [
  {
    id: 'ex-foto',
    title: 'Coleção de fotografia artística contemporânea',
    domain: 'arte-exemplo.com',
    url: 'https://arte-exemplo.com',
    snippet:
      'Acervo curado de ensaios autorais, com créditos e licenças de cada fotógrafo.',
    category: 'Fotografia',
    indexedLabel: 'Indexado há 2 dias',
  },
  {
    id: 'ex-forum',
    title: 'Fórum de literatura adulta',
    domain: 'contos-exemplo.org',
    url: 'https://contos-exemplo.org',
    snippet:
      'Comunidade de escritores com contos, críticas e oficinas mensais.',
    category: 'Literatura',
    indexedLabel: 'Indexado há 2 dias',
  },
  {
    id: 'ex-port',
    title: 'Portfólio de criador independente',
    domain: 'criador-exemplo.net',
    url: 'https://criador-exemplo.net',
    snippet: 'Trabalhos, agenda de lançamentos e links oficiais do criador.',
    category: 'Portfólios',
    indexedLabel: 'Indexado há 2 dias',
  },
  {
    id: 'ex-revista',
    title: 'Revista sobre sexualidade e saúde',
    domain: 'revista-exemplo.com.br',
    url: 'https://revista-exemplo.com.br',
    snippet: 'Reportagens e guias revisados por especialistas.',
    category: 'Saúde',
    indexedLabel: 'Indexado há 2 dias',
  },
]

/** Catalog size shown on the Web tab before the viewer narrows the sample. */
export const WEB_INDEX_SIZE = 1284

export const FORMAT_LABEL: Record<PortalFormat, string> = {
  post: 'Post',
  video: 'Vídeo',
  article: 'Artigo',
  book: 'Livro',
  visionboard: 'Visionboard',
  web: 'Web',
}

export function isAtLeast18(
  day: number,
  month: number,
  year: number,
  now = new Date(),
): boolean {
  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    !Number.isInteger(year)
  ) {
    return false
  }
  if (year < 1900 || year > now.getFullYear()) return false
  const dob = new Date(year, month - 1, day)
  if (
    dob.getFullYear() !== year ||
    dob.getMonth() !== month - 1 ||
    dob.getDate() !== day
  ) {
    return false
  }
  const adultOn = new Date(year + 18, month - 1, day)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return adultOn.getTime() <= today.getTime()
}

export type ScanOutcome = 'ok' | 'quarantine'

/**
 * Moderation hook invoked before a portal publish or an external-index
 * insert. No detector ships here: a hash-list provider can replace the body
 * later. The sentinel hash is quarantined so the step is observable.
 */
export function scanBeforePublish(
  contentHash: string | undefined,
): ScanOutcome {
  if (contentHash === QUARANTINE_CONTENT_HASH) return 'quarantine'
  return 'ok'
}

export function hashForDraft(title: string): string {
  if (title.includes(QUARANTINE_CONTENT_HASH)) return QUARANTINE_CONTENT_HASH
  return `hash:${title.trim().toLowerCase()}`
}

function formatAllowed(item: PortalItem, formats: FormatPrefs): boolean {
  if (item.format === 'book') return formats.article
  if (item.format === 'web') return item.pinned === true || formats.web
  return formats[item.format]
}

function matchesMuted(item: PortalItem, mutedWords: string): boolean {
  const words = mutedWords
    .split(',')
    .map(word => word.trim().toLowerCase())
    .filter(Boolean)
  if (!words.length) return false
  const haystack =
    `${item.title} ${item.tags.join(' ')} ${item.handle}`.toLowerCase()
  return words.some(word => haystack.includes(word))
}

export function selectPortalItems(input: {
  items: PortalItem[]
  format: PortalFormat | 'all'
  query: string
  lane: PortalLane
  savedIds: string[]
  mutedWords: string
  formats: FormatPrefs
  categories: CategoryPrefs
}): PortalItem[] {
  const query = input.query.trim().toLowerCase()
  const saved = new Set(input.savedIds)
  const following = new Set(FOLLOWING_HANDLES)
  return input.items.filter(item => {
    if (!item.adult) return false
    if (!formatAllowed(item, input.formats)) return false
    if (
      item.categories.length > 0 &&
      !item.categories.some(category => input.categories[category])
    ) {
      return false
    }
    if (matchesMuted(item, input.mutedWords)) return false
    if (input.format !== 'all') {
      if (input.format === 'article') {
        if (item.format !== 'article' && item.format !== 'book') return false
      } else if (item.format !== input.format) {
        return false
      }
    }
    if (input.lane === 'trending' && !item.trending) return false
    if (input.lane === 'following' && !following.has(item.handle)) return false
    if (input.lane === 'saved' && !saved.has(item.id)) return false
    if (!query) return true
    const haystack =
      `${item.title} ${item.handle} ${item.tags.join(' ')}`.toLowerCase()
    return haystack.includes(query)
  })
}

export function selectWebResults(
  results: WebResult[],
  query: string,
  category: string,
): WebResult[] {
  const q = query.trim().toLowerCase()
  return results.filter(result => {
    if (category !== 'Todos' && result.category !== category) return false
    if (!q) return true
    const haystack =
      `${result.title} ${result.domain} ${result.snippet} ${result.category}`.toLowerCase()
    return haystack.includes(q)
  })
}
