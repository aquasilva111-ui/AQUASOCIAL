import {RichText} from '@atproto/api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {uploadBlob} from '#/lib/api'
import {
  announcementText,
  BOOK_COLLECTION,
  type BookBlob,
  type BookRecord,
  buildShareCard,
  CHAPTER_COLLECTION,
  chapterPath,
  type ChapterRecord,
  newReadingRecord,
  normalizeBook,
  normalizeChapter,
  normalizeReading,
  parseBookUri,
  publishChapter,
  READING_COLLECTION,
  rkeyOf,
  toWritable,
  validateChapterForPublish,
} from '#/lib/books/model'
import {compressIfNeeded} from '#/lib/media/manip'
import {type PickerImage} from '#/lib/media/picker.shared'
import {useAgent, useSession} from '#/state/session'

// Public web origin used in shared cards. Overridable for staging.
export const BOOKS_WEB_ORIGIN = 'https://aquaapp.online'

const ROOT = 'books'
export const RQKEY = {
  books: (did: string) => [ROOT, 'books', did],
  book: (did: string, rkey: string) => [ROOT, 'book', did, rkey],
  chapters: (did: string, bookRkey: string) => [
    ROOT,
    'chapters',
    did,
    bookRkey,
  ],
}

export type StoredBook = {
  uri: string
  rkey: string
  did: string
  book: BookRecord
}
export type StoredChapter = {
  uri: string
  rkey: string
  did: string
  chapter: ChapterRecord
}

function isNotFound(e: unknown) {
  const err = e as {error?: string; message?: string}
  return (
    err?.error === 'RecordNotFound' ||
    /could not locate record|RecordNotFound/i.test(err?.message ?? '')
  )
}

/** All records of a collection in one repo, following the cursor. */
async function listAll(
  agent: ReturnType<typeof useAgent>,
  did: string,
  collection: string,
  maxPages = 10,
) {
  const out: {uri: string; value: unknown}[] = []
  let cursor: string | undefined
  for (let i = 0; i < maxPages; i++) {
    const {data} = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection,
      limit: 100,
      cursor,
    })
    out.push(...data.records)
    cursor = data.cursor
    if (!cursor) break
  }
  return out
}

/** Books of an author. Non-owners never get private books. */
export function useAuthorBooksQuery(did: string | undefined) {
  const agent = useAgent()
  const {currentAccount} = useSession()
  const isOwner = !!did && currentAccount?.did === did
  return useQuery<StoredBook[]>({
    queryKey: RQKEY.books(did ?? ''),
    enabled: !!did,
    staleTime: 30_000,
    queryFn: async () => {
      if (!did) return []
      const records = await listAll(agent, did, BOOK_COLLECTION)
      return records
        .map(r => ({r, book: normalizeBook(r.value)}))
        .filter(
          (x): x is {r: typeof x.r; book: BookRecord} =>
            !!x.book && (isOwner || x.book.visibility !== 'private'),
        )
        .map(({r, book}) => ({uri: r.uri, rkey: rkeyOf(r.uri), did, book}))
        .sort((a, b) => b.book.updatedAt.localeCompare(a.book.updatedAt))
    },
  })
}

export function useBookQuery(
  did: string | undefined,
  rkey: string | undefined,
) {
  const agent = useAgent()
  return useQuery<StoredBook | undefined>({
    queryKey: RQKEY.book(did ?? '', rkey ?? ''),
    enabled: !!did && !!rkey,
    staleTime: 30_000,
    queryFn: async () => {
      if (!did || !rkey) return undefined
      try {
        const {data} = await agent.com.atproto.repo.getRecord({
          repo: did,
          collection: BOOK_COLLECTION,
          rkey,
        })
        const book = normalizeBook(data.value)
        return book ? {uri: data.uri, rkey, did, book} : undefined
      } catch (e) {
        if (isNotFound(e)) return undefined
        throw e
      }
    },
  })
}

/** Chapters of one book, reading order. Drafts only for the owner. */
export function useChaptersQuery(
  did: string | undefined,
  bookRkey: string | undefined,
) {
  const agent = useAgent()
  const {currentAccount} = useSession()
  const isOwner = !!did && currentAccount?.did === did
  return useQuery<StoredChapter[]>({
    queryKey: [...RQKEY.chapters(did ?? '', bookRkey ?? ''), isOwner],
    enabled: !!did && !!bookRkey,
    staleTime: 30_000,
    queryFn: async () => {
      if (!did || !bookRkey) return []
      const bookUri = `at://${did}/${BOOK_COLLECTION}/${bookRkey}`
      const records = await listAll(agent, did, CHAPTER_COLLECTION)
      return records
        .map(r => ({r, chapter: normalizeChapter(r.value, did)}))
        .filter(
          (x): x is {r: typeof x.r; chapter: ChapterRecord} =>
            !!x.chapter &&
            x.chapter.book === bookUri &&
            (isOwner || x.chapter.status === 'published'),
        )
        .map(({r, chapter}) => ({
          uri: r.uri,
          rkey: rkeyOf(r.uri),
          did,
          chapter,
        }))
        .sort((a, b) => a.chapter.number - b.chapter.number)
    },
  })
}

