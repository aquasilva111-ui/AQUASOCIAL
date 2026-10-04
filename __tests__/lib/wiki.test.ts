import {
  articleUrl,
  isRtl,
  parseSearch,
  parseSummary,
  searchUrl,
  summaryUrl,
  WIKI_LANGUAGES,
} from '#/lib/wiki/model'

describe('wiki model', () => {
  it('has unique language codes', () => {
    const codes = WIKI_LANGUAGES.map(l => l.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('builds urls per language and encodes titles', () => {
    expect(summaryUrl('pt', 'Sao Paulo')).toBe(
      'https://pt.wikipedia.org/api/rest_v1/page/summary/Sao_Paulo',
    )
    expect(searchUrl('en', 'a b&c')).toContain('q=a%20b%26c')
    expect(articleUrl('ja', '土星')).toBe(
      'https://ja.wikipedia.org/wiki/%E5%9C%9F%E6%98%9F',
    )
  })

  it('rejects unknown languages so input cannot choose the host', () => {
    expect(() => summaryUrl('evil.com/#', 'x')).toThrow()
  })

  it('flags rtl languages', () => {
    expect(isRtl('ar')).toBe(true)
    expect(isRtl('pt')).toBe(false)
  })

  it('parses a summary with attribution', () => {
    const e = parseSummary('pt', {
      title: 'Saturno',
      extract: 'Saturno é o sexto planeta.',
      thumbnail: {source: 'https://x/y.jpg'},
      content_urls: {desktop: {page: 'https://pt.wikipedia.org/wiki/Saturno'}},
      wikibase_item: 'Q193',
    })
    expect(e).toMatchObject({
      title: 'Saturno',
      wikidataId: 'Q193',
      source: 'Wikipedia',
      license: 'CC BY-SA 4.0',
    })
    expect(parseSummary('pt', {})).toBeUndefined()
  })

  it('parses search hits and fixes protocol-relative thumbnails', () => {
    const hits = parseSearch({
      pages: [
        {
          title: 'Saturno',
          description: 'planeta',
          thumbnail: {url: '//up/x.jpg'},
        },
        {},
      ],
    })
    expect(hits).toEqual([
      {title: 'Saturno', description: 'planeta', image: 'https://up/x.jpg'},
    ])
    expect(parseSearch(null)).toEqual([])
  })
})
