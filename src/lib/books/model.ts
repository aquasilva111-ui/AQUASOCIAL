/**
 * AQUA Books — serialized fiction (Wattpad-style) on top of AQUA Profiles.
 *
 * Like the View Channel, this is not an account: identity, followers and
 * moderation come from the AQUA Profile. Two record types live in the
 * author's own repo, so only the author can write them:
 *
 *   at://<did>/place.aqua.book.book/<tid>      one per book
 *   at://<did>/place.aqua.book.chapter/<tid>   one per chapter, points at its book
 *
 * "Threads" reading: a chapter is read as a vertical thread of short parts
 * (splitIntoParts), and comments are the replies to an announcement post
 * (chapter.threadUri) — a normal app.bsky.feed.post, so likes, replies and
 * reposts reuse the existing social infrastructure. Sharing to the main AQUA
 * feed writes a normal post with an external card, so every client renders it.
 */

export const BOOK_COLLECTION = 'place.aqua.book.book'
export const CHAPTER_COLLECTION = 'place.aqua.book.chapter'

export type BookStatus = 'ongoing' | 'completed' | 'hiatus'
export type BookVisibility = 'public' | 'unlisted' | 'private'
export type BookMaturity = 'general' | 'teen' | 'mature'
export type ChapterStatus = 'draft' | 'published'

export type BookBlob = {
  $type: 'blob'
  ref: {$link: string}
  mimeType: string
  size: number
}

export type BookRecord = {
  $type: typeof BOOK_COLLECTION
  title: string
  synopsis?: string
  cover?: BookBlob
  genres: string[]
  tags: string[]
  language?: string
  maturity: BookMaturity
  status: BookStatus
  /** "private" and "unlisted" hide the book in AQUA; records stay public data. */
  visibility: BookVisibility
  createdAt: string
  updatedAt: string
}

export type ChapterRecord = {
  $type: typeof CHAPTER_COLLECTION
  /** at:// URI of the book, always in the same repo as the chapter. */
  book: string
  number: number
  title: string
  body: string
  authorNote?: string
  status: ChapterStatus
  publishedAt?: string
  /** Announcement post whose replies are this chapter's comments. */
  threadUri?: string
  createdAt: string
  updatedAt: string
}

export const GENRES: {id: string; label: string}[] = [
  {id: 'romance', label: 'Romance'},
  {id: 'fantasy', label: 'Fantasia'},
  {id: 'scifi', label: 'Ficção científica'},
  {id: 'mystery', label: 'Mistério'},
  {id: 'thriller', label: 'Suspense'},
  {id: 'horror', label: 'Terror'},
  {id: 'drama', label: 'Drama'},
  {id: 'comedy', label: 'Comédia'},
  {id: 'adventure', label: 'Aventura'},
  {id: 'fanfic', label: 'Fanfic'},
  {id: 'poetry', label: 'Poesia'},
  {id: 'ya', label: 'Jovem adulto'},
]

export const STATUS_LABELS: Record<BookStatus, string> = {
  ongoing: 'Em andamento',
  completed: 'Completo',
  hiatus: 'Em pausa',
}

export const MATURITY_LABELS: Record<BookMaturity, string> = {
  general: 'Livre',
  teen: '14+',
  mature: '18+',
}

export const LIMITS = {
  title: 100,
  synopsis: 2000,
  genres: 3,
  tags: 10,
  tag: 32,
  chapterTitle: 120,
  chapterBody: 60_000,
  authorNote: 1000,
  /** Target size of one "thread part" when reading in thread mode. */
  partSize: 600,
  sharePreview: 280,
}

const GENRE_IDS = new Set(GENRES.map(g => g.id))
const STATUSES = new Set<BookStatus>(['ongoing', 'completed', 'hiatus'])
const VISIBILITIES = new Set<BookVisibility>(['public', 'unlisted', 'private'])
const MATURITIES = new Set<BookMaturity>(['general', 'teen', 'mature'])

const clampText = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined

function isImageBlob(v: unknown): v is BookBlob {
  const b = v as BookBlob | undefined
  return (
    !!b &&
    typeof b === 'object' &&
    typeof b.ref?.$link === 'string' &&
    typeof b.mimeType === 'string' &&
    b.mimeType.startsWith('image/')
  )
}

export function isBookUri(uri: unknown, did?: string): uri is string {
  if (typeof uri !== 'string') return false
  const m = uri.match(/^at:\/\/([^/]+)\/place\.aqua\.book\.book\/[^/]+$/)
  return !!m && (!did || m[1] === did)
}

export function isPostUri(uri: unknown, did?: string): uri is string {
  if (typeof uri !== 'string') return false
  const m = uri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/[^/]+$/)
  return !!m && (!did || m[1] === did)
}

