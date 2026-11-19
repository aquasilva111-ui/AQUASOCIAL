const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const {after, before, test} = require('node:test')

const {buildSiteDiscovery} = require('./build-site-discovery')
const {createSiteServer} = require('../server')
const {origin, pages, email} = require('../web/site-info')

const projectRoot = path.join(__dirname, '..')
let directory
let server
let baseUrl

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aqua-discovery-test-'))
  for (const file of [
    'src/routes.ts',
    'web/.htaccess',
    'web/robots.txt',
    'web/sitemap.xml',
    'web/sitemaps/institutional.xml',
    'web/sitemaps/sections.xml',
    'web/webmcp.js',
  ]) {
    const target = path.join(directory, file)
    await fs.mkdir(path.dirname(target), {recursive: true})
    await fs.copyFile(path.join(projectRoot, file), target)
  }
  const template = await fs.readFile(
    path.join(projectRoot, 'web/index.html'),
    'utf8',
  )
  buildSiteDiscovery(directory, template)
  const root = path.join(directory, 'web-build')
  const staticFiles = path.join(root, 'static/js')
  await fs.mkdir(staticFiles, {recursive: true})
  await fs.writeFile(path.join(staticFiles, 'test.js'), 'console.log("chunk")')
  server = createSiteServer(root)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (server?.listening) await new Promise(resolve => server.close(resolve))
  if (directory) await fs.rm(directory, {recursive: true, force: true})
})

test('publishes crawl files and indexable pages with unique titles, headings and canonicals', async () => {
  const robots = await fetch(`${baseUrl}/robots.txt`)
  const robotsText = await robots.text()
  assert.match(robotsText, /Content-Signal: search=yes, ai-train=yes/)
  assert.match(robotsText, /^Disallow: \/onboarding$/m)
  assert.match(robotsText, /^Disallow: \/oauth\/callback$/m)
  assert.doesNotMatch(robotsText, /^Disallow: \/login$/m)
  assert.doesNotMatch(robotsText, /^Disallow: \/register$/m)
  const sitemap = await fetch(`${baseUrl}/sitemap.xml`)
  assert.match(sitemap.headers.get('content-type'), /^application\/xml/)
  const xml = await sitemap.text()
  assert.match(xml, /<sitemapindex\b/)
  assert.ok(xml.includes(`${origin}/sitemaps/institutional.xml`))
  assert.ok(xml.includes(`${origin}/sitemaps/sections.xml`))
  for (const child of [
    '/sitemaps/institutional.xml',
    '/sitemaps/sections.xml',
  ]) {
    const childResponse = await fetch(baseUrl + child)
    assert.equal(childResponse.status, 200, child)
    assert.match(
      childResponse.headers.get('content-type') || '',
      /^application\/xml/,
    )
  }
  for (const page of Object.keys(pages)) {
    const response = await fetch(baseUrl + page)
    assert.equal(response.status, 200)
    const html = await response.text()
    assert.equal((html.match(/<h1\b/g) || []).length, 1, page)
    assert.ok(html.includes(`rel="canonical" href="${origin + page}"`), page)
    assert.ok(html.includes('name="description"'), page)
    const json = JSON.parse(
      html.match(/<script type="application\/ld\+json">(.+?)<\/script>/)[1],
    )
    assert.equal(
      json['@graph'].find(node => node['@type'] === 'Organization').email,
      email,
    )
  }
  const home = await (await fetch(baseUrl)).text()
  for (const url of ['/about', '/contact', '/terms', `mailto:${email}`]) {
    assert.ok(home.includes(`href="${url}"`))
  }
})

test('negotiates Markdown with Vary and advertises discovery links', async () => {
  const html = await fetch(baseUrl, {
    headers: {Accept: 'text/markdown;q=0.2, text/html'},
  })
  assert.match(html.headers.get('content-type'), /^text\/html/)
  const markdown = await fetch(baseUrl, {headers: {Accept: 'text/markdown'}})
  assert.match(markdown.headers.get('content-type'), /^text\/markdown/)
  assert.equal(markdown.headers.get('vary'), 'Accept')
  assert.match(markdown.headers.get('link'), /<\/llms\.txt>.*<\/index\.md>/)
  assert.match(await markdown.text(), /^# AQUA Social/)
  const head = await fetch(baseUrl, {
    method: 'HEAD',
    headers: {Accept: 'text/markdown'},
  })
  assert.match(head.headers.get('content-type'), /^text\/markdown/)
  assert.equal(await head.text(), '')
})

test('returns real 404s while preserving app deep links and legacy asset paths', async () => {
  for (const route of [
    '/path-that-does-not-exist',
    '/static/js/missing.js',
    '/_aqua-pages/app.html',
  ]) {
    assert.equal((await fetch(baseUrl + route)).status, 404, route)
  }
  for (const route of [
    '/profile/example.test',
    '/profile/example.test/post/a123',
    '/views/watch/example.test/a123',
  ]) {
    assert.equal((await fetch(baseUrl + route)).status, 200, route)
  }
  const chunk = await fetch(
    `${baseUrl}/views/watch/example.test/a123/static/js/test.js`,
  )
  assert.match(chunk.headers.get('content-type'), /^text\/javascript/)
  const legacy = await fetch(
    `${baseUrl}/videos/watch/example.test/a123?q=yes`,
    {redirect: 'manual'},
  )
  assert.equal(legacy.status, 301)
  assert.equal(
    legacy.headers.get('location'),
    '/views/watch/example.test/a123?q=yes',
  )
})

test('registers a read-only WebMCP tool and returns the public guide', async () => {
  const script = await fs.readFile(
    path.join(projectRoot, 'web/webmcp.js'),
    'utf8',
  )
  let tool
  vm.runInNewContext(script, {
    document: {
      modelContext: {
        registerTool: value => {
          tool = value
        },
      },
    },
    fetch: url => fetch(baseUrl + url),
  })
  assert.equal(tool.annotations.readOnlyHint, true)
  assert.match(await tool.execute({}), /^# AQUA Social/)
})

test('discovers and invokes the advertised MCP tool over HTTP', async () => {
  const cardResponse = await fetch(
    `${baseUrl}/.well-known/mcp/server-card.json`,
  )
  assert.equal(cardResponse.status, 200)
  const card = await cardResponse.json()
  assert.equal(card.transport.type, 'streamable-http')
  assert.deepEqual(card.capabilities, {tools: {}})
  const url = baseUrl + new URL(card.transport.endpoint).pathname
  const rpc = (method, params, headers = {}) =>
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}),
    })
  const init = await (
    await rpc('initialize', {protocolVersion: card.protocolVersion})
  ).json()
  assert.deepEqual(init.result.serverInfo, card.serverInfo)
  const listed = await (await rpc('tools/list')).json()
  assert.deepEqual(listed.result.tools, card.tools)
  const called = await (
    await rpc('tools/call', {name: card.tools[0].name})
  ).json()
  assert.match(called.result.content[0].text, /^# AQUA Social/)
  assert.equal(
    (await rpc('tools/list', {}, {Origin: 'https://example.test'})).status,
    403,
  )
})
