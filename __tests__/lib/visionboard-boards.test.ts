import {
  type Aesthetic,
  aestheticFromPixels,
  aestheticSimilarity,
  labelOf,
  matchPresets,
  normalizeAesthetic,
  type PixelSource,
} from '#/lib/visionboard/aesthetics'
import {
  aestheticConventionKeys,
  groupPins,
  type Pinnable,
  profileOf,
  rankExplore,
  rankForBoard,
  scoreForProfile,
  suggestBoards,
} from '#/lib/visionboard/algorithm'
import {
  type BoardRecord,
  boardsContaining,
  coverOf,
  isBoardUri,
  newBoardRecord,
  newPinRecord,
  normalizeBoard,
  normalizePin,
  orderedPins,
  pinKey,
  type StoredPin,
  toWritable,
  visibleBoards,
} from '#/lib/visionboard/boards'

const OWNER = 'did:plc:owner000000000000000000'
const OTHER = 'did:plc:other000000000000000000'
const BOARD = `at://${OWNER}/place.aqua.visionboard.board/3kboard`
const POST = (n: number) => `at://${OTHER}/app.bsky.feed.post/3kpost${n}`

/** A w×h image of one colour, or two halves. */
function solid(
  rgb: [number, number, number],
  second?: [number, number, number],
  size = 16,
): PixelSource {
  const data: number[] = []
  for (let i = 0; i < size * size; i++) {
    const c = second && i >= (size * size) / 2 ? second : rgb
    data.push(c[0], c[1], c[2], 255)
  }
  return {data, width: size, height: size}
}

const sig = (src: PixelSource) => aestheticFromPixels(src) as Aesthetic

const A = (over: Partial<Aesthetic> = {}): Aesthetic => ({
  palette: ['#f4e9e1', '#e8c9c4'],
  light: 88,
  chroma: 20,
  warmth: 10,
  contrast: 16,
  ...over,
})

describe('aesthetic extraction', () => {
  it('reads lightness, chroma and warmth from pixels', () => {
    const black = sig(solid([0, 0, 0]))
    const white = sig(solid([255, 255, 255]))
    const red = sig(solid([220, 40, 30]))
    const blue = sig(solid([30, 70, 220]))
    expect(black.light).toBeLessThan(5)
    expect(white.light).toBeGreaterThan(95)
    expect(white.chroma).toBeLessThan(5)
    expect(red.warmth).toBeGreaterThan(30)
    expect(blue.warmth).toBeLessThan(-30)
    expect(red.chroma).toBeGreaterThan(40)
  })

  it('measures contrast and keeps both halves in the palette', () => {
    const flat = sig(solid([128, 128, 128]))
    const stark = sig(solid([0, 0, 0], [255, 255, 255]))
    expect(stark.contrast).toBeGreaterThan(flat.contrast + 50)
    expect(stark.palette).toEqual(
      expect.arrayContaining(['#000000', '#ffffff']),
    )
  })

  it('is deterministic and ignores transparent pixels', () => {
    expect(sig(solid([10, 120, 200]))).toEqual(sig(solid([10, 120, 200])))
    const clear: PixelSource = {
      data: [255, 0, 0, 0, 0, 255, 0, 0],
      width: 2,
      height: 1,
    }
    expect(aestheticFromPixels(clear)).toBeUndefined()
    expect(aestheticFromPixels({data: [], width: 0, height: 0})).toBeUndefined()
  })

  it('never trusts a stored signature', () => {
    expect(normalizeAesthetic('x')).toBeUndefined()
    expect(normalizeAesthetic({light: 50})).toBeUndefined()
    const clean = normalizeAesthetic({
      // eslint-disable-next-line no-script-url -- hostile stored value
      palette: ['#FFAA00', 'javascript:1', 42, '#12'],
      light: 500,
      chroma: -3,
      warmth: 9999,
      contrast: 50.4,
    })
    expect(clean).toEqual({
      palette: ['#ffaa00'],
      light: 100,
      chroma: 0,
      warmth: 100,
      contrast: 50,
    })
  })
})

