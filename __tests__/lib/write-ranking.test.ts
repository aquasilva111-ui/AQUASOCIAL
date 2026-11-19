import {
  applyExplicitControls,
  CONVENTION_WEIGHTS,
  conventionScore,
  rankWriteFeed,
} from '#/lib/write/ranking'
import {
  attribute,
  type WriteAuthor,
  type WriteEvent,
  type WritePost,
} from '#/lib/write/types'

const NOW = Date.parse('2026-06-01T12:00:00.000Z')

const author = (id: string, followed = false): WriteAuthor => ({
  id,
  handle: `${id}.example`,
  displayName: id,
  color: '#002BEF',
  followed,
})

function hoursAgo(hours: number): string {
  return new Date(NOW - hours * 3_600_000).toISOString()
}

function book(id: string, who: WriteAuthor, genre = 'fantasy'): WritePost {
  return {
    id,
    type: 'book',
    author: who,
    createdAt: hoursAgo(2),
    language: 'en',
    text: id,
    engagement: {replies: 0, reposts: 0, likes: 0},
    attribution: attribute({kind: 'original', authorId: who.id}),
    book: {
      id: `book-${id}`,
      title: id,
      genres: [genre],
      status: 'ongoing',
      chapterCount: 10,
      chaptersRead: 2,
      fanfic: genre === 'fanfic',
    },
    chapter: {
      id: `${id}-ch`,
      bookId: `book-${id}`,
      number: 3,
      title: 'Chapter',
      partCount: 1,
      readMinutes: 4,
    },
  }
}

function article(id: string, who: WriteAuthor): WritePost {
  return {
    id,
    type: 'article',
    author: who,
    createdAt: hoursAgo(4),
    language: 'en',
    title: id,
    subtitle: '',
    body: id,
    tags: ['tecnologia'],
    readMinutes: 3,
    engagement: {replies: 0, reposts: 0, likes: 0},
    attribution: attribute({kind: 'original', authorId: who.id}),
  }
}

const baseInput = {
  tab: 'discover' as const,
  type: 'all' as const,
  showBooks: true,
  showArticles: true,
  hideFanfic: false,
  chronological: false,
  query: '',
}

describe('Convenções de Realidade', () => {
  it('weights a finished read above a view', () => {
    expect(CONVENTION_WEIGHTS.read_to_end).toBeGreaterThan(
      CONVENTION_WEIGHTS.view,
    )
    expect(CONVENTION_WEIGHTS.continue_reading).toBeGreaterThan(
      CONVENTION_WEIGHTS.like,
    )
  })

  it('does not invent a royalty split', () => {
    const record = attribute({kind: 'original', authorId: 'author-example'})
    expect(record.shares).toBeNull()
    expect(record.origin.kind).toBe('original')
  })

  it('scores events only when they touch the post, author, or book', () => {
    const post = book('tide', author('ada'))
    const events: WriteEvent[] = [
      {kind: 'read_to_end', postId: 'tide', at: hoursAgo(1)},
      {kind: 'view', postId: 'other', at: hoursAgo(1)},
      {kind: 'follow', authorId: 'ada', at: hoursAgo(1)},
    ]
    expect(conventionScore(post, events)).toBe(
      CONVENTION_WEIGHTS.read_to_end + CONVENTION_WEIGHTS.follow,
    )
  })

  it('ranks a finished read above a newer glance', () => {
    const finished = {
      ...book('finished', author('ada')),
      createdAt: hoursAgo(10),
    }
    const glance = {
      ...book('glance', author('bea')),
      createdAt: hoursAgo(1),
    }
    const events: WriteEvent[] = [
      {kind: 'read_to_end', postId: 'finished', at: hoursAgo(1)},
      {kind: 'view', postId: 'glance', at: hoursAgo(1)},
    ]
    const ordered = rankWriteFeed([glance, finished], events, baseInput, NOW)
    expect(ordered.map(post => post.id)).toEqual(['finished', 'glance'])
  })

  it('lets chronological order skip the scorer', () => {
    const older = {...book('older', author('ada')), createdAt: hoursAgo(30)}
    const newer = {...book('newer', author('bea')), createdAt: hoursAgo(1)}
    const events: WriteEvent[] = [
      {kind: 'read_to_end', postId: 'older', at: hoursAgo(1)},
    ]
    const ordered = rankWriteFeed(
      [older, newer],
      events,
      {...baseInput, chronological: true},
      NOW,
    )
    expect(ordered.map(post => post.id)).toEqual(['newer', 'older'])
  })

  it('applies type, genre, fanfic, and search before ranking', () => {
    const fantasy = book('fantasy', author('ada'), 'fantasy')
    const fanfic = book('fanfic', author('bea'), 'fanfic')
    const note = article('note', author('cio'))
    expect(
      applyExplicitControls([fantasy, fanfic, note], {
        ...baseInput,
        type: 'book',
      }).map(post => post.id),
    ).toEqual(['fantasy', 'fanfic'])
    expect(
      applyExplicitControls([fantasy, fanfic, note], {
        ...baseInput,
        genre: 'fantasy',
      }).map(post => post.id),
    ).toEqual(['fantasy'])
    expect(
      applyExplicitControls([fantasy, fanfic], {
        ...baseInput,
        hideFanfic: true,
      }).map(post => post.id),
    ).toEqual(['fantasy'])
    expect(
      applyExplicitControls([fantasy, note], {
        ...baseInput,
        showBooks: false,
      }).map(post => post.id),
    ).toEqual(['note'])
    expect(
      applyExplicitControls([fantasy, note], {
        ...baseInput,
        query: 'note',
      }).map(post => post.id),
    ).toEqual(['note'])
  })

  it('keeps Following and Continue reading as explicit filters', () => {
    const followed = book('followed', author('ada', true))
    const stranger = book('stranger', author('bea', false))
    const done = book('done', author('ada', true))
    if (done.type === 'book') done.book.chaptersRead = done.book.chapterCount
    expect(
      applyExplicitControls([followed, stranger], {
        ...baseInput,
        tab: 'following',
      }).map(post => post.id),
    ).toEqual(['followed'])
    expect(
      applyExplicitControls([followed, done], {
        ...baseInput,
        tab: 'continue',
      }).map(post => post.id),
    ).toEqual(['followed'])
  })

  it('does not stack the same author when another post exists', () => {
    const first = {...book('a1', author('ada')), createdAt: hoursAgo(1)}
    const second = {...book('a2', author('ada')), createdAt: hoursAgo(2)}
    const other = {...article('other', author('bea')), createdAt: hoursAgo(3)}
    const ordered = rankWriteFeed([first, second, other], [], baseInput, NOW)
    expect(ordered[0].id).toBe('a1')
    expect(ordered[1].author.id).not.toBe('ada')
    expect(ordered.map(post => post.id).sort()).toEqual(['a1', 'a2', 'other'])
  })

  it('mixes types once two of the same kind are already in a row', () => {
    const books = ['b1', 'b2', 'b3'].map((id, index) => ({
      ...book(id, author(`who-${id}`)),
      createdAt: hoursAgo(index + 1),
    }))
    const note = {...article('note', author('bea')), createdAt: hoursAgo(8)}
    const ordered = rankWriteFeed([...books, note], [], baseInput, NOW)
    expect(ordered.slice(0, 3).map(post => post.type)).toEqual([
      'book',
      'book',
      'article',
    ])
    expect(ordered).toHaveLength(4)
  })
})
