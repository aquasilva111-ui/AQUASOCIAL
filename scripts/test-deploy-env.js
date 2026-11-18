const assert = require('node:assert/strict')
const {Buffer} = require('node:buffer')
const fs = require('node:fs/promises')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const {test} = require('node:test')

const {buildSiteDiscovery} = require('./build-site-discovery')
const {createSiteServer} = require('../server')
const {
  DISALLOW_ROBOTS,
  ROBOTS_META,
  applyPublicRobots,
  resolveDeployEnv,
} = require('./deploy-env')
const {copyPublicSiteFiles} = require('./public-site-files')
const {pages} = require('../web/site-info')

const projectRoot = path.join(__dirname, '..')

async function buildWith(env) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aqua-deploy-env-'))
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
  buildSiteDiscovery(directory, template, env)
  return directory
}

function read(directory, rel) {
  return fs.readFile(path.join(directory, 'web-build', rel), 'utf8')
}

test('an absent deploy variable keeps the production robots file and HTML', async () => {
  assert.equal(resolveDeployEnv({}), 'production')
  const directory = await buildWith({})
  try {
    const committed = await fs.readFile(
      path.join(projectRoot, 'web/robots.txt'),
      'utf8',
    )
    assert.equal(await read(directory, 'robots.txt'), committed)
    assert.equal(
      await read(directory, '_aqua-pages/robots.production.txt'),
      committed,
    )
    assert.equal(
      await read(directory, '_aqua-pages/robots.disallow.txt'),
      DISALLOW_ROBOTS,
    )
    const home = await read(directory, 'index.html')
    const about = await read(directory, '_aqua-pages/about.html')
    const app = await read(directory, '_aqua-pages/app.html')
    const missing = await read(directory, '404.html')
    for (const html of [home, about, app, missing]) {
      assert.equal(html.includes('name="robots"'), false)
    }
    assert.match(home, /Sitemap:|rel="canonical"/)
    assert.match(await read(directory, 'sitemap.xml'), /<sitemapindex\b/)
    const headers = await read(directory, '_headers')
    assert.match(headers, /^\/\*$/m)
    assert.match(headers, /^ {2}X-Robots-Tag: noindex, nofollow$/m)
    const redirects = await read(directory, '_redirects')
    assert.match(redirects, /^\/about \/_aqua-pages\/about\.html 200$/m)
    assert.match(redirects, /^\/videos\/\* \/views\/:splat 301$/m)
    assert.match(redirects, /^\/\* \/_aqua-pages\/app\.html 200$/m)
    for (const pathname of Object.keys(pages)) {
      if (pathname === '/') continue
      assert.match(
        redirects,
        new RegExp(
          `^${pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} /_aqua-pages${pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.html 200$`,
          'm',
        ),
      )
    }
  } finally {
    await fs.rm(directory, {recursive: true, force: true})
  }
})

test('staging and preview builds disallow crawlers and mark the HTML', async () => {
  for (const env of [
    {AQUA_DEPLOY_ENV: 'staging'},
    {AQUA_DEPLOY_ENV: 'preview'},
    {AQUA_DEPLOY_ENV: ' Preview '},
    {CF_PAGES: '1'},
  ]) {
    const directory = await buildWith(env)
    try {
      const label = JSON.stringify(env)
      assert.equal(await read(directory, 'robots.txt'), DISALLOW_ROBOTS, label)
      assert.equal(DISALLOW_ROBOTS.includes('Sitemap'), false)
      const committed = await fs.readFile(
        path.join(projectRoot, 'web/robots.txt'),
        'utf8',
      )
      assert.equal(
        await read(directory, '_aqua-pages/robots.production.txt'),
        committed,
        label,
      )
      assert.match(await read(directory, 'sitemap.xml'), /<sitemapindex\b/)
      for (const rel of [
        'index.html',
        '_aqua-pages/about.html',
        '_aqua-pages/app.html',
        '404.html',
      ]) {
        const html = await read(directory, rel)
        assert.equal(
          html.match(
            new RegExp(ROBOTS_META.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          ).length,
          1,
          `${label} ${rel}`,
        )
      }
    } finally {
      await fs.rm(directory, {recursive: true, force: true})
    }
  }
})

test('explicit production wins over the Cloudflare Pages default', () => {
  assert.equal(
    resolveDeployEnv({AQUA_DEPLOY_ENV: 'production', CF_PAGES: '1'}),
    'production',
  )
})

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
}

function request(
  server,
  urlPath,
  {host = 'aquaapp.systems', method = 'GET'} = {},
) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path: urlPath,
        method,
        setHost: false,
        headers: {host},
      },
      res => {
        const chunks = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => {
          const value = name => {
            const header = res.headers[name]
            if (Array.isArray(header)) return header.join(', ')
            return header == null ? null : String(header)
          }
          resolve({
            status: res.statusCode,
            header: value,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

test('a preview build follows the request host for robots and the header', async () => {
  const directory = await buildWith({AQUA_DEPLOY_ENV: 'preview'})
  const server = createSiteServer(path.join(directory, 'web-build'))
  await listen(server)
  try {
    const official = await request(server, '/robots.txt', {
      host: 'aquaapp.systems',
    })
    const committed = await fs.readFile(
      path.join(projectRoot, 'web/robots.txt'),
      'utf8',
    )
    assert.equal(official.body, committed)
    assert.equal(official.header('x-robots-tag'), null)
    const officialHome = await request(server, '/', {
      host: 'www.aquaapp.systems',
    })
    assert.equal(officialHome.header('x-robots-tag'), null)
    assert.equal(
      officialHome.body.match(
        /<meta name="robots" content="noindex, nofollow">/g,
      ).length,
      1,
    )
    const testHost = await request(server, '/', {host: 'teste.aquaapp.systems'})
    assert.equal(testHost.header('x-robots-tag'), 'noindex, nofollow')
    assert.equal(
      testHost.body.match(/<meta name="robots" content="noindex, nofollow">/g)
        .length,
      1,
    )
    const robots = await request(server, '/robots.txt', {
      host: 'feature.pages.dev',
    })
    assert.equal(robots.body, DISALLOW_ROBOTS)
    assert.equal(robots.header('x-robots-tag'), 'noindex, nofollow')
  } finally {
    await new Promise(resolve => server.close(resolve))
    await fs.rm(directory, {recursive: true, force: true})
  }
})

test('the post-build copy cannot put the indexable robots file back on staging', async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'aqua-robots-order-'),
  )
  try {
    const web = path.join(directory, 'web')
    await fs.mkdir(path.join(web, 'sitemaps'), {recursive: true})
    for (const rel of [
      'robots.txt',
      'sitemap.xml',
      'sitemaps/institutional.xml',
      'sitemaps/sections.xml',
    ]) {
      await fs.copyFile(path.join(projectRoot, 'web', rel), path.join(web, rel))
    }
    const out = path.join(directory, 'web-build')
    await fs.mkdir(out, {recursive: true})
    await fs.writeFile(path.join(out, 'robots.txt'), DISALLOW_ROBOTS)
    copyPublicSiteFiles(directory, out)
    assert.notEqual(
      await fs.readFile(path.join(out, 'robots.txt'), 'utf8'),
      DISALLOW_ROBOTS,
    )
    applyPublicRobots(directory, out, {AQUA_DEPLOY_ENV: 'staging'})
    assert.equal(
      await fs.readFile(path.join(out, 'robots.txt'), 'utf8'),
      DISALLOW_ROBOTS,
    )
  } finally {
    await fs.rm(directory, {recursive: true, force: true})
  }
})
