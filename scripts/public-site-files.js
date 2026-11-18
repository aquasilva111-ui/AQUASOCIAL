const fs = require('fs')
const path = require('path')

/**
 * Static public-site files under web/. Expo's production copy plugin also
 * copies the web/ template into web-build; this list is what the post-build
 * copies again so the export does not depend on that plugin.
 *
 * PR #44 (feat/agent-ready) writes the same robots.txt, sitemap.xml, and
 * sitemaps/*.xml paths from scripts/emit-public-web.js, and adds
 * sitemap-posts.xml plus sitemap-profiles.xml to the index. Those two stay
 * out of this branch: they would be empty until an Aqua PDS hostname exists.
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