function useOwnDid() {
  const {currentAccount} = useSession()
  return () => {
    if (!currentAccount) throw new Error('not_signed_in')
    return currentAccount.did
  }
}

/** Creates a book (no rkey → PDS assigns a TID) or updates it in place. */
export function useSaveBookMutation() {
  const agent = useAgent()
  const ownDid = useOwnDid()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {rkey?: string; draft: BookRecord}) => {
      const repo = ownDid()
      const record = toWritable(input.draft)
      if (input.rkey) {
        await agent.com.atproto.repo.putRecord({
          repo,
          collection: BOOK_COLLECTION,
          rkey: input.rkey,
          record: record as unknown as Record<string, unknown>,
        })
        return {uri: `at://${repo}/${BOOK_COLLECTION}/${input.rkey}`}
      }
      const {data} = await agent.com.atproto.repo.createRecord({
        repo,
        collection: BOOK_COLLECTION,
        record: record as unknown as Record<string, unknown>,
      })
      return {uri: data.uri}
    },
    onSuccess: () => {
      qc.invalidateQueries({queryKey: [ROOT]})
    },
  })
}

export function useDeleteBookMutation() {
  const agent = useAgent()
  const ownDid = useOwnDid()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {rkey: string; chapterRkeys: string[]}) => {
      const repo = ownDid()
      // Chapters first so a failure never leaves a book pointing at nothing.
      for (const rkey of input.chapterRkeys) {
        await agent.com.atproto.repo.deleteRecord({
          repo,
          collection: CHAPTER_COLLECTION,
          rkey,
        })
      }
      await agent.com.atproto.repo.deleteRecord({
        repo,
        collection: BOOK_COLLECTION,
        rkey: input.rkey,
      })
    },
    onSuccess: () => qc.invalidateQueries({queryKey: [ROOT]}),
  })
}

/** Saves a chapter as draft (or updates it). Never posts anything. */
export function useSaveChapterMutation() {
  const agent = useAgent()
  const ownDid = useOwnDid()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {rkey?: string; draft: ChapterRecord}) => {
      const repo = ownDid()
      const record = toWritable(input.draft)
      if (input.rkey) {
        await agent.com.atproto.repo.putRecord({
          repo,
          collection: CHAPTER_COLLECTION,
          rkey: input.rkey,
          record: record as unknown as Record<string, unknown>,
        })
        return {uri: `at://${repo}/${CHAPTER_COLLECTION}/${input.rkey}`}
      }
      const {data} = await agent.com.atproto.repo.createRecord({
        repo,
        collection: CHAPTER_COLLECTION,
        record: record as unknown as Record<string, unknown>,
      })
      return {uri: data.uri}
    },
    onSuccess: () => qc.invalidateQueries({queryKey: [ROOT]}),
  })
}

async function createCardPost(
  agent: ReturnType<typeof useAgent>,
  repo: string,
  text: string,
  card: ReturnType<typeof buildShareCard>,
) {
  const rt = new RichText({text})
  await rt.detectFacets(agent)
  const {uri} = await agent.post({
    text: rt.text,
    facets: rt.facets,
    embed: {
      $type: 'app.bsky.embed.external',
      external: {
        uri: card.uri,
        title: card.title,
        description: card.description,
        // Same-repo blob reference: the cover already lives in this PDS.
        ...(card.thumb ? {thumb: card.thumb as unknown as BookBlob} : {}),
      },
    } as any,
    createdAt: new Date().toISOString(),
  })
  return uri
}

/**
 * Publishes a chapter. With `announce` it also creates the announcement
 * post (a card in the author's feed) and stores its URI in the chapter, so
 * that post's replies become the chapter's comment thread.
 */
