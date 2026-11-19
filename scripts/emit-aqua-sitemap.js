/**
 * Writes sitemap-posts.xml and sitemap-profiles.xml from the Aqua PDS.
 * A PDS failure leaves those files empty and does not fail the build.
 */
const fs = require('fs')
const path = require('path')

require('ts-node').register({
  transpileOnly: true,
  skipProject: true,
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
    target: 'es2022',
    esModuleInterop: true,
  },
})

const site = require('../src/lib/aqua-sitemap.ts')

function writeSitemap(directory, loaded) {
  fs.mkdirSync(directory, {recursive: true})
  fs.writeFileSync(
    path.join(directory, 'sitemap-posts.xml'),
    site.renderUrlSet(loaded.posts),
  )
  fs.writeFileSync(
    path.join(directory, 'sitemap-profiles.xml'),
    site.renderUrlSet(loaded.profiles),
  )
  const indexPath = path.join(directory, 'sitemap.xml')
  if (!fs.existsSync(indexPath)) return
  fs.writeFileSync(
    indexPath,
    site.ensureSitemapIndex(fs.readFileSync(indexPath, 'utf8')),
  )
}

async function emitAquaSitemaps(projectRoot) {
  let loaded = {
    posts: [],
    profiles: [],
    warning:
      '[aqua-sitemap] sitemap-posts.xml and sitemap-profiles.xml were left empty.',
  }
  try {
    loaded = await site.loadAquaSitemap()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    loaded.warning = `[aqua-sitemap] PDS request failed (${message}). sitemap-posts.xml and sitemap-profiles.xml were left empty.`
  }
  if (loaded.warning) console.warn(loaded.warning)
  console.log(
    `[aqua-sitemap] ${loaded.profiles.length} profiles, ${loaded.posts.length} posts`,
  )
  writeSitemap(path.join(projectRoot, 'web'), loaded)
  const webBuild = path.join(projectRoot, 'web-build')
  if (fs.existsSync(webBuild)) writeSitemap(webBuild, loaded)
  return loaded
}

if (require.main === module) {
  emitAquaSitemaps(path.join(__dirname, '..'))
    .then(() => {
      process.exitCode = 0
    })
    .catch(err => {
      console.warn(
        '[aqua-sitemap] sitemap-posts.xml and sitemap-profiles.xml were left empty.',
        err,
      )
      process.exitCode = 0
    })
}

module.exports = {emitAquaSitemaps}