export function newBookRecord(
  input: Partial<BookRecord> & {title: string},
  now = new Date(),
): BookRecord {
  const ts = now.toISOString()
  return {
    $type: BOOK_COLLECTION,
    genres: [],
    tags: [],
    maturity: 'general',
    status: 'ongoing',
    visibility: 'public',
    createdAt: ts,
    updatedAt: ts,
    ...input,
  }
}

export function newChapterRecord(
  input: Partial<ChapterRecord> & {book: string; number: number},
  now = new Date(),
): ChapterRecord {
  const ts = now.toISOString()
  return {
    $type: CHAPTER_COLLECTION,
    title: '',
    body: '',
    status: 'draft',
    createdAt: ts,
    updatedAt: ts,
    ...input,
  }
}

/** Repo data is public and writable by any client: validate every field. */
export function normalizeBook(raw: unknown): BookRecord | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, any>
  const title = clampText(r.title, LIMITS.title)
  if (!title) return undefined
  return {
    $type: BOOK_COLLECTION,
    title,
    synopsis: clampText(r.synopsis, LIMITS.synopsis),
    cover: isImageBlob(r.cover) ? r.cover : undefined,
    genres: Array.isArray(r.genres)
      ? [
          ...new Set<string>(
            r.genres.filter((g: unknown) => GENRE_IDS.has(g as string)),
          ),
        ].slice(0, LIMITS.genres)
      : [],
    tags: Array.isArray(r.tags)
      ? [
          ...new Set(
            r.tags
              .map((t: unknown) => clampText(t, LIMITS.tag)?.toLowerCase())
              .filter((t: string | undefined): t is string => !!t),
          ),
        ].slice(0, LIMITS.tags)
      : [],
    language: clampText(r.language, 8),
    maturity: MATURITIES.has(r.maturity) ? r.maturity : 'general',
    status: STATUSES.has(r.status) ? r.status : 'ongoing',
    visibility: VISIBILITIES.has(r.visibility) ? r.visibility : 'public',
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : '',
  }
}

export function normalizeChapter(
  raw: unknown,
  ownerDid: string,
): ChapterRecord | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, any>
  // A chapter can only belong to a book of the same author.
  if (!isBookUri(r.book, ownerDid)) return undefined
  const number = Number(r.number)
  if (!Number.isInteger(number) || number < 1) return undefined
  const published = r.status === 'published'
  return {
    $type: CHAPTER_COLLECTION,
    book: r.book,
    number,
    title: clampText(r.title, LIMITS.chapterTitle) ?? `Capítulo ${number}`,
    body: typeof r.body === 'string' ? r.body.slice(0, LIMITS.chapterBody) : '',
    authorNote: clampText(r.authorNote, LIMITS.authorNote),
    status: published ? 'published' : 'draft',
    publishedAt:
      published && typeof r.publishedAt === 'string'
        ? r.publishedAt
        : undefined,
    threadUri: isPostUri(r.threadUri, ownerDid) ? r.threadUri : undefined,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : '',
  }
}

/** Ready to write: timestamps set, undefined/empty fields dropped. */
export function toWritable<T extends BookRecord | ChapterRecord>(
  draft: T,
  now = new Date(),
): T {
  const ts = now.toISOString()
  return Object.fromEntries(
    Object.entries({
      ...draft,
      createdAt: draft.createdAt || ts,
      updatedAt: ts,
    }).filter(([, v]) => v !== undefined && v !== ''),
  ) as T
}

/** Publishing a chapter stamps publishedAt once and never rewrites it. */
export function publishChapter(
  chapter: ChapterRecord,
  now = new Date(),
): ChapterRecord {
  return {
    ...chapter,
    status: 'published',
    publishedAt: chapter.publishedAt || now.toISOString(),
  }
}

export type ValidationIssue =
  | 'title_required'
  | 'body_required'
  | 'body_too_long'

export function validateChapterForPublish(c: ChapterRecord): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!c.title.trim()) issues.push('title_required')
  if (!c.body.trim()) issues.push('body_required')
  if (c.body.length > LIMITS.chapterBody) issues.push('body_too_long')
  return issues
}

/**
 * What a viewer may read. Drafts are owner-only; private books are
 * owner-only; unlisted books open by link but never appear in discovery.
 */
export function bookAccess(input: {
  book: BookRecord | undefined
  isOwner: boolean
  moderated: boolean
}): 'none' | 'suspended' | 'unavailable' | 'visible' {
  if (input.moderated) return 'suspended'
  if (!input.book) return 'none'
  if (!input.isOwner && input.book.visibility === 'private')
    return 'unavailable'
  return 'visible'
}

