/**
 * The only door the Write screens use to load and save posts.
 *
 * `LocalWriteRepository` (see `./store`) is the current implementation:
 * seeded placeholder posts, plus drafts and reactions kept on this device.
 * It exists because article, opinion, and recipe have no AT Protocol lexicon
 * yet. Book records (`place.aqua.book.*`) are unchanged and still power the
 * studio, the collection, and the chapter pages.
 *
 * A future `AtpWriteRepository` should implement this same interface and
 * leave the screens alone. Do not rename `app.bsky` collections to get there.
 */

import {
  type ReadingProgress,
  type WriteAuthor,
  type WriteChapter,
  type WriteControls,
  type WriteDraft,
  type WriteEvent,
  type WritePost,
  type WriteTrend,
} from '#/lib/write/types'

export interface WriteRepository {
  listPosts(): WritePost[]
  getChapter(id: string): WriteChapter | undefined
  chaptersForBook(bookId: string): WriteChapter[]
  progressFor(bookId: string): ReadingProgress | undefined
  events(): WriteEvent[]
  controls(): WriteControls
  readingMode(): 'thread' | 'page'
  setReadingMode(mode: 'thread' | 'page'): void
  trends(): WriteTrend[]
  /** Book ids the reader saved with "+ Library". */
  library(): string[]
  likedPostIds(): string[]
  repostedPostIds(): string[]
  savedPostIds(): string[]
  setControls(patch: Partial<WriteControls>): void
  recordEvent(event: Omit<WriteEvent, 'at'> & {at?: string}): void
  setProgress(progress: ReadingProgress): void
  toggleLibrary(bookId: string): boolean
  toggleLike(postId: string): void
  toggleRepost(postId: string): void
  toggleSave(postId: string): void
  togglePartLike(chapterId: string, partIndex: number): void
  togglePartSave(chapterId: string, partIndex: number): void
  addComment(
    chapterId: string,
    partIndex: number,
    text: string,
    author: WriteAuthor,
  ): void
  publish(draft: WriteDraft, author: WriteAuthor): WritePost | undefined
  saveDraft(draft: WriteDraft): void
}