describe('aesthetic similarity and moods', () => {
  it('is 1 for the same look and low for opposites', () => {
    const black = sig(solid([0, 0, 0]))
    const white = sig(solid([255, 255, 255]))
    expect(aestheticSimilarity(black, black)).toBe(1)
    expect(aestheticSimilarity(black, white)).toBeLessThan(0.3)
    expect(aestheticSimilarity(black, white)).toBeCloseTo(
      aestheticSimilarity(white, black),
    )
  })

  it('works from statistics alone when a palette is missing', () => {
    expect(
      aestheticSimilarity(A({palette: []}), A({palette: ['#000000']})),
    ).toBe(1)
  })

  it('names the closest mood, and nothing when none fits', () => {
    expect(labelOf(A())?.id).toBe('pastel')
    expect(
      labelOf(A({light: 22, chroma: 6, warmth: 0, contrast: 55}))?.id,
    ).toBe('noir')
    expect(
      labelOf(A({light: 50, chroma: 100, warmth: -100, contrast: 100}), 0.95),
    ).toBeUndefined()
    expect(matchPresets(A())[0].score).toBeGreaterThan(
      matchPresets(A())[1].score,
    )
  })
})

describe('board and pin records', () => {
  it('accepts only same-author boards for pins', () => {
    expect(isBoardUri(BOARD, OWNER)).toBe(true)
    expect(isBoardUri(BOARD, OTHER)).toBe(false)
    expect(isBoardUri('at://x/app.bsky.feed.post/1')).toBe(false)
  })

  it('normalises hostile board data', () => {
    expect(normalizeBoard({title: '   '})).toBeUndefined()
    expect(normalizeBoard('x')).toBeUndefined()
    const b = normalizeBoard({
      title: 'x'.repeat(200),
      visibility: 'weird',
      description: 5,
    }) as BoardRecord
    expect(b.title).toHaveLength(60)
    expect(b.visibility).toBe('public')
    expect(b.description).toBeUndefined()
  })

  it('normalises pins: foreign board, bad subject, bad index, tags', () => {
    const ok = {
      board: BOARD,
      subject: {uri: POST(1), cid: 'bafy'},
      imageIndex: 2,
      tags: ['#Música', 'musica', 'ARTE', 7],
      aesthetic: A(),
    }
    const pin = normalizePin(ok, OWNER)
    expect(pin?.imageIndex).toBe(2)
    expect(pin?.tags).toEqual(['musica', 'arte'])
    expect(pin?.aesthetic?.light).toBe(88)
    expect(normalizePin(ok, OTHER)).toBeUndefined() // board of someone else
    expect(
      normalizePin({...ok, subject: {uri: 'at://x/y/z', cid: 'c'}}, OWNER),
    ).toBeUndefined()
    expect(
      normalizePin({...ok, subject: {uri: POST(1)}}, OWNER),
    ).toBeUndefined()
    expect(normalizePin({...ok, imageIndex: 99}, OWNER)?.imageIndex).toBe(0)
    expect(
      normalizePin({...ok, aesthetic: 'junk'}, OWNER)?.aesthetic,
    ).toBeUndefined()
  })

  it('stamps timestamps and drops empty fields when writing', () => {
    const now = new Date('2026-10-01T12:00:00Z')
    const w = toWritable(
      newBoardRecord({title: 'Casa', description: undefined}, now),
      new Date('2026-10-02T00:00:00Z'),
    )
    expect(w.createdAt).toBe('2026-10-01T12:00:00.000Z')
    expect(w.updatedAt).toBe('2026-10-02T00:00:00.000Z')
    expect('description' in w).toBe(false)
  })
})

describe('pin order, cover, visibility, duplicates', () => {
  const stored = (
    n: number,
    over: Partial<StoredPin['pin']> = {},
  ): StoredPin => ({
    uri: `at://${OWNER}/place.aqua.visionboard.pin/p${n}`,
    rkey: `p${n}`,
    pin: newPinRecord(
      {
        board: BOARD,
        subject: {uri: POST(n), cid: 'c'},
        createdAt: `2026-10-0${n}T00:00:00Z`,
        ...over,
      },
      new Date(),
    ),
  })

  it('orders manual positions first, then newest first', () => {
    const pins = [
      stored(1),
      stored(2),
      stored(3, {position: 0}),
      stored(4, {position: 1}),
    ]
    expect(orderedPins(pins).map(p => p.rkey)).toEqual(['p3', 'p4', 'p2', 'p1'])
  })

  it('uses the chosen cover while it exists, else the newest pin', () => {
    const pins = [stored(1), stored(2)]
    const board = newBoardRecord({title: 't', coverPin: pins[0].uri})
    expect(coverOf(board, pins)?.rkey).toBe('p1')
    expect(coverOf({...board, coverPin: 'gone'}, pins)?.rkey).toBe('p2')
    expect(coverOf(board, [])).toBeUndefined()
  })

  it('hides private boards from non-owners', () => {
    const boards = [
      {board: newBoardRecord({title: 'a'})},
      {board: newBoardRecord({title: 'b', visibility: 'private'})},
    ]
    expect(visibleBoards(boards, true)).toHaveLength(2)
    expect(visibleBoards(boards, false)).toHaveLength(1)
  })

  it('finds which boards already hold this exact image', () => {
    const p = stored(1, {imageIndex: 1})
    const by = new Map([
      [BOARD, [p]],
      ['other', [stored(2)]],
    ])
    expect(boardsContaining(by, p.pin.subject, 1)).toEqual([BOARD])
    expect(boardsContaining(by, p.pin.subject, 0)).toEqual([])
    expect(pinKey(p.pin.subject, 1)).toBe(`${POST(1)}#1`)
  })
})

