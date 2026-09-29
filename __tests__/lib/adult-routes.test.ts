import {router} from '#/routes'

describe('adult routes', () => {
  it('resolves the creator dashboard before the creator profile pattern', () => {
    expect(router.matchPath('/adult/creator/dashboard')[0]).toBe(
      'AdultCreatorDashboard',
    )
  })

  it('still resolves creator profiles', () => {
    const [name, params] = router.matchPath('/adult/creator/alice.test')
    expect(name).toBe('AdultCreator')
    expect(params.name).toBe('alice.test')
  })
})
