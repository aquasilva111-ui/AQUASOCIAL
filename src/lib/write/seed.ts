/**
 * Placeholder catalog for Write.
 *
 * Names, counts, and prose are examples. They are not accounts on the
 * network. Royalty shares are left unset — see `attribute`.
 */

import {readingMinutes} from '#/lib/books/model'
import {
  attribute,
  type ChapterPart,
  type WriteAuthor,
  type WriteChapter,
  type WriteEvent,
  type WritePost,
  type WriteTrend,
} from '#/lib/write/types'

const HOUR = 3_600_000

export const AUTHORS = {
  example: {
    id: 'author-example',
    handle: 'author.example',
    displayName: 'Example Author',
    color: '#002BEF',
    followed: true,
  },
  writer: {
    id: 'writer-example',
    handle: 'writer.example',
    displayName: 'Sample Writer',
    color: '#FF8A3D',
    followed: true,
  },
  opinion: {
    id: 'opinion-example',
    handle: 'opinion.example',
    displayName: 'Opinion Example',
    color: '#16A34A',
    followed: false,
  },
  cook: {
    id: 'cook-example',
    handle: 'cook.example',
    displayName: 'Kitchen Example',
    color: '#9333EA',
    followed: false,
  },
  fan: {
    id: 'fan-example',
    handle: 'fan.example',
    displayName: 'Fan Example',
    color: '#64748B',
    followed: false,
  },
} as const satisfies Record<string, WriteAuthor>

const TIDE = 'sample-tide'

function ago(hours: number, now = Date.now()): string {
  return new Date(now - hours * HOUR).toISOString()
}

function prose(part: number): string {
  return `Lorem ipsum placeholder prose for part ${part}. The tide rolled into the example harbor while the characters argued about the map. Dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.`
}

function partsFor(chapterId: string, count: number): ChapterPart[] {
  return Array.from({length: count}, (_, index) => ({
    id: `${chapterId}-p${index + 1}`,
    index,
    text: prose(index + 1),
    replies: chapterId.endsWith('-7') ? ([7, 14, 21, 28][index] ?? 0) : 0,
    likes: chapterId.endsWith('-7') ? ([105, 90, 75, 60][index] ?? 0) : 0,
    saved: false,
  }))
}

function chapter(input: {
  number: number
  title: string
  partCount: number
  author?: WriteAuthor
}): WriteChapter {
  const id = `${TIDE}-ch${input.number}`
  const parts = partsFor(id, input.partCount)
  const body = parts.map(part => part.text).join('\n\n')
  return {
    id,
    bookId: TIDE,
    number: input.number,
    title: input.title,
    author: input.author ?? AUTHORS.example,
    parts,
    readMinutes: readingMinutes(body),
    attribution: attribute({kind: 'original', authorId: AUTHORS.example.id}),
    comments:
      input.number === 7
        ? [
            {
              id: 'comment-twist',
              partIndex: 1,
              authorName: 'Reader Example',
              authorColor: '#FF8A3D',
              text: 'Placeholder comment: loved this twist!',
            },
          ]
        : [],
    commentsPerPart: true,
  }
}

const CHAPTERS: {number: number; title: string}[] = [
  {number: 1, title: 'Example opening'},
  {number: 2, title: 'Example map'},
  {number: 3, title: 'Example argument'},
  {number: 4, title: 'Example lantern'},
  {number: 5, title: 'Example title'},
  {number: 6, title: 'Example title'},
  {number: 7, title: 'Placeholder Harbor'},
  {number: 8, title: 'Example title'},
  {number: 9, title: 'Example title'},
  {number: 10, title: 'Example current'},
  {number: 11, title: 'Example gate'},
  {number: 12, title: 'Example shore'},
]

