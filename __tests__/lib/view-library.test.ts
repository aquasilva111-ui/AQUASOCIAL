import {
  addListItem,
  addWatchLater,
  canViewList,
  dayBucket,
  groupHistory,
  HISTORY_LIMIT,
  LIST_COLLECTIONS,
  listToRecord,
  moveItem,
  newListRecord,
  normalizeHistory,
  normalizeList,
  normalizeRefs,
  recordHistory,
  removeListItem,
  removeWatchLater,
  searchHistory,
} from '#/lib/view-library/model'

const ref = (n: number) => ({
  uri: `at://did:plc:a/app.bsky.feed.post/p${n}`,
  did: 'did:plc:a',
  rkey: `p${n}`,
  title: `Video ${n}`,
  author: 'Ana',
})
const NOW = new Date(2026, 8, 30, 15, 0, 0).getTime()
const DAY = 24 * 60 * 60 * 1000

describe('stored refs', () => {
  it('drops malformed entries and duplicates', () => {
    const out = normalizeRefs([
      ref(1),
      ref(1),
      {uri: 'http://x', did: 'd', rkey: 'r'},
      null,
      {...ref(2), title: ''},
    ])
    expect(out.map(r => r.rkey)).toEqual(['p1', 'p2'])
    expect(out[1].title).toBe('Vídeo')
    expect(normalizeRefs('nope')).toEqual([])
  })

  it('normalizeHistory sorts newest first and rejects bad timestamps', () => {
    const out = normalizeHistory([
      {ref: ref(1), at: 10},
      {ref: ref(2), at: 30},
      {ref: ref(3), at: 'x'},
    ])
    expect(out.map(e => e.ref.rkey)).toEqual(['p2', 'p1'])
  })
})

describe('history', () => {
  it('moves a rewatched video to the top without duplicating', () => {
    let h = recordHistory([], ref(1), 1)
    h = recordHistory(h, ref(2), 2)
    h = recordHistory(h, ref(1), 3)
    expect(h.map(e => e.ref.rkey)).toEqual(['p1', 'p2'])
    expect(h[0].at).toBe(3)
  })

  it('caps the list', () => {
    let h: ReturnType<typeof recordHistory> = []
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) h = recordHistory(h, ref(i), i)
    expect(h).toHaveLength(HISTORY_LIMIT)
    expect(h[0].ref.rkey).toBe(`p${HISTORY_LIMIT + 4}`)
  })

  it('buckets by calendar day, not by 24h windows', () => {
    const lateLastNight = new Date(2026, 8, 29, 23, 59).getTime()
    expect(dayBucket(NOW, NOW)).toBe('Hoje')
    expect(dayBucket(lateLastNight, NOW)).toBe('Ontem')
    expect(dayBucket(NOW - 3 * DAY, NOW)).toBe('Esta semana')
    expect(dayBucket(NOW - 10 * DAY, NOW)).toBe('Mais antigos')
  })

  it('groups consecutive entries and searches title/author', () => {
    const h = [
      {ref: ref(1), at: NOW},
      {ref: ref(2), at: NOW - 1000},
      {ref: {...ref(3), author: 'Bia'}, at: NOW - 10 * DAY},
    ]
    expect(groupHistory(h, NOW).map(g => [g.label, g.items.length])).toEqual([
      ['Hoje', 2],
      ['Mais antigos', 1],
    ])
    expect(searchHistory(h, ' bia ')).toHaveLength(1)
    expect(searchHistory(h, 'video 2')).toHaveLength(1)
    expect(searchHistory(h, '')).toHaveLength(3)
  })
})

describe('watch later', () => {
  it('dedupes, removes and reorders', () => {
    let l = addWatchLater([], ref(1))
    l = addWatchLater(l, ref(2))
    l = addWatchLater(l, ref(1))
    l = addWatchLater(l, ref(3))
    expect(l.map(v => v.rkey)).toEqual(['p1', 'p2', 'p3'])
    expect(moveItem(l, 2, 0).map(v => v.rkey)).toEqual(['p3', 'p1', 'p2'])
    expect(moveItem(l, 0, 99).map(v => v.rkey)).toEqual(['p2', 'p3', 'p1'])
    expect(moveItem(l, 5, 0)).toBe(l)
    expect(removeWatchLater(l, ref(2).uri).map(v => v.rkey)).toEqual([
      'p1',
      'p3',
    ])
  })
})

describe('lists', () => {
  const uri = 'at://did:plc:a/place.aqua.view.playlist/3k1'

  it('builds a trimmed record with the right collection', () => {
    const rec = newListRecord('playlist', {
      title: `  ${'x'.repeat(100)} `,
      visibility: 'public',
    })
    expect(rec.$type).toBe(LIST_COLLECTIONS.playlist)
    expect(rec.title).toHaveLength(60)
    expect(rec.description).toBeUndefined()
  })

  it('round-trips and keeps only valid, unique post uris', () => {
    const rec = newListRecord('collection', {
      title: 'Favoritos',
      visibility: 'unlisted',
      items: addListItem([], ref(1).uri),
    })
    rec.items.push({
      uri: 'at://did:plc:a/app.bsky.actor.profile/self',
      addedAt: '',
    })
    rec.items.push({uri: ref(1).uri, addedAt: ''})
    const view = normalizeList('collection', {uri, value: rec})!
    expect(view.items.map(i => i.uri)).toEqual([ref(1).uri])
    expect(view.visibility).toBe('unlisted')
    expect(view.rkey).toBe('3k1')
  })

  it('rejects untitled lists and defaults unknown visibility to private', () => {
    expect(
      normalizeList('playlist', {uri, value: {title: ' '}}),
    ).toBeUndefined()
    expect(normalizeList('playlist', {uri, value: null})).toBeUndefined()
    const v = normalizeList('playlist', {
      uri,
      value: {title: 'a', visibility: 'weird'},
    })!
    expect(v.visibility).toBe('private')
  })

  it('addListItem ignores non-post and duplicate uris; remove works', () => {
    let items = addListItem([], ref(1).uri)
    items = addListItem(items, ref(1).uri)
    items = addListItem(items, 'https://x.com')
    expect(items).toHaveLength(1)
    expect(removeListItem(items, ref(1).uri)).toEqual([])
  })

  it('listToRecord keeps createdAt and applies the patch', () => {
    const view = normalizeList('playlist', {
      uri,
      value: newListRecord(
        'playlist',
        {title: 'A', visibility: 'public'},
        new Date('2026-01-01'),
      ),
    })!
    const rec = listToRecord(
      view,
      {title: 'B', visibility: 'private'},
      new Date('2026-02-01'),
    )
    expect(rec.title).toBe('B')
    expect(rec.visibility).toBe('private')
    expect(rec.createdAt).toBe('2026-01-01T00:00:00.000Z')
    expect(rec.updatedAt).toBe('2026-02-01T00:00:00.000Z')
  })

  it('private lists are owner-only', () => {
    const v = normalizeList('playlist', {
      uri,
      value: {title: 'a', visibility: 'private'},
    })!
    expect(canViewList(v, false)).toBe(false)
    expect(canViewList(v, true)).toBe(true)
  })
})
