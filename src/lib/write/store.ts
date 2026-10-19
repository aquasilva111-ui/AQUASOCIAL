/**
 * Local Write repository.
 *
 * Persists to localStorage on web under `aqua.write.v1`. Native keeps the
 * seed in memory for the session. Bump STORAGE_VERSION when the seed shape
 * changes so old example data does not shadow a new catalog.
 */

import {useSyncExternalStore} from 'react'

import {readingMinutes, splitIntoParts} from '#/lib/books/model'
import {type WriteRepository} from '#/lib/write/repository'
import {createSeed} from '#/lib/write/seed'
import {
  attribute,
  type ContentOrigin,
  DEFAULT_CONTROLS,
  type ReadingProgress,
  type RoyaltyAttribution,
  type WriteChapter,
  type WriteControls,
  type WriteDraft,
  type WriteEvent,
  type WritePost,
  type WriteTrend,
} from '#/lib/write/types'

const STORAGE_KEY = 'aqua.write.v1'
const STORAGE_VERSION = 1

type Snapshot = {
  posts: WritePost[]
  chapters: WriteChapter[]
  progress: ReadingProgress[]
  events: WriteEvent[]
  controls: WriteControls
  drafts: WriteDraft[]
  library: string[]
  likedPostIds: string[]
  repostedPostIds: string[]
  savedPostIds: string[]
  trends: WriteTrend[]
  readingMode: 'thread' | 'page'
}

const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function emptySnapshot(): Snapshot {
  const seed = createSeed()
  return {
    posts: seed.posts,
    chapters: seed.chapters,
    progress: [{bookId: 'sample-tide', chapterNumber: 7, partIndex: 0}],
    events: seed.events,
    controls: {...DEFAULT_CONTROLS},
    drafts: [],
    library: [],
    likedPostIds: [],
    repostedPostIds: [],
    savedPostIds: [],
    trends: seed.trends,
    readingMode: 'thread',
  }
}

function readStorage(): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStorage(value: string) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // Private mode and full disks should not break the feed.
  }
}

function hydrate(): Snapshot {
  const fresh = emptySnapshot()
  const raw = readStorage()
  if (!raw) return fresh
  try {
    const parsed = JSON.parse(raw) as {version?: number; snapshot?: Snapshot}
    if (parsed.version !== STORAGE_VERSION || !parsed.snapshot?.posts) {
      return fresh
    }
    return {
      ...fresh,
      ...parsed.snapshot,
      controls: {...fresh.controls, ...parsed.snapshot.controls},
      readingMode: parsed.snapshot.readingMode ?? 'thread',
    }
  } catch {
    return fresh
  }
}

let snapshot: Snapshot = hydrate()

function persist() {
  writeStorage(JSON.stringify({version: STORAGE_VERSION, snapshot}))
}

function update(recipe: (current: Snapshot) => Snapshot) {
  snapshot = recipe(snapshot)
  persist()
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return snapshot
}

