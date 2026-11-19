const fs = require('fs')
const path = require('path')

/**
 * Static public-site files under web/. Expo's production copy plugin also
 * copies the web/ template into web-build; this list is what the post-build
 * copies again so the export does not depend on that plugin.
 *
 * build-site-discovery.js copies the same paths. It must not replace
 * sitemap.xml with a urlset generated from web/site-info.js.
 * sitemap-posts.xml and sitemap-profiles.xml stay out: they would be empty
 * until an Aqua PDS hostname exists.
 *
 * scripts/deploy-env.js may replace robots.txt after this copy when the
 * build is staging or preview. The file in web/ stays the production policy.
 */
const PUBLIC_SITE_FILES = [
  'robots.txt',
  'sitemap.xml',
  'sitemaps/institutional.xml',
  'sitemaps/sections.xml',
]

function copyPublicSiteFiles(projectRoot, outDir) {
  for (const rel of PUBLIC_SITE_FILES) {
    const sourcePath = path.join(projectRoot, 'web', rel)
    const targetPath = path.join(outDir, rel)
    fs.mkdirSync(path.dirname(targetPath), {recursive: true})
    fs.copyFileSync(sourcePath, targetPath)
  }
}

module.exports = {PUBLIC_SITE_FILES, copyPublicSiteFiles}