export function usePublishChapterMutation() {
  const agent = useAgent()
  const {currentAccount} = useSession()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      rkey: string
      book: BookRecord
      bookRkey: string
      chapter: ChapterRecord
      announce: boolean
      note?: string
    }) => {
      if (!currentAccount) throw new Error('not_signed_in')
      const issues = validateChapterForPublish(input.chapter)
      if (issues.length) throw new Error(issues[0])
      if (input.book.visibility === 'private') throw new Error('book_private')

      let published = publishChapter(input.chapter)
      if (input.announce && !published.threadUri) {
        const url = `${BOOKS_WEB_ORIGIN}${chapterPath(
          currentAccount.handle,
          input.bookRkey,
          input.rkey,
        )}`
        const card = buildShareCard({
          book: input.book,
          chapter: published,
          url,
        })
        const threadUri = await createCardPost(
          agent,
          currentAccount.did,
          announcementText({
            book: input.book,
            chapter: published,
            note: input.note,
          }),
          card,
        )
        published = {...published, threadUri}
      }
      await agent.com.atproto.repo.putRecord({
        repo: currentAccount.did,
        collection: CHAPTER_COLLECTION,
        rkey: input.rkey,
        record: toWritable(published) as unknown as Record<string, unknown>,
      })
      return published
    },
    onSuccess: () => qc.invalidateQueries({queryKey: [ROOT]}),
  })
}

/** "Share to AQUA feed": a new post with the chapter card, on demand. */
export function useShareChapterMutation() {
  const agent = useAgent()
  const {currentAccount} = useSession()
  return useMutation({
    mutationFn: async (input: {
      authorHandle: string
      bookRkey: string
      chapterRkey: string
      book: BookRecord
      chapter: ChapterRecord
      text?: string
    }) => {
      if (!currentAccount) throw new Error('not_signed_in')
      if (
        input.chapter.status !== 'published' ||
        input.book.visibility !== 'public'
      )
        throw new Error('not_shareable')
      const card = buildShareCard({
        book: input.book,
        chapter: input.chapter,
        url: `${BOOKS_WEB_ORIGIN}${chapterPath(
          input.authorHandle,
          input.bookRkey,
          input.chapterRkey,
        )}`,
      })
      const uri = await createCardPost(
        agent,
        currentAccount.did,
        (input.text ?? '').trim().slice(0, 300),
        card,
      )
      return {uri}
    },
  })
}

export function useDeleteChapterMutation() {
  const agent = useAgent()
  const ownDid = useOwnDid()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {rkey: string}) => {
      await agent.com.atproto.repo.deleteRecord({
        repo: ownDid(),
        collection: CHAPTER_COLLECTION,
        rkey: input.rkey,
      })
    },
    onSuccess: () => qc.invalidateQueries({queryKey: [ROOT]}),
  })
}

/** Cover image → blob in the author's PDS (no separate file store). */
export function useUploadCoverMutation() {
  const agent = useAgent()
  return useMutation({
    mutationFn: async (image: PickerImage) => {
      const compressed = await compressIfNeeded(image)
      const {data} = await uploadBlob(agent, compressed.path, compressed.mime)
      return {
        blob: JSON.parse(JSON.stringify(data.blob)) as BookBlob,
        localUri: compressed.path,
      }
    },
  })
}

function getPdsEndpoint(didDoc: unknown): string | undefined {
  const services = (didDoc as {service?: unknown} | undefined)?.service
  if (!Array.isArray(services)) return undefined
  const pds = services.find(
    (svc): svc is {id: string; serviceEndpoint: string} =>
      !!svc &&
      typeof svc === 'object' &&
      (svc as {id?: string}).id === '#atproto_pds',
  )
  return pds?.serviceEndpoint
}

/** The author's PDS, where cover blobs are served from. */
export function useAuthorPdsQuery(did: string | undefined) {
  const agent = useAgent()
  return useQuery<string | undefined>({
    queryKey: [ROOT, 'pds', did ?? ''],
    enabled: !!did,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      if (!did) return undefined
      const {data} = await agent.com.atproto.repo.describeRepo({repo: did})
      return getPdsEndpoint(data.didDoc)
    },
  })
}

export function coverUrl(
  pdsUrl: string | undefined,
  did: string,
  blob: BookBlob | undefined,
) {
  if (!pdsUrl || !blob) return undefined
  return `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(blob.ref.$link)}`
}

export type BookWithLatest = StoredBook & {latest?: StoredChapter}

/**
 * "Novos capítulos" for the Books home. There is no indexer yet, so this
 * reads the books of the people the signed-in account follows (first 40)
 * plus the account's own, newest chapter first. Bounded: 6 requests in
 * flight, public books with at least one published chapter only.
 */
