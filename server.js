const {Buffer} = require('node:buffer')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const {endpoint, cardPath, handleMcp} = require('./web/mcp-server')
const {
  DISALLOW_ROBOTS,
  ROBOTS_HEADER_VALUE,
  ensureRobotsMeta,
  isProductionHost,
} = require('./scripts/deploy-env')

const PORT = process.env.PORT || 3000
const ROOT = path.join(__dirname, 'web-build')
const homeLinks =
  '</llms.txt>; rel=describedby; type="text/plain", </index.md>; rel=alternate; type="text/markdown"'

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
  '.mp4': 'video/mp4',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
}

/** Resolve build chunks requested relative to a deep client route. */
function staticPath(pathname) {
  const i = pathname.indexOf('/static/')
  return i > 0 ? pathname.slice(i) : pathname
}

function wantsMarkdown(accept = '') {
  const types = new Map(
    accept.split(',').map(entry => {
      const [type, ...parameters] = entry.toLowerCase().trim().split(';')
      const weight = parameters.find(parameter => /^\s*q\s*=/.test(parameter))
      const quality = weight ? Number(weight.split('=')[1]) : 1
      return [type.trim(), quality >= 0 && quality <= 1 ? quality : 0]
    }),
  )
  const markdown = types.get('text/markdown') || 0
  const html = types.get('text/html') || 0
  return markdown > 0 && markdown >= html
}

async function findFile(root, pathname) {
  const file = path.resolve(root, `.${pathname}`)
  if (!file.startsWith(root + path.sep)) return
  const info = await fs.promises.stat(file).catch(error => {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error
  })
  if (info?.isFile()) return {file, length: info.size}
  if (info?.isDirectory()) {
    const index = path.join(file, 'index.html')
    const stat = await fs.promises.stat(index).catch(error => {
      if (error.code !== 'ENOENT') throw error
    })
    if (stat?.isFile()) return {file: index, length: stat.size}
  }
}

function installNoindexHeader(res, productionHost) {
  if (productionHost) return
  const writeHead = res.writeHead
  res.writeHead = function (status, reason, headers) {
    let message
    let hdrs = {}
    if (typeof reason === 'string') {
      message = reason
      if (headers && typeof headers === 'object') hdrs = {...headers}
    } else if (reason && typeof reason === 'object') {
      hdrs = {...reason}
    }
    hdrs['X-Robots-Tag'] = ROBOTS_HEADER_VALUE
    if (message !== undefined)
      return writeHead.call(this, status, message, hdrs)
    return writeHead.call(this, status, hdrs)
  }
}

function sendBuffer(res, req, status, body, headers) {
  res.writeHead(status, {...headers, 'Content-Length': body.length})
  if (req.method === 'HEAD') return res.end()
  res.end(body)
}

function createSiteServer(root = ROOT) {
  let routeConfig
  function routes() {
    // Load lazily so tools can import staticPath without a web build.
    if (!routeConfig) {
      const config = JSON.parse(
        fs.readFileSync(path.join(root, 'site-routes.json'), 'utf8'),
      )
      routeConfig = {
        pages: config.pages,
        appRoutes: new RegExp(`^/(?:${config.patterns.join('|')})$`, 'i'),
      }
    }
    return routeConfig
  }

  async function robotsAsset(productionHost) {
    const internal = productionHost
      ? '/_aqua-pages/robots.production.txt'
      : '/_aqua-pages/robots.disallow.txt'
    const preferred = await findFile(root, internal)
    if (preferred || !productionHost) return preferred
    return findFile(root, '/robots.txt')
  }

  return http.createServer(async (req, res) => {
    // The public site is aquaapp.systems and www only. Preview hostnames
    // stay out of search indexes even when this build was produced without
    // AQUA_DEPLOY_ENV (the Hostinger production default).
    const productionHost = isProductionHost(req.headers.host)
    installNoindexHeader(res, productionHost)
    try {
      const url = new URL(req.url, 'http://localhost')
      let pathname
      try {
        pathname = decodeURIComponent(url.pathname)
      } catch {
        return res.writeHead(400).end('Invalid URL')
      }
      if (
        // eslint-disable-next-line no-control-regex
        /[\u0000-\u001f\u007f\\]/.test(pathname) ||
        pathname.split('/').some(segment => segment === '..' || segment === '.')
      ) {
        return res.writeHead(400).end('Invalid URL')
      }
      if (pathname === endpoint || pathname === cardPath) {
        await handleMcp(req, res, pathname, root)
        return
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return res.writeHead(405, {Allow: 'GET, HEAD'}).end()
      }
      if (/^\/videos(?:\/|$)/.test(pathname)) {
        const location =
          url.pathname.replace(/^\/videos/, '/views') + url.search
        return res.writeHead(301, {Location: location}).end()
      }

      const {pages, appRoutes} = routes()
      const page = pages[pathname.replace(/\/$/, '').toLowerCase() || '/']
      const home = pathname === '/'
      const headers = home ? {Vary: 'Accept', Link: homeLinks} : {}
      let asset
      let status = 200
      if (pathname === '/robots.txt') {
        asset = await robotsAsset(productionHost)
        if (!asset && !productionHost) {
          return sendBuffer(res, req, 200, Buffer.from(DISALLOW_ROBOTS), {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
          })
        }
      }
      if (!asset && home && wantsMarkdown(req.headers.accept)) {
        asset = await findFile(root, '/index.md')
      } else if (!asset && page) {
        asset = await findFile(root, `/${page}`)
      } else if (
        !asset &&
        !/^\/(?:_aqua-pages(?:\/|$)|site-routes\.json$)/i.test(pathname) &&
        !pathname.split('/').some(segment => segment.startsWith('.'))
      ) {
        const normalized = staticPath(pathname)
        asset = await findFile(root, normalized)
        if (!asset && normalized === pathname && appRoutes.test(pathname)) {
          asset = await findFile(root, `/${pages['*']}`)
        }
      }
      if (!asset) {
        status = 404
        asset = await findFile(root, '/404.html')
        if (!asset) return res.writeHead(404).end('Not found')
      }

      const hashAsset = asset.file.startsWith(
        path.join(root, 'static') + path.sep,
      )
      const extension = path.extname(asset.file).toLowerCase()
      const contentType = MIME[extension]
      const responseHeaders = {
        ...headers,
        'Content-Type': contentType || 'application/octet-stream',
        'Cache-Control': hashAsset
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      }
      if (extension === '.html' && !productionHost) {
        const html = ensureRobotsMeta(
          await fs.promises.readFile(asset.file, 'utf8'),
        )
        return sendBuffer(res, req, status, Buffer.from(html), responseHeaders)
      }
      res.writeHead(status, {
        ...responseHeaders,
        'Content-Length': asset.length,
      })
      if (req.method === 'HEAD') return res.end()
      const stream = fs.createReadStream(asset.file)
      stream.on('error', error => res.destroy(error))
      res.on('close', () => stream.destroy())
      stream.pipe(res)
    } catch (error) {
      console.error(error)
      if (!res.headersSent && !res.destroyed) {
        res.writeHead(500).end('Internal server error')
      }
    }
  })
}

const server = createSiteServer()

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`AQUASOCIAL web server listening on port ${PORT}`)
  })
}

module.exports = {server, staticPath, createSiteServer}
