import {
  conventionById,
  CONVENTIONS,
  NEWS,
  newsForConvention,
  relatedTo,
  searchAtlas,
} from '#/screens/NewsAtlas/data'
import {generateNetwork} from '#/screens/NewsAtlas/network'

describe('news atlas data', () => {
  it('every news item points to existing Convenções', () => {
    for (const n of NEWS) {
      expect(n.conventions.length).toBeGreaterThan(0)
      for (const id of n.conventions) expect(conventionById(id)).toBeDefined()
    }
  })

  it('is many-to-many: some news has several Convenções and some Convenção has several news', () => {
    expect(NEWS.some(n => n.conventions.length > 1)).toBe(true)
    expect(CONVENTIONS.some(c => newsForConvention(c.id).length > 1)).toBe(true)
  })

  it('relatedTo lights the related side for both entry points', () => {
    const fromNews = relatedTo({kind: 'news', id: 'n1'})
    expect([...fromNews.conv].sort()).toEqual(['dem', 'eco'])
    const fromConv = relatedTo({kind: 'conv', id: 'dem'})
    expect(fromConv.news.has('n1')).toBe(true)
    expect(relatedTo(null).news.size).toBe(0)
  })

  it('search finds news through the Convenções they activate, ignoring accents', () => {
    const r = searchAtlas('inteligencia artificial')
    expect(r.conv.map(c => c.id)).toContain('ia')
    expect(r.news.map(n => n.id)).toContain('n2')
    expect(searchAtlas('').news).toHaveLength(NEWS.length)
    expect(searchAtlas('zzzz').conv).toHaveLength(0)
  })
})

describe('network generators', () => {
  it('produce deterministic, non-empty art for every kind', () => {
    for (const c of CONVENTIONS) {
      const a = generateNetwork(c.kind, c.seed, c.palette)
      expect(a.length).toBeGreaterThan(20)
      expect(generateNetwork(c.kind, c.seed, c.palette)).toEqual(a)
    }
  })
})
