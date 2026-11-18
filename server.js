const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = process.env.PORT || 3000
const ROOT = path.join(__dirname, 'web-build')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
}

/** "/views/static/js/a.js" → "/static/js/a.js"; other paths unchanged. */
function staticPath(pathname) {
  const i = pathname.indexOf('/static/')
  return i > 0 ? pathname.slice(i) : pathname
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return MIME[ext] || 'application/octet-stream'
}

/**
 * Missing files with an extension, including robots.txt and sitemap.xml,
 * stay 404s. Extensionless app routes fall through to index.html.
 */
function isMissingAsset(pathname) {
  return pathname.includes('/static/') || Boolean(path.extname(pathname))
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    let pathname = decodeURIComponent(url.pathname)
    if (pathname === '/') pathname = '/index.html'
    // Build assets asked for under a nested route (/views/static/js/…) live
    // at /static/…; never answer them with the SPA's index.html.
    pathname = staticPath(pathname)

    const filePath = path.normalize(path.join(ROOT, pathname))
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }

    fs.stat(filePath, (err, stat) => {
      let finalPath = filePath
      if (err || stat.isDirectory()) {
        // SPA fallback: extensionless routes get index.html. A missing
        // /static/ asset, including one resolved under a deep route, and a
        // missing robots.txt or sitemap.xml, is a plain 404 so the browser
        // does not receive the SPA document.
        if (isMissingAsset(pathname)) {
          res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'})
          res.end('Not found')
          return
        }
        finalPath = path.join(ROOT, 'index.html')
      }

      const headers = {'Content-Type': contentType(finalPath)}
      if (finalPath.includes(`${path.sep}static${path.sep}`)) {
        headers['Cache-Control'] = 'public, max-age=31536000, immutable'
      } else {
        headers['Cache-Control'] = 'no-cache'
      }
      res.writeHead(200, headers)
      fs.createReadStream(finalPath).pipe(res)
    })
  } catch (e) {
    res.writeHead(500)
    res.end('Internal server error')
  }
})

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`AQUASOCIAL web server listening on port ${PORT}`)
  })
}

module.exports = {server, staticPath, contentType, isMissingAsset}
