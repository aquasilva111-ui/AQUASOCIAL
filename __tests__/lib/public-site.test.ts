import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

import {
  canonicalForPathname,
  CONTENT_SIGNAL,
  headBootstrapScript,
  INCLUDE_AQUA_POSTS_IN_SITEMAP,
  INCLUDE_AQUA_PROFILES_IN_SITEMAP,
  isBlueskyHostedHandle,
  ROBOTS_DISALLOW_PREFIXES,
  SITEMAP_FORBIDDEN_PREFIXES,
  sitemapSections,
  SPA_FALLBACK_PREFIXES,
} from '#/lib/public-site'
import {postOriginFromHandle} from '#/components/AquaPostCard/model'

const webRoot = path.join(__dirname, '../../web')

function readWeb(name: string) {
  return fs.readFileSync(path.join(webRoot, name), 'utf8')
}

function routePaths() {
  const source = fs.readFileSync(
    path.join(__dirname, '../../src/routes.ts'),
    'utf8',
  )
  return [...source.matchAll(/'(\/[^']*)'/g)].map(match => match[1])
}

function firstSegment(urlPath: string) {
  return urlPath.split('/').filter(Boolean)[0] ?? ''
}

describe('public site', () => {
  it('publishes the owner Content-Signal from one constant', () => {
    expect(CONTENT_SIGNAL).toBe('search=yes, ai-input=yes, ai-train=yes')
    const robots = readWeb('robots.txt')
    expect(robots).toContain(`Content-Signal: ${CONTENT_SIGNAL}`)
    expect(robots.match(/^User-agent: \*$/gm)).toEqual(['User-agent: *'])
    expect(robots).toContain('Sitemap: https://aquaapp.systems/sitemap.xml')
  })

  it('disallows every Aqua+18 route for all user-agents and keeps it out of the sitemap', () => {
    const adultPaths = routePaths().filter(urlPath =>
      urlPath.startsWith('/adult'),
    )
    expect(adultPaths.length).toBeGreaterThan(10)
    expect(adultPaths).toEqual(
      expect.arrayContaining([
        '/adult',
        '/adult/feed',
        '/adult/creators',
        '/adult/creator/dashboard',
        '/adult/views',
        '/adult/messages',
        '/adult/settings',
      ]),
    )
    const robots = readWeb('robots.txt')
    expect(robots).toContain('Disallow: /adult')
    for (const urlPath of adultPaths) {
      expect(
        ROBOTS_DISALLOW_PREFIXES.some(
          prefix => urlPath === prefix || urlPath.startsWith(`${prefix}/`),
        ),
      ).toBe(true)
    }

    const listed = sitemapSections().flatMap(section => section.urls)
    const sitemap = [
      readWeb('sitemap.xml'),
      readWeb('sitemaps/institutional.xml'),
      readWeb('sitemaps/sections.xml'),
    ].join('\n')
    for (const url of listed) {
      for (const prefix of SITEMAP_FORBIDDEN_PREFIXES) {
        const path = new URL(url).pathname
        expect(path === prefix || path.startsWith(`${prefix}/`)).toBe(false)
      }
    }
    expect(sitemap).not.toContain('/adult')
    expect(sitemap).not.toContain('/messages')
    expect(sitemap).not.toContain('/settings')
    expect(sitemap).not.toContain('/profile/')
  })

  it('keeps Aqua posts and profiles behind a flag and uses a sitemap index', () => {
    expect(INCLUDE_AQUA_POSTS_IN_SITEMAP).toBe(false)
    expect(INCLUDE_AQUA_PROFILES_IN_SITEMAP).toBe(false)
    const index = readWeb('sitemap.xml')
    expect(index).toContain('<sitemapindex')
    expect(index).toContain('/sitemaps/institutional.xml')
    expect(index).toContain('/sitemaps/sections.xml')
    expect(index).not.toContain('/sitemaps/posts.xml')
    expect(index).not.toContain('/sitemaps/profiles.xml')
    expect(readWeb('sitemaps/sections.xml')).toContain(
      'https://aquaapp.systems/visionboard',
    )
    expect(readWeb('sitemaps/sections.xml')).toContain(
      'https://aquaapp.systems/books',
    )
    expect(readWeb('sitemaps/institutional.xml')).toContain(
      'https://aquaapp.systems/about',
    )
  })

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

  it('falls back to the SPA for real routes and 404s unknown prefixes', () => {
    const htaccess = readWeb('.htaccess')
    const block = htaccess.match(
      /# BEGIN spa-fallback-prefixes[\s\S]*?# END spa-fallback-prefixes/,
    )?.[0]
    expect(block).toBeTruthy()
    for (const prefix of SPA_FALLBACK_PREFIXES) {
      expect(block).toContain(prefix)
    }
    for (const urlPath of routePaths()) {
      const segment = firstSegment(urlPath)
      if (!segment) {
        expect(htaccess).toContain('RewriteCond %{REQUEST_URI} ^/$')
        continue
      }
      if (segment === 'videos') {
        expect(htaccess).toContain('^videos(/.*)?$ /views$1 [R=301,L]')
        continue
      }
      expect(SPA_FALLBACK_PREFIXES).toContain(segment)
    }
    expect(htaccess).toContain('RewriteRule ^ - [R=404,L]')
    expect(htaccess).toContain('ErrorDocument 404 /404.html')
    expect(htaccess).toContain('text/markdown')
    expect(htaccess).toContain(
      '</llms.txt>; rel=\\"alternate\\"; type=\\"text/markdown\\"',
    )
  })

  it('describes Aqua in llms.txt without adult, messages, or settings links', () => {
    const llms = readWeb('llms.txt')
    expect(llms).toContain('Visionboard')
    expect(llms).toContain('Launch Hub')
    expect(readWeb('index.md')).toBe(llms)
    expect(llms).not.toContain('](https://aquaapp.systems/adult')
    expect(llms).not.toContain('](https://aquaapp.systems/messages')
    expect(llms).not.toContain('](https://aquaapp.systems/settings')
  })
})