const PASTEL = A()
const NEON = A({
  palette: ['#ff00cc', '#00e5ff'],
  light: 40,
  chroma: 65,
  warmth: -10,
  contrast: 65,
})
const NOIR = A({
  palette: ['#111111', '#2a2a2a'],
  light: 22,
  chroma: 6,
  warmth: 0,
  contrast: 55,
})

const item = (
  id: string,
  aesthetic: Aesthetic | undefined,
  tags: string[] = [],
  author = id,
): Pinnable => ({id, author, tags, aesthetic})

describe('board profile', () => {
  it('is more cohesive for one look than for a mix', () => {
    const uniform = profileOf([
      item('a', PASTEL),
      item('b', PASTEL),
      item('c', A({light: 86})),
    ])
    const mixed = profileOf([
      item('a', PASTEL),
      item('b', NEON),
      item('c', NOIR),
    ])
    expect(uniform.cohesion).toBeGreaterThan(0.9)
    expect(mixed.cohesion).toBeLessThan(uniform.cohesion - 0.2)
    expect(uniform.moods[0].id).toBe('pastel')
  })

  it('has no look until a pin has a signature, and never crashes when empty', () => {
    expect(profileOf([]).size).toBe(0)
    const p = profileOf([item('a', undefined, ['arte'])])
    expect(p.aesthetic).toBeUndefined()
    expect(p.cohesion).toBe(0)
    expect(p.tags.get('arte')).toBe(1)
    expect(scoreForProfile(profileOf([]), item('x', PASTEL))).toBe(0)
  })
})

describe('what fits a folder', () => {
  const board = profileOf([
    item('a', PASTEL, ['moda'], 'u1'),
    item('b', A({light: 85}), ['moda'], 'u2'),
    item('c', A({light: 90}), ['flores'], 'u3'),
  ])

  it('ranks look-alikes above opposites and drops what is already in it', () => {
    const ranked = rankForBoard(
      board,
      [
        item('near', A({light: 87}), ['moda'], 'x1'),
        item('far', NEON, [], 'x2'),
        item('a', PASTEL, ['moda'], 'u1'),
      ],
      {exclude: new Set(['a'])},
    )
    expect(ranked.map(r => r.item.id)).toEqual(['near'])
  })

  it('uses tags when the look is unknown', () => {
    const r = rankForBoard(board, [item('t', undefined, ['moda'], 'x')])
    expect(r).toHaveLength(1)
  })

  it('trusts the look less in a grab-bag folder', () => {
    const mixed = profileOf([
      item('a', PASTEL),
      item('b', NEON),
      item('c', NOIR),
    ])
    const candidate = item('x', mixed.aesthetic, ['moda'])
    const tagged = profileOf([
      item('a', PASTEL, ['moda']),
      item('b', NEON, ['moda']),
      item('c', NOIR, ['moda']),
    ])
    // Same look-fit, but tags carry more of the score when cohesion is low.
    expect(scoreForProfile(tagged, candidate)).toBeGreaterThan(
      scoreForProfile(mixed, candidate),
    )
  })

  it('removes a near-duplicate from the same creator but keeps a different look', () => {
    const ids = rankForBoard(board, [
      item('d1', A({light: 87}), ['moda'], 'same'),
      item('d2', A({light: 87}), ['moda'], 'same'), // same creator, same look
      item('m1', A({light: 86}), ['moda'], 'p'),
      item(
        'm2',
        A({light: 78, chroma: 38, palette: ['#d9b8a0', '#c9a58a']}),
        ['moda'],
        'p',
      ),
    ]).map(r => r.item.id)
    expect(ids).not.toContain('d2')
    expect(ids).toEqual(expect.arrayContaining(['d1', 'm1', 'm2']))
  })

  it('does not put one creator back to back while another is available', () => {
    const look = (light: number, chroma: number, palette: string[]) =>
      A({light, chroma, palette})
    const ranked = rankForBoard(board, [
      item('p1', look(88, 20, ['#f4e9e1']), ['moda'], 'p'),
      item('p2', look(82, 34, ['#e0c3a8']), ['moda'], 'p'),
      item('q1', look(86, 24, ['#efe0d6']), ['moda'], 'q'),
      item('q2', look(80, 36, ['#dcbda4']), ['moda'], 'q'),
    ])
    const authors = ranked.map(r => r.item.author)
    expect(authors).toHaveLength(4)
    for (let i = 1; i < authors.length; i++) {
      expect(authors[i]).not.toBe(authors[i - 1])
    }
  })

  it('suggests the best folders for an image, and none when nothing fits', () => {
    const neonBoard = profileOf([
      item('n1', NEON, ['rave']),
      item('n2', NEON, ['rave']),
    ])
    const boards = [
      {id: 'pastel', profile: board},
      {id: 'neon', profile: neonBoard},
    ]
    expect(
      suggestBoards(item('x', A({light: 86}), ['moda']), boards)[0].boardId,
    ).toBe('pastel')
    expect(suggestBoards(item('y', NOIR, ['luto']), boards)).toEqual([])
  })
})

