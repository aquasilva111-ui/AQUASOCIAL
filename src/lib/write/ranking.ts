/**
 * Write feed ordering — Convenções de Realidade (Aqua).
 *
 * Pipeline, in this order:
 *
 *   events → conventions → ranking
 *
 * 1. Events
 *    Explicit interactions recorded inside Aqua: follow, like, save,
 *    read_to_end, continue_reading, and view. A finished read is an event.
 *    A glance is only a view. Nothing here is an advertising profile, and
 *    no signal from outside Aqua is accepted.
 *
 * 2. Conventions
 *    Shared, auditable weights in {@link CONVENTION_WEIGHTS}. They turn
 *    events into a bounded signal. A finished read outranks a view. The
 *    algorithm team tunes these constants; the screens do not encode them.
 *
 * 3. Ranking
 *    Score = recency + the convention weights of events tied to the post,
 *    its author, or its book. Then two placement passes:
 *    - Saturation ({@link SATURATION}): cap how many posts from the same
 *      author or the same book may sit in a row.
 *    - Diversity ({@link DIVERSITY}): cap how many posts of the same type
 *      or the same primary genre may sit in a row.
 *    When every remaining candidate would break a cap, the highest score
 *    is placed anyway so a post is never dropped.
 *
 * Explicit controls always run first and always win: search, type chip,
 * genre chip, show-books, show-articles, hide-fanfic, the Following and
 * Continue reading tabs, and chronological order. Chronological order
 * skips scoring, saturation, and diversity.
 *
 * Royalty percentages are not an input. See `attribute` in `./types`.
 */

import {
  bookIdOf,
  genresOf,
  isFanfic,
  postHaystack,
  primaryGenre,
  type WriteEvent,
  type WriteEventKind,
  type WritePost,
  type WriteTab,
  type WriteTypeFilter,
} from '#/lib/write/types'

/**
 * How much each event is worth. Larger means a stronger signal.
 * `read_to_end` must stay above `view`: progress beats a glance.
 */
export const CONVENTION_WEIGHTS: Record<WriteEventKind, number> = {
  read_to_end: 8,
  continue_reading: 6,
  save: 4,
  follow: 3,
  like: 2,
  view: 1,
}

/**
 * Consecutive-post caps. `1` means "do not stack". Raise these to let a
 * prolific author occupy more of the feed.
 */
export const SATURATION = {
  maxConsecutiveAuthor: 1,
  maxConsecutiveBook: 1,
} as const

/**
 * Consecutive-post caps across type and genre. `2` allows a pair, then
 * prefers a different kind when one exists.
 */
export const DIVERSITY = {
  maxConsecutiveType: 2,
  maxConsecutiveGenre: 2,
} as const

/** Half-life-ish window for the recency term, in hours. */
export const RECENCY_WINDOW_HOURS = 18

/** Weight of the recency term relative to convention points. */
export const RECENCY_WEIGHT = 12

export type RankInput = {
  tab: WriteTab
  type: WriteTypeFilter
  /** Genre id from the existing book genre list. `undefined` keeps all. */
  genre?: string
  showBooks: boolean
  showArticles: boolean
  hideFanfic: boolean
  chronological: boolean
  query: string
}

type Scored = {post: WritePost; score: number}

function trailingRun(
  placed: WritePost[],
  same: (post: WritePost) => boolean,
): number {
  let run = 0
  for (let i = placed.length - 1; i >= 0; i--) {
    if (!same(placed[i])) break
    run++
  }
  return run
}

function eventTouches(event: WriteEvent, post: WritePost): boolean {
  if (event.postId && event.postId === post.id) return true
  if (event.authorId && event.authorId === post.author.id) return true
  const bookId = bookIdOf(post)
  if (event.bookId && bookId && event.bookId === bookId) return true
  return false
}

/** Convention points for one post. Exported so the weights can be tested. */
export function conventionScore(post: WritePost, events: WriteEvent[]): number {
  let score = 0
  for (const event of events) {
    if (eventTouches(event, post)) score += CONVENTION_WEIGHTS[event.kind]
  }
  return score
}

function recencyScore(post: WritePost, now: number): number {
  const ageHours = Math.max(0, (now - Date.parse(post.createdAt)) / 3_600_000)
  return RECENCY_WEIGHT / (1 + ageHours / RECENCY_WINDOW_HOURS)
}

/**
 * Filters that the user asked for. Applied before any score so a hidden
 * post cannot be ranked back into view.
 */
export function applyExplicitControls(
  posts: WritePost[],
  input: RankInput,
): WritePost[] {
  const query = input.query.trim().toLowerCase()
  return posts.filter(post => {
    if (input.tab === 'following' && !post.author.followed) return false
    if (input.tab === 'continue') {
      if (post.type !== 'book') return false
      if (post.book.chaptersRead <= 0) return false
      if (post.book.chaptersRead >= post.book.chapterCount) return false
    }
    if (input.type !== 'all' && post.type !== input.type) return false
    if (!input.showBooks && post.type === 'book') return false
    if (!input.showArticles && post.type === 'article') return false
    if (input.hideFanfic && isFanfic(post)) return false
    if (input.genre && !genresOf(post).includes(input.genre)) return false
    if (query && !postHaystack(post).includes(query)) return false
    return true
  })
}

function fits(post: WritePost, placed: WritePost[]): boolean {
  if (placed.length === 0) return true
  const authorRun = trailingRun(
    placed,
    item => item.author.id === post.author.id,
  )
  if (authorRun >= SATURATION.maxConsecutiveAuthor) return false
  const bookId = bookIdOf(post)
  if (bookId) {
    const bookRun = trailingRun(placed, item => bookIdOf(item) === bookId)
    if (bookRun >= SATURATION.maxConsecutiveBook) return false
  }
  const typeRun = trailingRun(placed, item => item.type === post.type)
  if (typeRun >= DIVERSITY.maxConsecutiveType) return false
  const genre = primaryGenre(post)
  if (genre) {
    const genreRun = trailingRun(placed, item => primaryGenre(item) === genre)
    if (genreRun >= DIVERSITY.maxConsecutiveGenre) return false
  }
  return true
}

/**
 * Greedy placement. Candidates are already sorted by score. The first one
 * that respects saturation and diversity wins; otherwise the best score is
 * used so the feed never stalls or drops a post.
 */
function place(scored: Scored[]): WritePost[] {
  const pool = scored.slice()
  const placed: WritePost[] = []
  while (pool.length > 0) {
    const index = pool.findIndex(item => fits(item.post, placed))
    const pick = index === -1 ? 0 : index
    placed.push(pool.splice(pick, 1)[0].post)
  }
  return placed
}

/**
 * Order a Write feed.
 *
 * `now` is injectable so tests and replays stay stable. Screens can omit it.
 */
export function rankWriteFeed(
  posts: WritePost[],
  events: WriteEvent[],
  input: RankInput,
  now = Date.now(),
): WritePost[] {
  const visible = applyExplicitControls(posts, input)
  if (input.chronological) {
    return visible
      .slice()
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  }
  const scored: Scored[] = visible.map(post => ({
    post,
    score: recencyScore(post, now) + conventionScore(post, events),
  }))
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return Date.parse(b.post.createdAt) - Date.parse(a.post.createdAt)
  })
  return place(scored)
}
