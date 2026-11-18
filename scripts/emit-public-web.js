/**
 * Writes the public files Hostinger serves from web/ (and web-build/ when
 * that directory already exists). Source of truth: src/lib/public-site.ts.
 */
const fs = require('fs')
const path = require('path')

const projectRoot = path.join(__dirname, '..')

require('ts-node').register({
  transpileOnly: true,
  skipProject: true,
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
    target: 'es2020',
    esModuleInterop: true,
  },
})

const site = require('../src/lib/public-site.ts')

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true})
  fs.writeFileSync(filePath, contents)
}

function emitInto(directory, dynamic) {
  const files = site.publicWebFiles(dynamic)
  for (const [name, contents] of Object.entries(files)) {
    writeFile(path.join(directory, name), contents)
  }
}

function patchIndex(indexPath) {
  if (!fs.existsSync(indexPath)) return
  const html = fs.readFileSync(indexPath, 'utf8')
  const next = site.patchMarkedBlock(
    site.patchMarkedBlock(
      html,
      '<!-- BEGIN public-site-head -->',
      '<!-- END public-site-head -->',
      site.renderPublicSiteHead(),
    ),
    '<!-- BEGIN public-site-body -->',
    '<!-- END public-site-body -->',
    site.renderPublicSiteBody(),
  )
  fs.writeFileSync(indexPath, next)
}

async function emitPublicWeb() {
  let dynamic = {posts: [], profiles: []}
  try {
    const loaded = await site.loadAquaSitemap()
    dynamic = {posts: loaded.posts, profiles: loaded.profiles}
    if (loaded.warning) console.warn(loaded.warning)
  } catch (err) {
    console.warn(
      '[public-site] sitemap-posts.xml and sitemap-profiles.xml were left empty.',
      err,
    )
  }

  const webDir = path.join(projectRoot, 'web')
  emitInto(webDir, dynamic)

  const logoFrom = path.join(projectRoot, 'assets', 'favicon.png')
  const logoTo = path.join(webDir, 'logo.png')
  fs.copyFileSync(logoFrom, logoTo)

  const htaccessPath = path.join(webDir, '.htaccess')
  const htaccess = fs.readFileSync(htaccessPath, 'utf8')
  fs.writeFileSync(
    htaccessPath,
    site.patchMarkedBlock(
      htaccess,
      '# BEGIN spa-fallback-prefixes',
      '# END spa-fallback-prefixes',
      site.renderSpaFallbackBlock(),
    ),
  )

  patchIndex(path.join(webDir, 'index.html'))

  const webBuild = path.join(projectRoot, 'web-build')
  if (fs.existsSync(webBuild)) {
    emitInto(webBuild, dynamic)
    fs.copyFileSync(logoTo, path.join(webBuild, 'logo.png'))
    fs.copyFileSync(htaccessPath, path.join(webBuild, '.htaccess'))
    patchIndex(path.join(webBuild, 'index.html'))
  }
}

if (require.main === module) {
  emitPublicWeb().catch(err => {
    console.error(err)
    process.exit(1)
  })
}

module.exports = {emitPublicWeb}
