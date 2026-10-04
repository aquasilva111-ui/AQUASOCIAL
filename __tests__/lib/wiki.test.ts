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

import {
  compoundPropsUrl,
  nasaSearchUrl,
  parseApod,
  parseCompound,
  parseNasaSearch,
} from '#/lib/wiki/sources'

describe('wiki extra sources', () => {
  it('parses NASA image search and strips html', () => {
    const [e] = parseNasaSearch({
      collection: {
        items: [
          {
            data: [
              {
                nasa_id: 'PIA1',
                title: 'Saturn',
                description: '<b>Rings</b> seen',
                date_created: '2017-09-15T00:00:00Z',
                center: 'JPL',
              },
            ],
            links: [{href: 'https://img/x.jpg'}],
          },
          {data: [{}]},
        ],
      },
    })
    expect(e).toMatchObject({
      source: 'NASA',
      id: 'PIA1',
      summary: 'Rings seen',
      image: 'https://img/x.jpg',
    })
    expect(e.facts).toContainEqual(['Data', '2017-09-15'])
    expect(parseNasaSearch(null)).toEqual([])
    expect(nasaSearchUrl('a b')).toContain('q=a%20b')
  })

  it('flags copyrighted APOD images and skips video', () => {
    expect(
      parseApod({
        title: 'T',
        explanation: 'x',
        url: 'u',
        media_type: 'image',
        date: '2026-10-04',
      })?.license,
    ).toContain('Domínio público')
    const c = parseApod({
      title: 'T',
      explanation: 'x',
      url: 'u',
      media_type: 'image',
      copyright: 'Ana',
    })
    expect(c?.license).toContain('Ana')
    expect(
      parseApod({title: 'T', url: 'v', media_type: 'video'})?.image,
    ).toBeUndefined()
    expect(parseApod({})).toBeUndefined()
  })

  it('parses a PubChem compound', () => {
    const e = parseCompound(
      {
        PropertyTable: {
          Properties: [
            {
              CID: 962,
              Title: 'Water',
              MolecularFormula: 'H2O',
              MolecularWeight: '18.015',
            },
          ],
        },
      },
      {
        InformationList: {
          Information: [{Title: 'Water', Description: 'A clear liquid.'}],
        },
      },
    )
    expect(e).toMatchObject({
      source: 'PubChem',
      id: '962',
      title: 'Water',
      summary: 'A clear liquid.',
    })
    expect(e?.facts).toContainEqual(['Fórmula', 'H2O'])
    expect(e?.image).toContain('/cid/962/PNG')
    expect(parseCompound({})).toBeUndefined()
    expect(compoundPropsUrl('a/b')).toContain('a%2Fb')
  })
})

import {
  formatValue,
  INDICATORS,
  parseCountries,
  parseEurostat,
  parseOwid,
  parseWorldBank,
  providersFor,
  seriesUrl,
} from '#/lib/wiki/stats'

describe('wiki country stats', () => {
  const pop = INDICATORS[0]

  it('parses World Bank rows sorted, skipping nulls', () => {
    expect(
      parseWorldBank([
        {},
        [
          {date: '2024', value: 2},
          {date: '2023', value: null},
          {date: '2022', value: 1},
        ],
      ]),
    ).toEqual([
      {year: 2022, value: 1},
      {year: 2024, value: 2},
    ])
  })

  it('parses Eurostat JSON-stat by time index', () => {
    expect(
      parseEurostat({
        dimension: {time: {category: {index: {'2025': 1, '2024': 0}}}},
        value: {0: 10, 1: 11},
      }),
    ).toEqual([
      {year: 2024, value: 10},
      {year: 2025, value: 11},
    ])
  })

  it('parses OWID csv', () => {
    expect(
      parseOwid('entity,code,year,v\nBrazil,BRA,2000,70.1\nBrazil,BRA,2001,x'),
    ).toEqual([{year: 2000, value: 70.1}])
  })

  it('drops World Bank aggregates from the country list', () => {
    const list = parseCountries([
      {},
      [
        {id: 'WLD', name: 'World', region: {id: 'NA'}},
        {
          id: 'BRA',
          iso2Code: 'BR',
          name: 'Brazil',
          region: {id: 'LCN', value: 'LatAm '},
        },
      ],
    ])
    expect(list.map(c => c.iso3)).toEqual(['BRA'])
  })

  it('offers Eurostat only for EU countries', () => {
    expect(providersFor(pop, 'PRT')).toContain('eurostat')
    expect(providersFor(pop, 'BRA')).not.toContain('eurostat')
    expect(() => seriesUrl('eurostat', pop, 'BRA')).toThrow()
    expect(seriesUrl('eurostat', pop, 'PRT')).toContain('geo=PT')
  })

  it('formats big numbers', () => {
    expect(formatValue(212812405, 'hab.')).toBe('212.8 M hab.')
    expect(formatValue(75.4, 'anos')).toBe('75.4 anos')
  })
})
