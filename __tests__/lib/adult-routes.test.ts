import {router} from '#/routes'

describe('adult routes', () => {
  it('resolves the creator dashboard before the creator profile pattern', () => {
    expect(router.matchPath('/adult/creator/dashboard')[0]).toBe(
      'AdultCreatorDashboard',
    )
  })

  it('resolves the portal web and publish screens', () => {
    expect(router.matchPath('/adult/web')[0]).toBe('AdultWeb')
    expect(router.matchPath('/adult/publish')[0]).toBe('AdultPublish')
    expect(router.matchPath('/adult')[0]).toBe('AdultHome')
  })

  it('still resolves creator profiles', () => {
    const [name, params] = router.matchPath('/adult/creator/alice.test')
    expect(name).toBe('AdultCreator')
    expect(params.name).toBe('alice.test')
  })
})