export function createSeed(now = Date.now()): {
  posts: WritePost[]
  chapters: WriteChapter[]
  events: WriteEvent[]
  trends: WriteTrend[]
} {
  const chapters = CHAPTERS.map(item =>
    chapter({
      number: item.number,
      title: item.title,
      partCount: item.number === 7 ? 4 : 2,
    }),
  )
  const chapter7 = chapters.find(item => item.number === 7)!
  chapter7.readMinutes = 9
  const book = {
    id: TIDE,
    title: 'The Sample Tide',
    genres: ['fantasy'],
    status: 'ongoing' as const,
    chapterCount: 12,
    chaptersRead: 6,
    fanfic: false,
  }
  const tide: WritePost = {
    id: 'post-tide',
    type: 'book',
    author: AUTHORS.example,
    createdAt: ago(2, now),
    language: 'en',
    text: 'Published Chapter 7 of my serial',
    engagement: {replies: 48, reposts: 12, likes: 310},
    attribution: attribute({kind: 'original', authorId: AUTHORS.example.id}),
    book,
    chapter: {
      id: chapter7.id,
      bookId: TIDE,
      number: 7,
      title: chapter7.title,
      partCount: chapter7.parts.length,
      readMinutes: chapter7.readMinutes,
    },
  }
  const articleBody =
    'Lorem ipsum excerpt: a short two-line summary of the article appears here to invite the reader in. The rest of the piece is placeholder prose about publishing without a single landlord, written so the reader screen has something to scroll.'
  const article: WritePost = {
    id: 'post-article',
    type: 'article',
    author: AUTHORS.writer,
    createdAt: ago(4, now),
    language: 'en',
    title: 'An Example Article Title About Decentralized Publishing',
    subtitle:
      'Lorem ipsum excerpt: a short two-line summary of the article appears here to invite the reader in…',
    body: articleBody,
    tags: ['tecnologia'],
    readMinutes: 6,
    engagement: {replies: 9, reposts: 4, likes: 87},
    attribution: attribute({kind: 'original', authorId: AUTHORS.writer.id}),
  }
  const opinion: WritePost = {
    id: 'post-opinion',
    type: 'opinion',
    author: AUTHORS.opinion,
    createdAt: ago(5, now),
    language: 'en',
    text: 'Example opinion: short-form takes should live next to long-form stories, so readers find both in one place. (placeholder text)',
    engagement: {replies: 22, reposts: 6, likes: 140},
    attribution: attribute({kind: 'original', authorId: AUTHORS.opinion.id}),
  }
  const recipe: WritePost = {
    id: 'post-recipe',
    type: 'recipe',
    author: AUTHORS.cook,
    createdAt: ago(26, now),
    language: 'en',
    title: 'Example Weeknight Pasta',
    prepMinutes: 10,
    cookMinutes: 15,
    servings: 4,
    difficulty: 'easy',
    tags: ['recipes'],
    ingredients: [
      '400 g example pasta',
      '2 tablespoons olive oil',
      '3 garlic cloves',
      'A handful of placeholder herbs',
    ],
    steps: [
      'Boil the pasta in salted water.',
      'Warm the oil and garlic until fragrant.',
      'Toss the pasta with the oil and herbs.',
      'Serve immediately. This is placeholder cooking.',
    ],
    engagement: {replies: 5, reposts: 3, likes: 64},
    attribution: attribute({kind: 'original', authorId: AUTHORS.cook.id}),
  }
  const fanficChapter: WriteChapter = {
    id: 'sample-harbor-au-ch2',
    bookId: 'sample-harbor-au',
    number: 2,
    title: 'Example crossover',
    author: AUTHORS.fan,
    parts: partsFor('sample-harbor-au-ch2', 2),
    readMinutes: 4,
    attribution: attribute({
      kind: 'derivative',
      authorId: AUTHORS.fan.id,
      sourceCredit: 'The Sample Tide by @author.example',
    }),
    comments: [],
    commentsPerPart: true,
  }
  const fanfic: WritePost = {
    id: 'post-fanfic',
    type: 'book',
    author: AUTHORS.fan,
    createdAt: ago(30, now),
    language: 'en',
    text: 'Published Chapter 2 of a sample fanfic',
    engagement: {replies: 3, reposts: 1, likes: 18},
    attribution: attribute({
      kind: 'derivative',
      authorId: AUTHORS.fan.id,
      sourceCredit: 'The Sample Tide by @author.example',
    }),
    book: {
      id: 'sample-harbor-au',
      title: 'Sample Harbor AU',
      genres: ['fanfic', 'fantasy'],
      status: 'ongoing',
      chapterCount: 4,
      chaptersRead: 1,
      fanfic: true,
    },
    chapter: {
      id: 'sample-harbor-au-ch2',
      bookId: 'sample-harbor-au',
      number: 2,
      title: 'Example crossover',
      partCount: 2,
      readMinutes: 4,
    },
  }
  const events: WriteEvent[] = [
    {
      kind: 'follow',
      authorId: AUTHORS.example.id,
      at: ago(200, now),
    },
    {
      kind: 'follow',
      authorId: AUTHORS.writer.id,
      at: ago(180, now),
    },
    {
      kind: 'continue_reading',
      postId: tide.id,
      authorId: AUTHORS.example.id,
      bookId: TIDE,
      at: ago(1, now),
    },
    {
      kind: 'save',
      postId: tide.id,
      bookId: TIDE,
      at: ago(10, now),
    },
    {
      kind: 'like',
      postId: article.id,
      authorId: AUTHORS.writer.id,
      at: ago(3, now),
    },
    {
      kind: 'like',
      postId: opinion.id,
      authorId: AUTHORS.opinion.id,
      at: ago(4, now),
    },
    {
      kind: 'view',
      postId: recipe.id,
      at: ago(20, now),
    },
  ]
  const trends: WriteTrend[] = [
    {tag: '#ExampleSerial', detail: 'Book · 1.2k readers (example)'},
    {tag: '#WeeknightRecipes', detail: 'Recipes · example'},
    {tag: '#OpinionSample', detail: 'Opinions · example'},
  ]
  return {
    posts: [tide, article, opinion, recipe, fanfic],
    chapters: [...chapters, fanficChapter],
    events,
    trends,
  }
}
