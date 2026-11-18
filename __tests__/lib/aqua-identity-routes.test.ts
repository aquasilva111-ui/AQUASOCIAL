import {router} from '#/routes'

describe('AQUA Identity routes', () => {
  test('login, register, onboarding, callback, and settings resolve', () => {
    expect(router.matchPath('/login')[0]).toBe('AquaIdentityLogin')
    expect(router.matchPath('/register')[0]).toBe('AquaIdentityRegister')
    expect(router.matchPath('/onboarding')[0]).toBe('AquaIdentityOnboarding')
    expect(router.matchPath('/oauth/callback')[0]).toBe('AquaIdentityCallback')
    expect(router.matchPath('/settings/identity')[0]).toBe(
      'AquaIdentitySettings',
    )
    expect(router.matchPath('/settings')[0]).toBe('Settings')
  })
})
