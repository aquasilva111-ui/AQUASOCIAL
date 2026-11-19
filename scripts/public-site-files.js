const fs = require('fs')
const path = require('path')

/**
 * Static public-site files under web/. Expo's production copy plugin also
 * copies the web/ template into web-build; this list is what the post-build
 * copies again so the export does not depend on that plugin.
 *
 * build-site-discovery.js copies the same paths. It must not replace
 * sitemap.xml with a urlset generated from web/site-info.js.
 * sitemap-posts.xml and sitemap-profiles.xml are filled by
 * scripts/emit-aqua-sitemap.js from the Aqua PDS. robots-disallow-all.txt
 * is what every host other than aquaapp.systems serves as /robots.txt.
 */
const PUBLIC_SITE_FILES = [
  'robots.txt',
  'robots-disallow-all.txt',
  'sitemap.xml',
  'sitemap-posts.xml',
  'sitemap-profiles.xml',
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
