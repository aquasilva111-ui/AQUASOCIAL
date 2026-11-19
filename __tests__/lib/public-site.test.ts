import vm from 'node:vm'

import {
  canonicalForPathname,
  headBootstrapScript,
  isBlueskyHostedHandle,
} from '#/lib/public-site'
import {postOriginFromHandle} from '#/components/AquaPostCard/model'

describe('public site canonical', () => {
  it('points Bluesky-hosted posts at bsky.app and Aqua posts at aquaapp.systems', () => {
    expect(isBlueskyHostedHandle('ada.bsky.social')).toBe(
      postOriginFromHandle('ada.bsky.social') === 'bluesky',
    )
    expect(isBlueskyHostedHandle('ada.aquaapp.online')).toBe(
      postOriginFromHandle('ada.aquaapp.online') === 'bluesky',
    )
    expect(canonicalForPathname('/profile/ada.bsky.social/post/3abc')).toBe(
      'https://bsky.app/profile/ada.bsky.social/post/3abc',
    )
    expect(canonicalForPathname('/profile/ada.aquaapp.online/post/3abc')).toBe(
      'https://aquaapp.systems/profile/ada.aquaapp.online/post/3abc',
    )
    expect(canonicalForPathname('/')).toBe('https://aquaapp.systems/')
  })

  it('runs the same canonical rules in the homepage bootstrap script', () => {
    const samples = [
      '/',
      '/visionboard',
      '/profile/ada.bsky.social/post/3abc',
      '/profile/ada.bsky.app/post/3abc',
      '/profile/ada.aquaapp.online/post/3abc/',
    ]
    for (const sample of samples) {
      const canonical = {href: ''}
      const og = {content: ''}
      const heading = {removed: false}
      const document = {
        getElementById(id: string) {
          if (id === 'canonical') return canonical
          if (id === 'aqua-home-heading') return heading
          return null
        },
        querySelector() {
          return og
        },
      }
      canonical.setAttribute = (name: string, value: string) => {
        if (name === 'href') canonical.href = value
      }
      og.setAttribute = (name: string, value: string) => {
        if (name === 'content') og.content = value
      }
      heading.remove = () => {
        heading.removed = true
      }
      const context = vm.createContext({
        document,
        location: {pathname: sample},
        decodeURIComponent,
        encodeURIComponent,
      })
      vm.runInContext(headBootstrapScript(), context)
      expect(canonical.href).toBe(canonicalForPathname(sample))
      expect(og.content).toBe(canonicalForPathname(sample))
      expect(heading.removed).toBe(sample !== '/')
    }
  })
})
