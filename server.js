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
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    let pathname = decodeURIComponent(url.pathname)
    if (pathname === '/') pathname = '/index.html'
    if (pathname === '/ui-ai/') pathname = '/ui-ai/index.html'

    const filePath = path.normalize(path.join(ROOT, pathname))
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }

    fs.stat(filePath, (err, stat) => {
      let finalPath = filePath
      if (err || stat.isDirectory()) {
        // Handles/topics can contain dots. Only recognized assets and static
        // paths must stay 404; other app routes receive the SPA document.
        const extension = path.extname(pathname).toLowerCase()
        if (pathname.startsWith('/static/') || MIME[extension]) {
          res.writeHead(404)
          res.end('Not found')
          return
        }
        finalPath = path.join(ROOT, 'index.html')
      }

      const ext = path.extname(finalPath).toLowerCase()
      const headers = {'Content-Type': MIME[ext] || 'application/octet-stream'}
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

server.listen(PORT, () => {
  console.log(`AQUASOCIAL web server listening on port ${PORT}`)
})