export function useWriteSnapshot(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

function originFromDraft(draft: WriteDraft, authorId: string): ContentOrigin {
  if (draft.originKind === 'original') {
    return {kind: 'original', authorId}
  }
  return {
    kind: draft.originKind,
    authorId,
    sourceCredit: draft.sourceCredit?.trim() || 'Uncredited source',
  }
}

function attributionFor(
  draft: WriteDraft,
  authorId: string,
): RoyaltyAttribution {
  return attribute(originFromDraft(draft, authorId))
}

function nextChapterNumber(chapters: WriteChapter[], bookId: string): number {
  const numbers = chapters
    .filter(item => item.bookId === bookId)
    .map(item => item.number)
  return numbers.length === 0 ? 1 : Math.max(...numbers) + 1
}

export const writeRepository: WriteRepository = {
  listPosts: () => snapshot.posts,
  getChapter: id => snapshot.chapters.find(item => item.id === id),
  chaptersForBook: bookId =>
    snapshot.chapters
      .filter(item => item.bookId === bookId)
      .slice()
      .sort((a, b) => a.number - b.number),
  progressFor: bookId => snapshot.progress.find(item => item.bookId === bookId),
  events: () => snapshot.events,
  controls: () => snapshot.controls,
  readingMode: () => snapshot.readingMode,
  setReadingMode: mode => {
    update(current => ({...current, readingMode: mode}))
  },
  trends: () => snapshot.trends,
  library: () => snapshot.library,
  likedPostIds: () => snapshot.likedPostIds,
  repostedPostIds: () => snapshot.repostedPostIds,
  savedPostIds: () => snapshot.savedPostIds,
  setControls: patch => {
    update(current => ({
      ...current,
      controls: {...current.controls, ...patch},
    }))
  },
  recordEvent: event => {
    update(current => ({
      ...current,
      events: [{at: new Date().toISOString(), ...event}, ...current.events],
    }))
  },
  setProgress: progress => {
    const previous = snapshot.progress.find(
      item => item.bookId === progress.bookId,
    )
    if (
      previous &&
      previous.chapterNumber === progress.chapterNumber &&
      previous.partIndex === progress.partIndex
    ) {
      return
    }
    update(current => ({
      ...current,
      progress: [
        progress,
        ...current.progress.filter(item => item.bookId !== progress.bookId),
      ],
      posts: current.posts.map(post => {
        if (post.type !== 'book' || post.book.id !== progress.bookId)
          return post
        const finished = Math.max(
          post.book.chaptersRead,
          progress.chapterNumber - 1,
        )
        return {
          ...post,
          book: {
            ...post.book,
            chaptersRead: Math.min(finished, post.book.chapterCount),
          },
        }
      }),
    }))
  },
  toggleLibrary: bookId => {
    const has = snapshot.library.includes(bookId)
    update(current => ({
      ...current,
      library: has
        ? current.library.filter(id => id !== bookId)
        : [...current.library, bookId],
    }))
    writeRepository.recordEvent({
      kind: 'save',
      bookId,
    })
    return !has
  },
  toggleLike: postId => {
    update(current => {
      const liked = current.likedPostIds.includes(postId)
      return {
        ...current,
        likedPostIds: liked
          ? current.likedPostIds.filter(id => id !== postId)
          : [...current.likedPostIds, postId],
        posts: current.posts.map(post =>
          post.id === postId
            ? {
                ...post,
                engagement: {
                  ...post.engagement,
                  likes: post.engagement.likes + (liked ? -1 : 1),
                },
              }
            : post,
        ),
      }
    })
    if (snapshot.likedPostIds.includes(postId)) {
      const post = snapshot.posts.find(item => item.id === postId)
      writeRepository.recordEvent({
        kind: 'like',
        postId,
        authorId: post?.author.id,
        bookId: post?.type === 'book' ? post.book.id : undefined,
      })
    }
  },
  toggleRepost: postId => {
    update(current => {
      const on = current.repostedPostIds.includes(postId)
      return {
        ...current,
        repostedPostIds: on
          ? current.repostedPostIds.filter(id => id !== postId)
          : [...current.repostedPostIds, postId],
        posts: current.posts.map(post =>
          post.id === postId
            ? {
                ...post,
                engagement: {
                  ...post.engagement,
                  reposts: post.engagement.reposts + (on ? -1 : 1),
                },
              }
            : post,
        ),
      }
    })
  },
  toggleSave: postId => {
    update(current => {
      const on = current.savedPostIds.includes(postId)
      return {
        ...current,
        savedPostIds: on
          ? current.savedPostIds.filter(id => id !== postId)
          : [...current.savedPostIds, postId],
      }
    })
    if (snapshot.savedPostIds.includes(postId)) {
      const post = snapshot.posts.find(item => item.id === postId)
      writeRepository.recordEvent({
        kind: 'save',
        postId,
        bookId: post?.type === 'book' ? post.book.id : undefined,
      })
    }
  },
  togglePartLike: (chapterId, partIndex) => {
    update(current => ({
      ...current,
      chapters: current.chapters.map(chapter => {
        if (chapter.id !== chapterId) return chapter
        return {
          ...chapter,
          parts: chapter.parts.map(part =>
            part.index === partIndex ? {...part, likes: part.likes + 1} : part,
          ),
        }
      }),
    }))
  },
  togglePartSave: (chapterId, partIndex) => {
    update(current => ({
      ...current,
      chapters: current.chapters.map(chapter => {
        if (chapter.id !== chapterId) return chapter
        return {
          ...chapter,
          parts: chapter.parts.map(part =>
            part.index === partIndex ? {...part, saved: !part.saved} : part,
          ),
        }
      }),
    }))
  },
  addComment: (chapterId, partIndex, text, author) => {
    const trimmed = text.trim()
    if (!trimmed) return
    update(current => ({
      ...current,
      chapters: current.chapters.map(chapter => {
        if (chapter.id !== chapterId) return chapter
        return {
          ...chapter,
          parts: chapter.parts.map(part =>
            part.index === partIndex
              ? {...part, replies: part.replies + 1}
              : part,
          ),
          comments: [
            ...chapter.comments,
            {
              id: `comment-${Date.now()}`,
              partIndex,
              authorName: author.displayName,
              authorColor: author.color,
              text: trimmed,
            },
          ],
        }
      }),
    }))
  },
  publish: (draft, author) => {
    let createdAt = new Date().toISOString()
    if (draft.scheduledFor?.trim()) {
      const parsed = Date.parse(draft.scheduledFor)
      if (Number.isNaN(parsed)) return undefined
      createdAt = new Date(parsed).toISOString()
    }
    const id = `local-${Date.now()}`
    const attribution = attributionFor(draft, author.id)
    let post: WritePost | undefined
    let extraChapter: WriteChapter | undefined
    if (draft.type === 'book') {
      const parts = draft.parts.map(part => part.trim()).filter(Boolean)
      if (!draft.chapterTitle?.trim() || parts.length === 0) return undefined
      const existing = snapshot.posts.find(
        item => item.type === 'book' && item.book.id === draft.bookId,
      )
      const bookId =
        existing && existing.type === 'book' ? existing.book.id : `book-${id}`
      const title =
        existing && existing.type === 'book'
          ? existing.book.title
          : draft.newBookTitle?.trim() || 'Untitled book'
      const number = nextChapterNumber(snapshot.chapters, bookId)
      const chapterId = `${bookId}-ch${number}-${id}`
      const body = parts.join('\n\n')
      extraChapter = {
        id: chapterId,
        bookId,
        number,
        title: draft.chapterTitle.trim(),
        author,
        parts: parts.map((text, index) => ({
          id: `${chapterId}-p${index + 1}`,
          index,
          text,
          replies: 0,
          likes: 0,
          saved: false,
        })),
        readMinutes: readingMinutes(body),
        attribution,
        comments: [],
        commentsPerPart: draft.commentsPerPart,
      }
      const previousCount =
        existing && existing.type === 'book' ? existing.book.chapterCount : 0
      post = {
        id,
        type: 'book',
        author,
        createdAt,
        language: 'en',
        text: `Published Chapter ${number} of ${title}`,
        engagement: {replies: 0, reposts: 0, likes: 0},
        attribution,
        book: {
          id: bookId,
          title,
          genres: draft.genres,
          status: 'ongoing',
          chapterCount: previousCount + 1,
          chaptersRead:
            existing && existing.type === 'book'
              ? existing.book.chaptersRead
              : 0,
          fanfic:
            draft.genres.includes('fanfic') ||
            draft.originKind === 'derivative',
        },
        chapter: {
          id: chapterId,
          bookId,
          number,
          title: draft.chapterTitle.trim(),
          partCount: parts.length,
          readMinutes: extraChapter.readMinutes,
        },
      }
    } else if (draft.type === 'article') {
      const title = draft.articleTitle?.trim()
      const body = draft.body?.trim()
      if (!title || !body) return undefined
      post = {
        id,
        type: 'article',
        author,
        createdAt,
        language: 'en',
        title,
        subtitle: draft.subtitle?.trim() || body.slice(0, 180),
        body,
        tags: draft.tags,
        readMinutes: readingMinutes(body),
        engagement: {replies: 0, reposts: 0, likes: 0},
        attribution,
      }
    } else if (draft.type === 'opinion') {
      const text = draft.opinion?.trim()
      if (!text) return undefined
      post = {
        id,
        type: 'opinion',
        author,
        createdAt,
        language: 'en',
        text: text.slice(0, 600),
        quote: draft.quoteText?.trim()
          ? {
              text: draft.quoteText.trim(),
              url: draft.quoteUrl?.trim() || undefined,
            }
          : undefined,
        engagement: {replies: 0, reposts: 0, likes: 0},
        attribution,
      }
    } else {
      const title = draft.recipeTitle?.trim()
      const steps = draft.steps.map(step => step.trim()).filter(Boolean)
      if (!title || steps.length === 0) return undefined
      post = {
        id,
        type: 'recipe',
        author,
        createdAt,
        language: 'en',
        title,
        prepMinutes: draft.prepMinutes ?? 0,
        cookMinutes: draft.cookMinutes ?? 0,
        servings: draft.servings ?? 1,
        difficulty: draft.difficulty ?? 'easy',
        ingredients: draft.ingredients.map(item => item.trim()).filter(Boolean),
        steps,
        tags: draft.tags,
        engagement: {replies: 0, reposts: 0, likes: 0},
        attribution,
      }
    }
    if (!post) return undefined
    update(current => ({
      ...current,
      posts: [post!, ...current.posts],
      chapters: extraChapter
        ? [...current.chapters, extraChapter]
        : current.chapters,
      drafts: current.drafts.filter(item => item.id !== draft.id),
    }))
    return post
  },
  saveDraft: draft => {
    update(current => ({
      ...current,
      drafts: [draft, ...current.drafts.filter(item => item.id !== draft.id)],
    }))
  },
}

export function blankDraft(type: WritePost['type'] = 'book'): WriteDraft {
  return {
    id: `draft-${Date.now()}`,
    type,
    updatedAt: new Date().toISOString(),
    bookId: 'sample-tide',
    chapterTitle: '',
    genres: type === 'book' ? ['fantasy'] : [],
    parts: ['', ''],
    tags: [],
    ingredients: [''],
    steps: [''],
    originKind: 'original',
    contentWarning: 'none',
    commentsPerPart: true,
    difficulty: 'easy',
    prepMinutes: 10,
    cookMinutes: 15,
    servings: 4,
  }
}

export function splitDraftParts(parts: string[]): string[] {
  const joined = parts
    .map(part => part.trim())
    .filter(Boolean)
    .join('\n\n')
  const split = splitIntoParts(joined)
  return split.length > 0 ? split : ['']
}

/** Test hook. Production screens should not reset the reader's library. */
export function resetWriteStore() {
  snapshot = emptySnapshot()
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }
  emit()
}
