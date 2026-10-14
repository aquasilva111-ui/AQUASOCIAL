import {router} from '#/routes'

describe('Routing compatibility', () => {
  it.each([
    ['/creators', 'Creators'],
    ['/communities', 'Communities'],
    ['/communities/id', 'CommunityDetail'],
    ['/portals/id', 'PortalDetail'],
    ['/charts', 'Charts'],
    ['/charts/rising', 'Charts'],
    ['/apps', 'Apps'],
    ['/apps/did:plc:creator/game', 'AppDetail'],
    ['/broadcast/id', 'BroadcastDetail'],
    ['/wallet', 'Wallet'],
    ['/analytics', 'Analytics'],
    ['/verification/request', 'VerificationRequest'],
    ['/verification/review', 'VerificationReview'],
    ['/ui-ai/workspaces/id', 'WorkspaceDetail'],
    ['/explore/ecosystem', 'EcosystemExplore'],
    ['/videos', 'VideosLegacy'],
    ['/videos/watch/alice/post', 'VideoWatchLegacy'],
    ['/images', 'ImagesLegacy'],
    ['/books', 'Books'],
    ['/views', 'Videos'],
    ['/noticias', 'NewsAtlas'],
    ['/music', 'Music'],
    ['/creative-hub', 'CreativeHub'],
    ['/launch', 'LaunchHub'],
    ['/settings', 'Settings'],
    ['/saved', 'Bookmarks'],
    ['/messages', 'Messages'],
  ])('matches %s without breaking existing routes', (path, name) =>
    expect(router.matchPath(path)[0]).toBe(name),
  )
  it('retains chart params and rejects invalid route depth', () => {
    expect(router.matchPath('/charts/rising')[1]).toEqual({chart: 'rising'})
    expect(router.matchPath('/apps/creator/game/extra')[0]).toBe('NotFound')
  })
})