export function useFollowedBooksQuery() {
  const agent = useAgent()
  const {currentAccount} = useSession()
  return useQuery<BookWithLatest[]>({
    queryKey: [ROOT, 'followed', currentAccount?.did ?? ''],
    enabled: !!currentAccount,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      if (!currentAccount) return []
      const {data} = await agent.app.bsky.graph.getFollows({
        actor: currentAccount.did,
        limit: 40,
      })
      const dids = [currentAccount.did, ...data.follows.map(f => f.did)]
      const out: BookWithLatest[] = []
      const queue = [...dids]
      const worker = async () => {
        for (let did = queue.shift(); did; did = queue.shift()) {
          try {
            const [books, chapters] = await Promise.all([
              listAll(agent, did, BOOK_COLLECTION, 1),
              listAll(agent, did, CHAPTER_COLLECTION, 2),
            ])
            const parsedChapters = chapters
              .map(r => ({r, chapter: normalizeChapter(r.value, did)}))
              .filter(
                (x): x is {r: typeof x.r; chapter: ChapterRecord} =>
                  !!x.chapter && x.chapter.status === 'published',
              )
            for (const r of books) {
              const book = normalizeBook(r.value)
              if (!book || book.visibility !== 'public') continue
              const latest = parsedChapters
                .filter(c => c.chapter.book === r.uri)
                .sort((a, b) => b.chapter.number - a.chapter.number)[0]
              if (!latest) continue
              out.push({
                uri: r.uri,
                rkey: rkeyOf(r.uri),
                did,
                book,
                latest: {
                  uri: latest.r.uri,
                  rkey: rkeyOf(latest.r.uri),
                  did,
                  chapter: latest.chapter,
                },
              })
            }
          } catch {
            // One unreachable repo must not hide everyone else's books.
          }
        }
      }
      await Promise.all(Array.from({length: 6}, worker))
      return out.sort((a, b) =>
        (b.latest?.chapter.publishedAt ?? '').localeCompare(
          a.latest?.chapter.publishedAt ?? '',
        ),
      )
    },
  })
}

export type ReadingEntry = {
  uri: string
  rkey: string
  /** at:// URI of the book. */
  bookUri: string
  /** Undefined when the book is gone or hidden from this viewer. */
  stored?: StoredBook
}

const READING_LIMIT = 30

/** Books a person is reading, newest first. */
export function useReadingQuery(did: string | undefined) {
  const agent = useAgent()
  const {currentAccount} = useSession()
  return useQuery<ReadingEntry[]>({
    queryKey: [ROOT, 'reading', did ?? ''],
    enabled: !!did,
    staleTime: 30_000,
    queryFn: async () => {
      if (!did) return []
      const records = await listAll(agent, did, READING_COLLECTION, 1)
      const entries = records
        .map(r => ({r, reading: normalizeReading(r.value)}))
        .filter(
          (x): x is {r: typeof x.r; reading: NonNullable<typeof x.reading>} =>
            !!x.reading,
        )
        .sort((a, b) => b.reading.createdAt.localeCompare(a.reading.createdAt))
        .slice(0, READING_LIMIT)
      return Promise.all(
        entries.map(async ({r, reading}): Promise<ReadingEntry> => {
          const base = {
            uri: r.uri,
            rkey: rkeyOf(r.uri),
            bookUri: reading.book,
          }
          const ref = parseBookUri(reading.book)
          if (!ref) return base
          try {
            const {data} = await agent.com.atproto.repo.getRecord({
              repo: ref.did,
              collection: BOOK_COLLECTION,
              rkey: ref.rkey,
            })
            const book = normalizeBook(data.value)
            if (!book) return base
            // Private books only show to their own author.
            if (
              book.visibility === 'private' &&
              currentAccount?.did !== ref.did
            )
              return base
            return {
              ...base,
              stored: {uri: data.uri, rkey: ref.rkey, did: ref.did, book},
            }
          } catch {
            return base
          }
        }),
      )
    },
  })
}

export function useAddToReadingMutation() {
  const agent = useAgent()
  const ownDid = useOwnDid()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (bookUri: string) => {
      await agent.com.atproto.repo.createRecord({
        repo: ownDid(),
        collection: READING_COLLECTION,
        record: newReadingRecord(bookUri) as unknown as Record<string, unknown>,
      })
    },
    onSuccess: () => qc.invalidateQueries({queryKey: [ROOT, 'reading']}),
  })
}

export function useRemoveFromReadingMutation() {
  const agent = useAgent()
  const ownDid = useOwnDid()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rkey: string) => {
      await agent.com.atproto.repo.deleteRecord({
        repo: ownDid(),
        collection: READING_COLLECTION,
        rkey,
      })
    },
    onSuccess: () => qc.invalidateQueries({queryKey: [ROOT, 'reading']}),
  })
}