export function chapterAccess(input: {
  chapter: ChapterRecord | undefined
  isOwner: boolean
}): 'none' | 'unavailable' | 'visible' {
  if (!input.chapter) return 'none'
  if (!input.isOwner && input.chapter.status !== 'published')
    return 'unavailable'
  return 'visible'
}

export function isDiscoverable(book: BookRecord) {
  return book.visibility === 'public'
}

/** Published chapters in reading order (owner also sees drafts). */
export function orderedChapters(
  chapters: ChapterRecord[],
  includeDrafts: boolean,
): ChapterRecord[] {
  return chapters
    .filter(c => includeDrafts || c.status === 'published')
    .sort((a, b) => a.number - b.number)
}

export function nextChapterNumber(chapters: ChapterRecord[]) {
  return chapters.reduce((max, c) => Math.max(max, c.number), 0) + 1
}

/** Previous / next published chapter for the reader footer. */
export function neighbors(chapters: ChapterRecord[], number: number) {
  const list = orderedChapters(chapters, false)
  const i = list.findIndex(c => c.number === number)
  return {
    prev: i > 0 ? list[i - 1] : undefined,
    next: i >= 0 && i < list.length - 1 ? list[i + 1] : undefined,
  }
}

export function countWords(text: string) {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

/** Minutes at ~230 wpm, never below 1 for non-empty text. */
export function readingMinutes(text: string) {
  const words = countWords(text)
  return words === 0 ? 0 : Math.max(1, Math.round(words / 230))
}

/**
 * Thread mode: splits a chapter into short parts at paragraph boundaries,
 * about `size` characters each. A paragraph longer than `size` is split on
 * sentence ends, then on spaces; text is never dropped or reordered, so
 * parts.join('\n\n') always reproduces the same words.
 */
export function splitIntoParts(body: string, size = LIMITS.partSize): string[] {
  const paragraphs = body
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
  const pieces: string[] = []
  for (const p of paragraphs) {
    if (p.length <= size) {
      pieces.push(p)
      continue
    }
    let current = ''
    for (const sentence of p.match(
      /[^.!?…]+[.!?…]+["”')\]]*\s*|[^.!?…]+$/g,
    ) ?? [p]) {
      if (sentence.length > size) {
        if (current.trim()) pieces.push(current.trim())
        current = ''
        let rest = sentence.trim()
        while (rest.length > size) {
          const cut = rest.lastIndexOf(' ', size)
          const at = cut > 0 ? cut : size
          pieces.push(rest.slice(0, at).trim())
          rest = rest.slice(at).trim()
        }
        current = rest
      } else if ((current + sentence).length > size && current) {
        pieces.push(current.trim())
        current = sentence
      } else {
        current += sentence
      }
    }
    if (current.trim()) pieces.push(current.trim())
  }
  // Merge tiny neighbours so the thread has no one-line stubs.
  const parts: string[] = []
  for (const piece of pieces) {
    const last = parts[parts.length - 1]
    if (last && last.length < size * 0.4 && (last + piece).length <= size) {
      parts[parts.length - 1] = `${last}\n\n${piece}`
    } else {
      parts.push(piece)
    }
  }
  return parts
}

/* ------------------------------------------------------------------ */
/* Routes & sharing                                                    */
/* ------------------------------------------------------------------ */

export function bookPath(handle: string, bookRkey: string) {
  return `/books/${encodeURIComponent(handle)}/${encodeURIComponent(bookRkey)}`
}

export function chapterPath(
  handle: string,
  bookRkey: string,
  chapterRkey: string,
) {
  return `${bookPath(handle, bookRkey)}/${encodeURIComponent(chapterRkey)}`
}

export function rkeyOf(uri: string) {
  return uri.split('/').pop() ?? ''
}

/**
 * Card written to the main AQUA feed when a chapter is shared. It is an
 * app.bsky.embed.external, so any client renders it; the text is the
 * author's own words (optional) and never carries the chapter body.
 */
export function buildShareCard(input: {
  book: BookRecord
  chapter: ChapterRecord
  url: string
}) {
  const {book, chapter, url} = input
  const preview = chapter.body.replace(/\s+/g, ' ').trim()
  return {
    uri: url,
    title: `${book.title} · Cap. ${chapter.number}: ${chapter.title}`.slice(
      0,
      200,
    ),
    description:
      preview.length > LIMITS.sharePreview
        ? `${preview.slice(0, LIMITS.sharePreview - 1).trimEnd()}…`
        : preview,
    thumb: book.cover,
  }
}

/** Text of the announcement post created when a chapter is published. */
export function announcementText(input: {
  book: BookRecord
  chapter: ChapterRecord
  note?: string
}) {
  const head = `Novo capítulo de ${input.book.title}: ${input.chapter.number}. ${input.chapter.title}`
  const note = input.note?.trim()
  return (note ? `${note}\n\n${head}` : head).slice(0, 300)
}