describe('auto-grouping loose images', () => {
  it('proposes folders of 3+ and leaves strays loose', () => {
    const items = [
      item('p1', PASTEL, ['moda']),
      item('n1', NEON, ['rave']),
      item('p2', A({light: 86}), ['moda']),
      item('n2', NEON, ['rave']),
      item('p3', A({light: 90}), ['moda']),
      item('n3', {...NEON, light: 42}, ['rave']),
      item('stray', NOIR, ['luto']),
    ]
    const groups = groupPins(items)
    expect(groups).toHaveLength(2)
    const all = groups.flatMap(g => g.ids)
    expect(all).not.toContain('stray')
    const pastel = groups.find(g => g.ids.includes('p1'))
    expect(pastel?.ids.sort()).toEqual(['p1', 'p2', 'p3'])
    expect(pastel?.name).toMatch(/Pastel/)
    expect(pastel?.name).toMatch(/Moda/)
  })

  it('returns nothing for too few images', () => {
    expect(groupPins([item('a', PASTEL), item('b', PASTEL)])).toEqual([])
  })
})

describe('explore', () => {
  const viewer = profileOf([
    item('v1', PASTEL, ['moda']),
    item('v2', A({light: 86}), ['moda']),
  ])

  it('keeps the viewer look first and reserves slots for adjacent images', () => {
    const near = Array.from({length: 8}, (_, i) =>
      item(`near${i}`, A({light: 86 + (i % 3)}), ['moda'], `a${i}`),
    )
    // related but different: same tag, other look
    const adjacent = [
      item('adj1', NOIR, ['moda'], 'z1'),
      item('adj2', NEON, ['moda'], 'z2'),
    ]
    const out = rankExplore(viewer, [...near, ...adjacent], {limit: 10})
    const ids = out.map(o => o.id)
    expect(ids[0]).toMatch(/^near/)
    expect(ids.slice(0, 4).some(i => i.startsWith('adj'))).toBe(false)
    expect(ids[4]).toMatch(/^adj/) // the reserved fifth slot
  })

  it('does not personalise for an unknown viewer', () => {
    const out = rankExplore(profileOf([]), [item('b', NEON), item('a', PASTEL)])
    expect(out.map(o => o.id)).toEqual(['a', 'b'])
  })
})

describe('aesthetics as Conventions', () => {
  it('emits estetica:<mood> only for confident matches', () => {
    expect(aestheticConventionKeys(PASTEL)).toContain('estetica:pastel')
    expect(
      aestheticConventionKeys(
        A({light: 50, chroma: 100, warmth: -100, contrast: 100}),
        0.99,
      ),
    ).toEqual([])
  })
})
