import {
  announcementText,
  bookAccess,
  buildShareCard,
  chapterAccess,
  chapterPath,
  chapterToCards,
  countWords,
  filterByGenre,
  genreLabel,
  neighbors,
  newBookRecord,
  newChapterRecord,
  nextChapterNumber,
  normalizeBook,
  normalizeChapter,
  orderedChapters,
  partExcerpt,
  partUrl,
  publishChapter,
  readingMinutes,
  splitIntoParts,
  toWritable,
  validateChapterForPublish,
} from '#/lib/books/model'
import {router} from '#/routes'

const OWNER = 'did:plc:owner000000000000000000'
const OTHER = 'did:plc:other000000000000000000'
const BOOK = `at://${OWNER}/place.aqua.book.book/3kbook`

const chapter = (n: number, status: 'draft' | 'published' = 'published') =>
  newChapterRecord({
    book: BOOK,
    number: n,
    title: `T${n}`,
    body: `corpo ${n}`,
    status,
  })

describe('book record', () => {
  it('defaults: public, ongoing, general', () => {
    const b = newBookRecord({title: 'A'})
    expect(b).toMatchObject({
      visibility: 'public',
      status: 'ongoing',
      maturity: 'general',
      genres: [],
    })
    for (const k of ['did', 'handle', 'avatar', 'email'])
      expect(b).not.toHaveProperty(k)
  })

  it('normalizes untrusted data', () => {
    const b = normalizeBook({
      title: '  Livro  ',
      synopsis: 'x'.repeat(9000),
      genres: ['fantasy', 'fantasy', 'nope', 'romance', 'drama', 'comedy'],
      tags: ['Amor', 'amor', '', 7, 'Magia'],
      maturity: 'xxx',
      status: 'weird',
      visibility: 'weird',
      cover: {ref: {$link: 'bafy'}, mimeType: 'text/html', size: 1},
    })!
    expect(b.title).toBe('Livro')
    expect(b.synopsis).toHaveLength(2000)
    expect(b.genres).toEqual(['fantasy', 'romance', 'drama'])
    expect(b.tags).toEqual(['amor', 'magia'])
    expect(b).toMatchObject({
      maturity: 'general',
      status: 'ongoing',
      visibility: 'public',
    })
    expect(b.cover).toBeUndefined()
  })

  it('rejects records without a title', () => {
    expect(normalizeBook({title: '  '})).toBeUndefined()
    expect(normalizeBook(null)).toBeUndefined()
  })
})

describe('chapter record', () => {
  it('only accepts a book from the same author', () => {
    const raw = {book: `at://${OTHER}/place.aqua.book.book/x`, number: 1}
    expect(normalizeChapter(raw, OWNER)).toBeUndefined()
    expect(normalizeChapter({book: BOOK, number: 1}, OWNER)).toBeDefined()
  })

  it('rejects bad numbers and foreign announcement posts', () => {
    expect(normalizeChapter({book: BOOK, number: 0}, OWNER)).toBeUndefined()
    expect(normalizeChapter({book: BOOK, number: 1.5}, OWNER)).toBeUndefined()
    const c = normalizeChapter(
      {book: BOOK, number: 2, threadUri: `at://${OTHER}/app.bsky.feed.post/1`},
      OWNER,
    )!
    expect(c.threadUri).toBeUndefined()
    expect(c.title).toBe('Capítulo 2')
  })

  it('a draft never carries publishedAt', () => {
    const c = normalizeChapter(
      {book: BOOK, number: 1, status: 'draft', publishedAt: '2026-01-01'},
      OWNER,
    )!
    expect(c.publishedAt).toBeUndefined()
  })

  it('publish stamps publishedAt once', () => {
    const first = publishChapter(
      chapter(1, 'draft'),
      new Date('2026-09-30T00:00:00Z'),
    )
    const again = publishChapter(first, new Date('2027-01-01T00:00:00Z'))
    expect(first.status).toBe('published')
    expect(again.publishedAt).toBe('2026-09-30T00:00:00.000Z')
  })

  it('validates before publishing', () => {
    expect(
      validateChapterForPublish(newChapterRecord({book: BOOK, number: 1})),
    ).toEqual(['title_required', 'body_required'])
    expect(validateChapterForPublish(chapter(1))).toEqual([])
  })

  it('toWritable drops empty fields and refreshes updatedAt', () => {
    const w = toWritable(
      newChapterRecord({book: BOOK, number: 1, title: 'a', authorNote: ''}),
      new Date('2026-09-30T00:00:00Z'),
    )
    expect(w).not.toHaveProperty('authorNote')
    expect(w.updatedAt).toBe('2026-09-30T00:00:00.000Z')
  })
})

