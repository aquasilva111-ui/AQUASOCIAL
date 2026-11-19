const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  copyPublicSiteFiles,
  PUBLIC_SITE_FILES,
} = require('../../scripts/public-site-files')

const ROOT = path.join(__dirname, '../..')
const ORIGIN = 'https://aquaapp.systems'
const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'

const DISALLOW = [
  '/adult',
  '/settings',
  '/messages',
  '/notifications',
  '/moderation',
  '/sys',
  '/saved',
  '/ui-ai',
  '/intent',
  '/gate',
  '/onboarding',
  '/oauth/callback',
]

const INSTITUTIONAL = [
  '/support',
  '/support/privacy',
  '/support/tos',
  '/support/community-guidelines',
  '/support/copyright',
]

const SECTIONS = [
  '/',
  '/search',
  '/visionboard',
  '/views',
  '/books',
  '/reads',
  '/noticias',
  '/music',
  '/drops',
  '/feeds',
  '/launch',
  '/creative-hub',
  '/docs',
  '/wiki',
]

function readWeb(rel: string) {
  return fs.readFileSync(path.join(ROOT, 'web', rel), 'utf8')
}

function assertWellFormedXml(xml: string, rootName: string) {
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
  expect(xml.endsWith('\n')).toBe(true)
  expect(xml.includes('<html')).toBe(false)
  const body = xml
    .replace(/^\s*<\?xml\s+version="1\.0"\s+encoding="UTF-8"\s*\?>\s*/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
  const stack: string[] = []
  const re = /<\/?([A-Za-z][\w:.-]*)([^>]*)>/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(body))) {
    const between = body.slice(last, match.index)
    if (between.trim() && stack.length === 0) {
      throw new Error(`text outside root: ${between.trim()}`)
    }
    last = match.index + match[0].length
    const name = match[1]
    if (match[0].endsWith('/>')) continue
    if (match[0].startsWith('</')) {
      expect(stack.pop()).toBe(name)
    } else {
      stack.push(name)
    }
  }
  expect(body.slice(last).trim()).toBe('')
  expect(stack).toEqual([])
  expect(body.trimStart().startsWith(`<${rootName}`)).toBe(true)
}

function locs(xml: string) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])
}

function parseRobots(text: string) {
  expect(text.endsWith('\n')).toBe(true)
  expect(text.includes('<html')).toBe(false)
  const groups: {agents: string[]; allow: string[]; disallow: string[]}[] = []
  const sitemaps: string[] = []
  const signals: string[] = []
  let current: {agents: string[]; allow: string[]; disallow: string[]} | null =
    null
  for (const raw of text.split(/\r?\n/)) {
    // A blank line ends a group. A comment line does not.
    if (!raw.trim()) {
      current = null
      continue
    }
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    const idx = line.indexOf(':')
    expect(idx).toBeGreaterThan(0)
    const field = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()
    if (field === 'user-agent') {
      if (!current) {
        current = {agents: [], allow: [], disallow: []}
        groups.push(current)
      }
      current.agents.push(value)
    } else if (field === 'allow') {
      expect(current).not.toBeNull()
      current!.allow.push(value)
    } else if (field === 'disallow') {
      expect(current).not.toBeNull()
      current!.disallow.push(value)
    } else if (field === 'sitemap') {
      sitemaps.push(value)
    } else if (field === 'content-signal') {
      expect(current).not.toBeNull()
      signals.push(value)
    } else {
      throw new Error(`unexpected robots field: ${field}`)
    }
  }
  return {groups, sitemaps, signals}
}

