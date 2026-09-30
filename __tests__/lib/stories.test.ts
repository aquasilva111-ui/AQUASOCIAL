import {
  blobUrl,
  getPdsEndpoint,
  HIGHLIGHT_COLLECTION,
  HIGHLIGHT_ITEMS_MAX,
  HIGHLIGHT_TITLE_MAX,
  isExpired,
  newHighlightRecord,
  normalizeHighlight,
  normalizeStory,
  storiesToItems,
  STORY_TTL_MS,
  validateHighlightDraft,
} from '#/lib/stories/model'

const DID = 'did:plc:owner000000000000000000'
const CTX = {did: DID, pdsUrl: 'https://pds.example/'}
const blob = (cid: string, mimeType = 'image/jpeg') => ({
  $type: 'blob',
  ref: {$link: cid},
  mimeType,
  size: 10,
})
const story = (cid: string, createdAt = '2026-01-01T00:00:00.000Z') =>
  normalizeStory(
    {
      uri: `at://${DID}/place.aqua.actor.story/${cid}`,
      value: {createdAt, media: blob(cid)},
    },
    CTX,
  )!

describe('stories', () => {
  it('expires after 24h and treats bad dates as expired', () => {
    const now = Date.parse('2026-01-02T00:00:00Z')
    expect(
      isExpired(new Date(now - STORY_TTL_MS + 1000).toISOString(), now),
    ).toBe(false)
    expect(
      isExpired(new Date(now - STORY_TTL_MS - 1000).toISOString(), now),
    ).toBe(true)
    expect(isExpired('nope', now)).toBe(true)
  })

  it('builds blob urls without double slashes and encodes params', () => {
    expect(blobUrl('https://pds.example/', DID, 'bafy')).toBe(
      `https://pds.example/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(DID)}&cid=bafy`,
    )
  })

  it('finds the PDS endpoint', () => {
    expect(
      getPdsEndpoint({
        service: [{id: '#atproto_pds', serviceEndpoint: 'https://p'}],
      }),
    ).toBe('https://p')
    expect(getPdsEndpoint({service: []})).toBeUndefined()
    expect(getPdsEndpoint(null)).toBeUndefined()
  })

  it('normalizeStory rejects malformed / non-image records', () => {
    const uri = `at://${DID}/place.aqua.actor.story/x`
    expect(normalizeStory({uri, value: {}}, CTX)).toBeUndefined()
    expect(
      normalizeStory({uri, value: {createdAt: 'bad', media: blob('a')}}, CTX),
    ).toBeUndefined()
    expect(
      normalizeStory(
        {
          uri,
          value: {
            createdAt: '2026-01-01T00:00:00Z',
            media: blob('a', 'text/html'),
          },
        },
        CTX,
      ),
    ).toBeUndefined()
    expect(story('a').rkey).toBe('a')
  })
})

describe('highlights', () => {
  const uri = `at://${DID}/${HIGHLIGHT_COLLECTION}/h1`

  it('creates a trimmed, capped record that keeps the blob refs', () => {
    const rec = newHighlightRecord(`  ${'x'.repeat(50)}  `, [
      story('a'),
      story('b'),
    ])
    expect(rec.title).toHaveLength(HIGHLIGHT_TITLE_MAX)
    expect(rec.items.map(i => i.media.ref.$link)).toEqual(['a', 'b'])
    expect(rec.$type).toBe(HIGHLIGHT_COLLECTION)
  })

  it('dedupes by blob and caps item count', () => {
    expect(storiesToItems([story('a'), story('a')])).toHaveLength(1)
    const many = Array.from({length: HIGHLIGHT_ITEMS_MAX + 5}, (_, i) =>
      story(`c${i}`),
    )
    expect(storiesToItems(many)).toHaveLength(HIGHLIGHT_ITEMS_MAX)
  })

  it('round-trips through normalizeHighlight; cover is first item', () => {
    const rec = newHighlightRecord('Viagem', [story('a'), story('b')])
    const view = normalizeHighlight({uri, value: rec}, CTX)!
    expect(view.title).toBe('Viagem')
    expect(view.items).toHaveLength(2)
    expect(view.coverUrl).toBe(view.items[0].mediaUrl)
    expect(view.items[0].uri).not.toBe(view.items[1].uri)
  })

  it('drops invalid items and rejects empty/untitled highlights', () => {
    const good = {media: blob('a'), createdAt: '2026-01-01T00:00:00Z'}
    const bad = {media: {ref: {}}}
    const view = normalizeHighlight(
      {uri, value: {title: 'T', items: [bad, good]}},
      CTX,
    )!
    expect(view.items).toHaveLength(1)
    expect(
      normalizeHighlight({uri, value: {title: 'T', items: [bad]}}, CTX),
    ).toBeUndefined()
    expect(
      normalizeHighlight({uri, value: {title: '  ', items: [good]}}, CTX),
    ).toBeUndefined()
    expect(normalizeHighlight({uri, value: {title: 'T'}}, CTX)).toBeUndefined()
  })

  it('validates drafts', () => {
    expect(validateHighlightDraft(' ', 2)).toBe('title')
    expect(validateHighlightDraft('a', 0)).toBe('items')
    expect(validateHighlightDraft('a', 1)).toBeUndefined()
  })
})
