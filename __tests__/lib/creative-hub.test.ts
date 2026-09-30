import {
  filterTemplates,
  formatById,
  formatRatio,
  FORMATS,
  formatSize,
  HUB_TABS,
  hubPath,
  isHubTab,
  TEMPLATES,
} from '#/lib/creative-hub/model'
import {router} from '#/routes'

describe('creative hub', () => {
  it('has the five sections and validates tab ids', () => {
    expect(HUB_TABS.map(t => t.id)).toEqual([
      'home',
      'templates',
      'projects',
      'docs',
      'brand',
    ])
    expect(isHubTab('docs')).toBe(true)
    expect(isHubTab('nope')).toBe(false)
    expect(isHubTab(undefined)).toBe(false)
  })

  it('home is the bare path and the rest are nested', () => {
    expect(hubPath()).toBe('/creative-hub')
    expect(hubPath('docs')).toBe('/creative-hub/docs')
  })

  it('routes resolve to the hub screens', () => {
    expect(router.matchPath('/creative-hub')[0]).toBe('CreativeHub')
    expect(router.matchPath('/creative-hub/docs')).toEqual([
      'CreativeHubTab',
      {tab: 'docs'},
    ])
    // The standalone Docs routes keep working.
    expect(router.matchPath('/docs')[0]).toBe('DocsHome')
    expect(router.matchPath('/docs/abc')[0]).toBe('DocEditor')
  })

  it('every template points at a real design format', () => {
    for (const t of TEMPLATES) {
      expect(FORMATS.some(f => f.id === t.format)).toBe(true)
      expect(t.id).toBeTruthy()
    }
    expect(new Set(TEMPLATES.map(t => t.id)).size).toBe(TEMPLATES.length)
  })

  it('only docs are available until the design editor exists', () => {
    expect(FORMATS.filter(f => f.available).map(f => f.id)).toEqual(['doc'])
    expect(formatSize(formatById('post'))).toBe('1080 × 1350')
    expect(formatSize(formatById('doc'))).toBe('Documento')
    expect(formatRatio(formatById('post'))).toBe('4:5')
    expect(formatRatio(formatById('story'))).toBe('9:16')
    expect(formatRatio(formatById('book_cover'))).toBe('2:3')
    expect(formatRatio(formatById('doc'))).toBe('Aa')
  })

  it('filters templates by category and text', () => {
    expect(
      filterTemplates(TEMPLATES, {category: 'livros'}).every(
        t => t.category === 'livros',
      ),
    ).toBe(true)
    expect(filterTemplates(TEMPLATES, {query: '  LIVE '})).toHaveLength(1)
    expect(filterTemplates(TEMPLATES, {query: 'zzz'})).toHaveLength(0)
    expect(filterTemplates(TEMPLATES, {})).toHaveLength(TEMPLATES.length)
  })
})