describe('public robots.txt and sitemap', () => {
  it('allows every crawler and blocks only private prefixes', () => {
    const {groups, sitemaps, signals} = parseRobots(readWeb('robots.txt'))
    expect(groups).toEqual([{agents: ['*'], allow: ['/'], disallow: DISALLOW}])
    expect(sitemaps).toEqual([`${ORIGIN}/sitemap.xml`])
    expect(signals).toEqual(['search=yes, ai-train=yes'])
    expect(readWeb('robots.txt')).not.toMatch(/^Disallow:\s*\/\s*$/m)
    expect(DISALLOW).not.toContain('/login')
    expect(DISALLOW).not.toContain('/register')
  })

  it('publishes a sitemap index of static public pages', () => {
    const index = readWeb('sitemap.xml')
    const institutional = readWeb('sitemaps/institutional.xml')
    const sections = readWeb('sitemaps/sections.xml')
    assertWellFormedXml(index, 'sitemapindex')
    assertWellFormedXml(institutional, 'urlset')
    assertWellFormedXml(sections, 'urlset')
    expect(index).toContain(`xmlns="${SITEMAP_NS}"`)
    expect(locs(index)).toEqual([
      `${ORIGIN}/sitemaps/institutional.xml`,
      `${ORIGIN}/sitemaps/sections.xml`,
      `${ORIGIN}/sitemap-posts.xml`,
      `${ORIGIN}/sitemap-profiles.xml`,
    ])
    expect(locs(institutional)).toEqual(INSTITUTIONAL.map(p => `${ORIGIN}${p}`))
    expect(locs(sections)).toEqual(
      SECTIONS.map(p => (p === '/' ? `${ORIGIN}/` : `${ORIGIN}${p}`)),
    )
    const listed = [...locs(institutional), ...locs(sections)].map(
      url => new URL(url).pathname.replace(/\/$/, '') || '/',
    )
    for (const pathName of listed) {
      expect(DISALLOW.some(prefix => pathName.startsWith(prefix))).toBe(false)
    }
    const posts = readWeb('sitemap-posts.xml')
    const profiles = readWeb('sitemap-profiles.xml')
    assertWellFormedXml(posts, 'urlset')
    assertWellFormedXml(profiles, 'urlset')
    for (const loc of [...locs(posts), ...locs(profiles)]) {
      const pathName = new URL(loc).pathname
      expect(loc.startsWith(`${ORIGIN}/profile/`)).toBe(true)
      expect(pathName === '/adult' || pathName.startsWith('/adult/')).toBe(
        false,
      )
      expect(pathName).not.toContain('.bsky.social')
      expect(pathName).not.toContain('.bsky.app')
      expect(pathName).not.toContain('.bsky.team')
    }
    expect(posts).not.toContain('/adult')
    expect(profiles).not.toContain('/adult')
    expect(institutional).not.toContain('/about')
    expect(institutional).not.toContain('/contact')
  })

  it('copies the files into an export directory', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-public-site-'))
    copyPublicSiteFiles(ROOT, out)
    for (const rel of PUBLIC_SITE_FILES) {
      expect(fs.readFileSync(path.join(out, rel), 'utf8')).toBe(readWeb(rel))
    }
    fs.rmSync(out, {recursive: true, force: true})
  })

  it('is copied by the web post-build and is not an SPA fallback', () => {
    const postBuild = fs.readFileSync(
      path.join(ROOT, 'scripts/post-web-build.js'),
      'utf8',
    )
    const htaccess = fs.readFileSync(path.join(ROOT, 'web/.htaccess'), 'utf8')
    expect(postBuild).toContain('copyPublicSiteFiles')
    const discoverAt = postBuild.indexOf('buildSiteDiscovery(')
    const copyAt = postBuild.lastIndexOf('copyPublicSiteFiles(')
    expect(discoverAt).toBeGreaterThan(-1)
    expect(copyAt).toBeGreaterThan(discoverAt)
    expect(htaccess).toMatch(/REQUEST_FILENAME\} -f/)
    expect(htaccess).toMatch(/AddType application\/xml \.xml/)
    const fileRule = htaccess.indexOf('REQUEST_FILENAME} -f')
    const terminal = htaccess.indexOf('RewriteRule ^ - [R=404,L]')
    expect(fileRule).toBeGreaterThan(-1)
    expect(terminal).toBeGreaterThan(fileRule)
    expect(htaccess).not.toMatch(/RewriteRule \^ index\.html/)
    expect(htaccess).toContain('robots-disallow-all.txt')
    expect(htaccess).toContain('X-Robots-Tag')
    expect(htaccess).toContain('!^aquaapp\\.systems')
    expect(readWeb('robots-disallow-all.txt')).toBe(
      'User-agent: *\nDisallow: /\n',
    )
    expect(readWeb('robots.txt')).not.toMatch(/^Disallow:\s*\/\s*$/m)
  })
})
