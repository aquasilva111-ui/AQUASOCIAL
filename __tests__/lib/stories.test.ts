import {
  blobUrl,
  getPdsEndpoint,
  HIGHLIGHT_COLLECTION,
  HIGHLIGHT_ITEMS_MAX,
  HIGHLIGHT_TITLE_MAX,
  isExpired,
  newHighlightRecord,
  normalizeHighlight,
  normalizeOverlays,
  normalizeStory,
  OVERLAY_LIMITS,
  storiesToItems,
  STORY_TTL_MS,
  storyKey,
  validateHighlightDraft,
  validateStoryDraft,
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

describe('story overlays and text stories', () => {
  const uri = `at://${DID}/place.aqua.actor.story/t1`
  const text = {
    id: 'a',
    kind: 'text',
    text: ' oi ',
    x: 2,
    y: -1,
    scale: 99,
    color: 'red',
  }

  it('clamps and sanitises overlays from untrusted data', () => {
    const out = normalizeOverlays([
      text,
      {kind: 'sticker', text: '🔥', x: 0.2, y: 0.3, scale: 1, color: '#FFFFFF'},
      {kind: 'weird', text: 'x'},
      {kind: 'text', text: '   '},
      null,
    ])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({
      text: 'oi',
      x: 1,
      y: 0,
      scale: OVERLAY_LIMITS.scaleMax,
      color: '#FFFFFF',
    })
    expect(normalizeOverlays('x')).toEqual([])
    const many = Array.from({length: 40}, (_, i) => ({
      kind: 'sticker',
      text: '😀',
      id: `s${i}`,
    }))
    expect(normalizeOverlays(many)).toHaveLength(OVERLAY_LIMITS.items)
  })

  it('accepts a text-only story only with a colour and an overlay', () => {
    const ok = normalizeStory(
      {
        uri,
        value: {
          createdAt: '2026-01-01T00:00:00Z',
          background: '#7C3AED',
          overlays: [text],
        },
      },
      CTX,
    )!
    expect(ok.mediaUrl).toBeUndefined()
    expect(ok.background).toBe('#7C3AED')
    expect(
      normalizeStory(
        {
          uri,
          value: {createdAt: '2026-01-01T00:00:00Z', background: '#7C3AED'},
        },
        CTX,
      ),
    ).toBeUndefined()
    expect(
      normalizeStory(
        {
          uri,
          value: {
            createdAt: '2026-01-01T00:00:00Z',
            background: 'purple',
            overlays: [text],
          },
        },
        CTX,
      ),
    ).toBeUndefined()
  })

  it('treats legacy image stories as contain-fit with no overlays', () => {
    const v = story('legacy')
    expect(v.fit).toBe('contain')
    expect(v.overlays).toEqual([])
  })

  it('validates drafts', () => {
    const o = normalizeOverlays([text])
    expect(validateStoryDraft({hasMedia: true, overlays: []})).toBeUndefined()
    expect(
      validateStoryDraft({hasMedia: false, background: '#111111', overlays: o}),
    ).toBeUndefined()
    expect(
      validateStoryDraft({
        hasMedia: false,
        background: '#111111',
        overlays: [],
      }),
    ).toBe('empty')
    expect(validateStoryDraft({hasMedia: false, overlays: o})).toBe('empty')
  })

  it('keeps text stories in a highlight and dedupes them by content', () => {
    const t = normalizeStory(
      {
        uri,
        value: {
          createdAt: '2026-01-01T00:00:00Z',
          background: '#7C3AED',
          overlays: [text],
        },
      },
      CTX,
    )!
    expect(storyKey(t)).toBe(storyKey({...t}))
    const items = storiesToItems([t, {...t}, story('a')])
    expect(items).toHaveLength(2)
    expect(items[0].media).toBeUndefined()
    const view = normalizeHighlight(
      {
        uri: `at://${DID}/${HIGHLIGHT_COLLECTION}/h`,
        value: newHighlightRecord('Frases', [t]),
      },
      CTX,
    )!
    expect(view.items[0].overlays[0].text).toBe('oi')
    expect(view.coverUrl).toBeUndefined()
  })
})
