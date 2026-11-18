const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  DISALLOW_ROBOTS,
  ROBOTS_META,
  applyPublicRobots,
  cloudflareHeaders,
  cloudflareRedirects,
  ensureRobotsMeta,
  hostnameFromHostHeader,
  isIndexableDeployment,
  isProductionHost,
  resolveDeployEnv,
} = require('../../scripts/deploy-env')

const ROOT = path.join(__dirname, '../..')

describe('deploy environment', () => {
  it('defaults to production unless Cloudflare Pages is building', () => {
    expect(resolveDeployEnv({})).toBe('production')
    expect(resolveDeployEnv({AQUA_DEPLOY_ENV: ''})).toBe('production')
    expect(resolveDeployEnv({AQUA_DEPLOY_ENV: '  Production '})).toBe(
      'production',
    )
    expect(resolveDeployEnv({CF_PAGES: '1'})).toBe('preview')
    expect(resolveDeployEnv({AQUA_DEPLOY_ENV: 'staging', CF_PAGES: '1'})).toBe(
      'staging',
    )
    expect(resolveDeployEnv({AQUA_DEPLOY_ENV: 'preview'})).toBe('preview')
    expect(() => resolveDeployEnv({AQUA_DEPLOY_ENV: 'prod'})).toThrow(
      /production, staging, or preview/,
    )
  })

  it('treats only aquaapp.systems and www as production hosts', () => {
    for (const host of [
      'aquaapp.systems',
      'AQUAAPP.SYSTEMS',
      'www.aquaapp.systems',
      'www.aquaapp.systems:443',
      'aquaapp.systems.',
      'aquaapp.systems:80',
    ]) {
      expect(isProductionHost(host)).toBe(true)
    }
    for (const host of [
      'teste.aquaapp.systems',
      'preview.aquaapp.systems',
      'aqua.pages.dev',
      'something.pages.dev',
      'aquaapp.systems.cdn.hstgr.net',
      'localhost',
      '127.0.0.1',
      '127.0.0.1:3000',
      '[::1]',
      '',
      undefined,
    ]) {
      expect(isProductionHost(host)).toBe(false)
    }
    expect(hostnameFromHostHeader('WWW.AquaApp.Systems:8443')).toBe(
      'www.aquaapp.systems',
    )
    expect(
      isIndexableDeployment({deployEnv: 'production', host: 'aquaapp.systems'}),
    ).toBe(true)
    expect(
      isIndexableDeployment({
        deployEnv: 'production',
        host: 'teste.aquaapp.systems',
      }),
    ).toBe(false)
    expect(isIndexableDeployment({deployEnv: 'staging'})).toBe(false)
    expect(isIndexableDeployment({env: {}})).toBe(true)
    expect(isIndexableDeployment({env: {CF_PAGES: '1'}})).toBe(false)
  })

  it('writes disallow-all robots outside production and keeps the committed file in production', () => {
    const committed = fs.readFileSync(path.join(ROOT, 'web/robots.txt'), 'utf8')
    expect(committed).toMatch(
      /^Sitemap: https:\/\/aquaapp\.systems\/sitemap\.xml$/m,
    )
    expect(committed).not.toMatch(/^Disallow: \/$/m)
    expect(DISALLOW_ROBOTS).toBe('User-agent: *\nDisallow: /\n')
    expect(DISALLOW_ROBOTS.toLowerCase()).not.toContain('sitemap')

    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-robots-'))
    try {
      applyPublicRobots(ROOT, out, {})
      expect(fs.readFileSync(path.join(out, 'robots.txt'), 'utf8')).toBe(
        committed,
      )
      applyPublicRobots(ROOT, out, {AQUA_DEPLOY_ENV: 'staging'})
      expect(fs.readFileSync(path.join(out, 'robots.txt'), 'utf8')).toBe(
        DISALLOW_ROBOTS,
      )
      expect(
        fs.readFileSync(
          path.join(out, '_aqua-pages/robots.production.txt'),
          'utf8',
        ),
      ).toBe(committed)
      expect(
        fs.readFileSync(
          path.join(out, '_aqua-pages/robots.disallow.txt'),
          'utf8',
        ),
      ).toBe(DISALLOW_ROBOTS)
    } finally {
      fs.rmSync(out, {recursive: true, force: true})
    }
  })

  it('adds the robots meta once and describes the Pages files', () => {
    const withHead = '<html><head><title>A</title></head><body></body></html>'
    const stamped = ensureRobotsMeta(withHead)
    expect(stamped).toContain(ROBOTS_META)
    expect(ensureRobotsMeta(stamped)).toBe(stamped)
    const bare = ensureRobotsMeta('<html lang="pt-BR"><title>x</title></html>')
    expect(bare.startsWith(`<html lang="pt-BR">${ROBOTS_META}`)).toBe(true)

    const headers = cloudflareHeaders()
    expect(headers).toContain('/*\n  X-Robots-Tag: noindex, nofollow\n')
    const redirects = cloudflareRedirects(['/', '/about', '/search'])
    expect(redirects).toContain('/about /_aqua-pages/about.html 200')
    expect(redirects).toContain('/search/ /_aqua-pages/search.html 200')
    expect(redirects).not.toContain('/ /_aqua-pages/.html')
    expect(redirects.trimEnd().endsWith('/* /_aqua-pages/app.html 200')).toBe(
      true,
    )
    const splat = redirects.indexOf('/* /_aqua-pages/app.html 200')
    expect(
      redirects.indexOf('/about /_aqua-pages/about.html 200'),
    ).toBeLessThan(splat)
    expect(redirects.indexOf('/videos/* /views/:splat 301')).toBeLessThan(splat)
  })

  it('tells Apache to noindex non-production hosts before it serves robots.txt', () => {
    const htaccess = fs.readFileSync(path.join(ROOT, 'web/.htaccess'), 'utf8')
    expect(htaccess).toMatch(
      /X-Robots-Tag "noindex, nofollow" "expr=%\{HTTP_HOST\} !~ m#\^\(www\\\.\)\?aquaapp\\\.systems/,
    )
    const robotsRule = htaccess.indexOf(
      'RewriteRule ^robots\\.txt$ /_aqua-pages/robots.disallow.txt [L]',
    )
    const fileRule = htaccess.indexOf('REQUEST_FILENAME} -f')
    expect(robotsRule).toBeGreaterThan(-1)
    expect(fileRule).toBeGreaterThan(robotsRule)
    expect(htaccess).toMatch(
      /RewriteCond %\{HTTP_HOST\} !\^\(www\\\.\)\?aquaapp\\\.systems/,
    )
    const postBuild = fs.readFileSync(
      path.join(ROOT, 'scripts/post-web-build.js'),
      'utf8',
    )
    expect(postBuild.lastIndexOf('applyPublicRobots(')).toBeGreaterThan(
      postBuild.lastIndexOf('copyPublicSiteFiles('),
    )
    const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8')
    expect(server).toContain('isProductionHost(req.headers.host)')
    expect(server).toContain('ensureRobotsMeta')
    expect(server).toContain('/_aqua-pages/robots.disallow.txt')
    expect(server).toContain('/_aqua-pages/robots.production.txt')
  })
})
