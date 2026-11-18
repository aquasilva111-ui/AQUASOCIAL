import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

import {
  AQUA_PDS_HOSTS,
  canonicalForPathname,
  capSitemapUrls,
  CONTENT_SIGNAL,
  headBootstrapScript,
  INCLUDE_AQUA_POSTS_IN_SITEMAP,
  INCLUDE_AQUA_PROFILES_IN_SITEMAP,
  isBlueskyHostedHandle,
  loadAquaSitemap,
  ROBOTS_DISALLOW_PREFIXES,
  SITEMAP_FORBIDDEN_PREFIXES,
  SITEMAP_URL_LIMIT,
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

  it('lists Aqua posts and profiles in the sitemap index', () => {
    expect(INCLUDE_AQUA_POSTS_IN_SITEMAP).toBe(true)
    expect(INCLUDE_AQUA_PROFILES_IN_SITEMAP).toBe(true)
    expect(AQUA_PDS_HOSTS).toEqual([])
    const index = readWeb('sitemap.xml')
    expect(index).toContain('<sitemapindex')
    expect(index).toContain('/sitemaps/institutional.xml')
    expect(index).toContain('/sitemaps/sections.xml')
    expect(index).toContain('/sitemap-posts.xml')
    expect(index).toContain('/sitemap-profiles.xml')
    expect(readWeb('sitemap-posts.xml')).not.toContain('<loc>')
    expect(readWeb('sitemap-profiles.xml')).not.toContain('<loc>')
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

  it('queries the AppView only for repos on an Aqua PDS', async () => {
    let called = false
    const skipped = await loadAquaSitemap({
      hosts: [],
      fetchImpl: async () => {
        called = true
        throw new Error('should not be called')
      },
    })
    expect(called).toBe(false)
    expect(skipped.posts).toEqual([])
    expect(skipped.profiles).toEqual([])
    expect(skipped.warning).toContain('AQUA_PDS_HOSTS')

    const failed = await loadAquaSitemap({
      hosts: ['pds.example.test'],
      fetchImpl: async () => {
        throw new Error('network down')
      },
    })
    expect(failed.posts).toEqual([])
    expect(failed.profiles).toEqual([])
    expect(failed.warning).toMatch(/failed/i)

    const fetchImpl = async (url: string) => {
      if (url.includes('listRepos')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            repos: [
              {did: 'did:plc:aqua'},
              {did: 'did:plc:bsky'},
              {did: 'did:plc:adult'},
            ],
          }),
        }
      }
      if (url.includes('getProfile') && url.includes('did%3Aplc%3Aaqua')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({handle: 'ada.example.test', labels: []}),
        }
      }
      if (url.includes('getProfile') && url.includes('did%3Aplc%3Absky')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({handle: 'ada.bsky.social', labels: []}),
        }
      }
      if (url.includes('getProfile') && url.includes('did%3Aplc%3Aadult')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            handle: 'adult.example.test',
            labels: [{val: 'porn'}],
          }),
        }
      }
      if (url.includes('getAuthorFeed') && url.includes('did%3Aplc%3Aaqua')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            feed: [
              {
                post: {
                  uri: 'at://did:plc:aqua/app.bsky.feed.post/3ok',
                  labels: [],
                },
              },
              {
                post: {
                  uri: 'at://did:plc:aqua/app.bsky.feed.post/3no',
                  labels: [{val: 'sexual'}],
                },
              },
            ],
          }),
        }
      }
      return {ok: true, status: 200, json: async () => ({feed: []})}
    }
    const listed = await loadAquaSitemap({
      hosts: ['pds.example.test'],
      fetchImpl,
    })
    expect(listed.profiles).toEqual([
      'https://aquaapp.systems/profile/ada.example.test',
    ])
    expect(listed.posts).toEqual([
      'https://aquaapp.systems/profile/ada.example.test/post/3ok',
    ])
    expect(
      capSitemapUrls(
        new Array(SITEMAP_URL_LIMIT + 1).fill(
          'https://aquaapp.systems/profile/ada.example.test',
        ),
      ),
    ).toHaveLength(SITEMAP_URL_LIMIT)
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