describe('access', () => {
  const pub = newBookRecord({title: 'A'})
  const priv = newBookRecord({title: 'A', visibility: 'private'})
  it('moderation wins, private is owner-only, unlisted opens by link', () => {
    expect(bookAccess({book: pub, isOwner: true, moderated: true})).toBe(
      'suspended',
    )
    expect(
      bookAccess({book: undefined, isOwner: false, moderated: false}),
    ).toBe('none')
    expect(bookAccess({book: priv, isOwner: false, moderated: false})).toBe(
      'unavailable',
    )
    expect(bookAccess({book: priv, isOwner: true, moderated: false})).toBe(
      'visible',
    )
    expect(
      bookAccess({
        book: newBookRecord({title: 'A', visibility: 'unlisted'}),
        isOwner: false,
        moderated: false,
      }),
    ).toBe('visible')
  })
  it('drafts are owner-only', () => {
    const d = chapter(1, 'draft')
    expect(chapterAccess({chapter: d, isOwner: false})).toBe('unavailable')
    expect(chapterAccess({chapter: d, isOwner: true})).toBe('visible')
    expect(chapterAccess({chapter: chapter(1), isOwner: false})).toBe('visible')
  })
})

describe('ordering', () => {
  const list = [chapter(3), chapter(1), chapter(2, 'draft'), chapter(4)]
  it('orders by number and hides drafts from readers', () => {
    expect(orderedChapters(list, false).map(c => c.number)).toEqual([1, 3, 4])
    expect(orderedChapters(list, true).map(c => c.number)).toEqual([1, 2, 3, 4])
  })
  it('next number and neighbors skip drafts', () => {
    expect(nextChapterNumber(list)).toBe(5)
    expect(nextChapterNumber([])).toBe(1)
    const n = neighbors(list, 1)
    expect(n.prev).toBeUndefined()
    expect(n.next?.number).toBe(3)
    expect(neighbors(list, 4).next).toBeUndefined()
  })
})

describe('thread parts', () => {
  it('splits at paragraphs, respects size, never drops words', () => {
    const body = Array.from(
      {length: 30},
      (_, i) => `Parágrafo ${i}. ${'palavra '.repeat(30)}`,
    ).join('\n\n')
    const parts = splitIntoParts(body, 600)
    expect(parts.length).toBeGreaterThan(5)
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(600)
    expect(countWords(parts.join('\n\n'))).toBe(countWords(body))
  })
  it('splits a giant paragraph on sentences, then spaces', () => {
    const giant = 'Frase curta. '.repeat(200)
    const parts = splitIntoParts(giant, 200)
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(200)
    expect(countWords(parts.join(' '))).toBe(countWords(giant))
    const noSpaces = 'a'.repeat(1000)
    for (const p of splitIntoParts(noSpaces, 300))
      expect(p.length).toBeLessThanOrEqual(300)
  })
  it('handles empty text and merges tiny stubs', () => {
    expect(splitIntoParts('  \n\n ')).toEqual([])
    expect(splitIntoParts('Oi.\n\nTudo bem?\n\nSim.')).toHaveLength(1)
  })
  it('reading time', () => {
    expect(readingMinutes('')).toBe(0)
    expect(readingMinutes('uma frase')).toBe(1)
    expect(readingMinutes('p '.repeat(2300))).toBe(10)
  })
})

describe('sharing', () => {
  const book = newBookRecord({title: 'Maré Alta'})
  const ch = {...chapter(3), title: 'O farol', body: 'palavra '.repeat(200)}
  it('builds a card with a capped preview and the web url', () => {
    const card = buildShareCard({
      book,
      chapter: ch,
      url: 'https://aquaapp.online/x',
    })
    expect(card.uri).toBe('https://aquaapp.online/x')
    expect(card.title).toBe('Maré Alta · Cap. 3: O farol')
    expect(card.description.length).toBeLessThanOrEqual(280)
    expect(card.description.endsWith('…')).toBe(true)
  })
  it('announcement fits a post', () => {
    expect(announcementText({book, chapter: ch})).toBe(
      'Novo capítulo de Maré Alta: 3. O farol',
    )
    expect(
      announcementText({book, chapter: ch, note: 'x'.repeat(500)}).length,
    ).toBe(300)
  })
  it('paths encode handle and keys', () => {
    expect(chapterPath('ana.aquaapp.online', 'b1', 'c1')).toBe(
      '/books/ana.aquaapp.online/b1/c1',
    )
  })
})

