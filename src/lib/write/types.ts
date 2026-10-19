/**
 * Write post model.
 *
 * Serialized fiction already has `place.aqua.book.book` and
 * `place.aqua.book.chapter`. Article, opinion, and recipe have no lexicon
 * yet. This module does not rename or extend `app.bsky.*` records.
 *
 * Screens talk to a {@link WriteRepository}. The shipping implementation is
 * local (seeded examples plus drafts on this device). A later repository can
 * map the same types onto lexicons without changing the UI.
 */

export type WritePostType = 'book' | 'article' | 'opinion' | 'recipe'

export type ContentOrigin =
  | {kind: 'original'; authorId: string}
  | {kind: 'derivative'; authorId: string; sourceCredit: string}
  | {kind: 'translation'; authorId: string; sourceCredit: string}

/**
 * Royalty distribution is not decided.
 *
 * TODO(royalties): percentuais e o modelo de divisão ainda não foram
 * definidos. Não gravar, calcular ou exibir nenhuma porcentagem. `shares`
 * fica `null` de propósito até existir um contrato. A origem existe só
 * para atribuição.
 */
export type RoyaltyAttribution = {
  origin: ContentOrigin
  /** Unset until the royalty team publishes a split. Never a percentage. */
  shares: null
}

/** Records attribution and refuses to invent a royalty split. */
export function attribute(origin: ContentOrigin): RoyaltyAttribution {
  return {origin, shares: null}
}

export type WriteAuthor = {
  id: string
  handle: string
  displayName: string
  /** Disc color when the author has no avatar image. */
  color: string
  followed: boolean
}

export type Engagement = {
  replies: number
  reposts: number
  likes: number
}

export type WriteBookRef = {
  id: string
  title: string
  genres: string[]
  status: 'ongoing' | 'completed' | 'hiatus'
  chapterCount: number
  /** Chapters the reader has finished. */
  chaptersRead: number
  fanfic: boolean
}

export type WriteChapterRef = {
  id: string
  bookId: string
  number: number
  title: string
  partCount: number
  readMinutes: number
}

export type WritePostBase = {
  id: string
  author: WriteAuthor
  createdAt: string
  engagement: Engagement
  attribution: RoyaltyAttribution
  language: string
}

export type BookPost = WritePostBase & {
  type: 'book'
  text: string
  book: WriteBookRef
  chapter: WriteChapterRef
}

export type ArticlePost = WritePostBase & {
  type: 'article'
  title: string
  subtitle: string
  body: string
  tags: string[]
  readMinutes: number
}

export type OpinionPost = WritePostBase & {
  type: 'opinion'
  text: string
  quote?: {text: string; url?: string}
}

export type RecipeDifficulty = 'easy' | 'medium' | 'hard'

export type RecipePost = WritePostBase & {
  type: 'recipe'
  title: string
  prepMinutes: number
  cookMinutes: number
  servings: number
  difficulty: RecipeDifficulty
  ingredients: string[]
  steps: string[]
  tags: string[]
}

export type WritePost = BookPost | ArticlePost | OpinionPost | RecipePost

export type ChapterPart = {
  id: string
  index: number
  text: string
  replies: number
  likes: number
  saved: boolean
}

export type ChapterComment = {
  id: string
  partIndex: number
  authorName: string
  authorColor: string
  text: string
}

export type WriteChapter = {
  id: string
  bookId: string
  number: number
  title: string
  author: WriteAuthor
  parts: ChapterPart[]
  readMinutes: number
  attribution: RoyaltyAttribution
  comments: ChapterComment[]
  commentsPerPart: boolean
}

export type ReadingProgress = {
  bookId: string
  chapterNumber: number
  partIndex: number
}

/** Explicit in-app interactions. There is no advertising profile. */
export type WriteEventKind =
  | 'follow'
  | 'like'
  | 'save'
  | 'read_to_end'
  | 'continue_reading'
  | 'view'

export type WriteEvent = {
  kind: WriteEventKind
  postId?: string
  authorId?: string
  bookId?: string
  at: string
}

export type WriteTab = 'following' | 'discover' | 'continue'

export type WriteTypeFilter = 'all' | WritePostType

/**
 * Sidebar controls. These are explicit user choices and always beat ranking.
 * `chronological` skips the scorer entirely.
 */
export type WriteControls = {
  showBooks: boolean
  showArticles: boolean
  hideFanfic: boolean
  chronological: boolean
  query: string
}

export const DEFAULT_CONTROLS: WriteControls = {
  showBooks: true,
  showArticles: true,
  hideFanfic: false,
  chronological: false,
  query: '',
}

export type ContentWarning = 'none' | 'mild' | 'explicit'

export type WriteDraft = {
  id: string
  type: WritePostType
  updatedAt: string
  bookId?: string
  newBookTitle?: string
  chapterTitle?: string
  genres: string[]
  parts: string[]
  articleTitle?: string
  subtitle?: string
  body?: string
  tags: string[]
  opinion?: string
  quoteText?: string
  quoteUrl?: string
  recipeTitle?: string
  prepMinutes?: number
  cookMinutes?: number
  servings?: number
  difficulty?: RecipeDifficulty
  ingredients: string[]
  steps: string[]
  originKind: ContentOrigin['kind']
  sourceCredit?: string
  contentWarning: ContentWarning
  commentsPerPart: boolean
  scheduledFor?: string
}

export type WriteTrend = {
  tag: string
  detail: string
}

export function bookIdOf(post: WritePost): string | undefined {
  return post.type === 'book' ? post.book.id : undefined
}

export function genresOf(post: WritePost): string[] {
  if (post.type === 'book') return post.book.genres
  if (post.type === 'article' || post.type === 'recipe') return post.tags
  return []
}

export function isFanfic(post: WritePost): boolean {
  if (post.type === 'book') {
    return post.book.fanfic || post.book.genres.includes('fanfic')
  }
  return genresOf(post).includes('fanfic')
}

export function primaryGenre(post: WritePost): string | undefined {
  return genresOf(post)[0]
}

export function postHaystack(post: WritePost): string {
  const bits = [
    post.author.displayName,
    post.author.handle,
    post.type === 'book' ? post.text : '',
    post.type === 'book' ? post.book.title : '',
    post.type === 'book' ? post.chapter.title : '',
    post.type === 'article' ? post.title : '',
    post.type === 'article' ? post.subtitle : '',
    post.type === 'article' ? post.body : '',
    post.type === 'opinion' ? post.text : '',
    post.type === 'recipe' ? post.title : '',
    ...genresOf(post),
  ]
  return bits.join(' ').toLowerCase()
}
