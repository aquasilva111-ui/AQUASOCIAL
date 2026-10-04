import {router} from '#/routes'

describe('docs routes', () => {
  it('resolves the docs home', () => {
    expect(router.matchPath('/docs')[0]).toBe('DocsHome')
  })

  it('resolves a document editor with id', () => {
    const [name, params] = router.matchPath('/docs/abc123')
    expect(name).toBe('DocEditor')
    expect(params.id).toBe('abc123')
  })

  it('builds paths from route names', () => {
    expect(router.build('DocsHome', {})).toBe('/docs')
    expect(router.build('DocEditor', {id: 'xyz'})).toBe('/docs/xyz')
  })
})

describe('wiki routes', () => {
  it('resolves the wiki home', () => {
    expect(router.matchPath('/wiki')[0]).toBe('WikiHome')
  })
})