describe('routes', () => {
  const m = (p: string) => router.matchPath(p)
  it('resolves every Books route to the right screen', () => {
    expect(m('/books')[0]).toBe('Books')
    expect(m('/books/studio')[0]).toBe('BooksStudio')
    expect(m('/books/studio/book/new')).toEqual(['BookEdit', {book: 'new'}])
    expect(m('/books/studio/book/b1/chapter/new')).toEqual([
      'ChapterEdit',
      {book: 'b1', chapter: 'new'},
    ])
    expect(m('/books/ana.aquaapp.online/b1')).toEqual([
      'BookDetail',
      {handle: 'ana.aquaapp.online', book: 'b1'},
    ])
    expect(m('/books/ana.aquaapp.online/b1/c1')).toEqual([
      'BookChapter',
      {handle: 'ana.aquaapp.online', book: 'b1', chapter: 'c1'},
    ])
  })
  it('paths built by the model match the router', () => {
    expect(m(chapterPath('ana.aquaapp.online', 'b1', 'c1'))[0]).toBe(
      'BookChapter',
    )
  })
})

describe('reading list', () => {
  const {
    newReadingRecord,
    normalizeReading,
    parseBookUri,
  } = require('#/lib/books/model')
  const uri = 'at://did:plc:abc/place.aqua.book.book/3k'

  it('parses a book uri', () => {
    expect(parseBookUri(uri)).toEqual({did: 'did:plc:abc', rkey: '3k'})
    expect(
      parseBookUri('at://did:plc:abc/app.bsky.feed.post/3k'),
    ).toBeUndefined()
  })

  it('round-trips a reading record and rejects bad ones', () => {
    const rec = newReadingRecord(uri, new Date('2026-01-01T00:00:00Z'))
    expect(normalizeReading(rec)?.book).toBe(uri)
    expect(normalizeReading({book: 'nope'})).toBeUndefined()
    expect(normalizeReading(null)).toBeUndefined()
  })
})

describe('reads feed parts', () => {
  const ch = newChapterRecord({
    book: BOOK,
    number: 1,
    title: 'Um',
    body: 'Primeiro parágrafo.\n\nSegundo parágrafo ' + 'x'.repeat(700),
  })
  it('turns a chapter into ordered cards with stable ids', () => {
    const cards = chapterToCards('at://d/c/1', ch)
    expect(cards.length).toBeGreaterThan(1)
    expect(cards[0].id).toBe('at://d/c/1#1')
    expect(cards.every(c => c.total === cards.length)).toBe(true)
  })
  it('keeps excerpts within the post limit', () => {
    const e = partExcerpt('palavra '.repeat(100))
    expect(e.length).toBeLessThanOrEqual(280)
    expect(e.endsWith('…')).toBe(true)
    expect(partExcerpt('curto')).toBe('curto')
  })
  it('builds a deep link to a part', () => {
    expect(partUrl('https://x.y', '/books/a/b/c', 2)).toBe(
      'https://x.y/books/a/b/c#parte-3',
    )
  })
})

describe('home genre filter', () => {
  const mk = (genres: string[]) => ({
    book: newBookRecord({title: 'T', genres}),
  })
  it('filters by genre and keeps all without one', () => {
    const list = [mk(['romance']), mk(['horror', 'romance']), mk(['scifi'])]
    expect(filterByGenre(list, 'romance')).toHaveLength(2)
    expect(filterByGenre(list, undefined)).toHaveLength(3)
  })
  it('labels genres', () => {
    expect(genreLabel('fantasy')).toBe('Fantasia')
    expect(genreLabel('x')).toBe('x')
  })
})

describe('characters and audience', () => {
  it('normalizes characters and audience from repo data', () => {
    const b = normalizeBook({
      title: 'T',
      characters: ['  Ana ', 'Ana', '', 5, 'Leo'],
      audience: 'ya',
    })
    expect(b?.characters).toEqual(['Ana', 'Leo'])
    expect(b?.audience).toBe('ya')
  })
  it('drops invalid audience and defaults characters', () => {
    const b = normalizeBook({title: 'T', audience: 'x'})
    expect(b?.audience).toBeUndefined()
    expect(b?.characters).toEqual([])
  })
})
