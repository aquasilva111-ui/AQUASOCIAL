const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const {endpoint, cardPath, handleMcp} = require('./web/mcp-server')

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

const BLOCKED_ROBOTS = 'User-agent: *\nDisallow: /\n'

/** True only for the public site. Previews and other hosts stay out of search. */
function isPublicSiteHost(hostHeader) {
  const raw = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader || ''
  const host = String(raw)
    .split(',')[0]
    .trim()
    .replace(/:\d+$/, '')
    .replace(/\.$/, '')
    .toLowerCase()
  return host === 'aquaapp.systems'
}

function markUnindexed(res) {
  const writeHead = res.writeHead
  res.writeHead = function (status, second, third) {
    const extra = {'X-Robots-Tag': 'noindex, nofollow'}
    if (second && typeof second === 'object') {
      return writeHead.call(this, status, {...second, ...extra}, third)
    }
    if (typeof second === 'string' && third && typeof third === 'object') {
      return writeHead.call(this, status, second, {...third, ...extra})
    }
    if (typeof second === 'string') {
      return writeHead.call(this, status, second, extra)
    }
    return writeHead.call(this, status, extra)
  }
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

  return http.createServer(async (req, res) => {
    const indexable = isPublicSiteHost(req.headers.host)
    if (!indexable) markUnindexed(res)
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
      if (!indexable && pathname === '/robots.txt') {
        const body = BLOCKED_ROBOTS
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Length': body.length,
          'Cache-Control': 'no-cache',
        })
        if (req.method === 'HEAD') return res.end()
        return res.end(body)
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
      if (home && wantsMarkdown(req.headers.accept)) {
        asset = await findFile(root, '/index.md')
      } else if (page) {
        asset = await findFile(root, `/${page}`)
      } else if (
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
      const contentType = MIME[path.extname(asset.file).toLowerCase()]
      res.writeHead(status, {
        ...headers,
        'Content-Type': contentType || 'application/octet-stream',
        'Content-Length': asset.length,
        'Cache-Control': hashAsset
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
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
let listenStarted = false

/**
 * LiteSpeed's lsnode.js and Phusion Passenger load this file with require().
 * require.main is the loader, so a listen() gated only on require.main never
 * runs and the export has no listen method. lsnode then skips its fallback
 * (`exports.listen`) and the worker never accepts the socket. LiteSpeed waits
 * and answers every URL with 503 "The server is temporarily busy".
 */
function launchedByAppServer() {
  if (typeof PhusionPassenger !== 'undefined') return true
  if (process.env.LSNODE_STARTUP_FILE || process.env.LSNODE_ROOT) return true
  if (process.env.PASSENGER_APP_ENV) return true
  const main = (require.main && require.main.filename) || ''
  return /(?:^|[/\\])lsnode\.js$/.test(main)
}

function listen(port = PORT, host, callback) {
  if (typeof host === 'function') {
    callback = host
    host = undefined
  }
  if (listenStarted) {
    if (typeof callback === 'function') {
      if (server.listening) process.nextTick(callback)
      else server.once('listening', callback)
    }
    return server
  }
  listenStarted = true
  if (port === 'passenger') return server.listen('passenger')
  // 0.0.0.0 so Hostinger's IPv4 proxy can connect when IPv6 is bindv6only.
  if (host === undefined) host = '0.0.0.0'
  if (typeof callback === 'function') return server.listen(port, host, callback)
  return server.listen(port, host)
}

if (require.main === module || launchedByAppServer()) {
  const port = typeof PhusionPassenger !== 'undefined' ? 'passenger' : PORT
  listen(port, () => {
    const address = server.address()
    const shown = address && typeof address === 'object' ? address.port : port
    console.log(`AQUASOCIAL web server listening on port ${shown}`)
  })
}

module.exports = {
  server,
  staticPath,
  createSiteServer,
  listen,
  isPublicSiteHost,
}
