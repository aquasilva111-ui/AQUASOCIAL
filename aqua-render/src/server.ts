import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'

import { MemoryAssetStore, sha256Hex, type AssetStore } from 'aqua-project/src/index'

import { RenderError, renderVideo, type RenderOptions } from './render'

export interface ServerOptions extends RenderOptions {
  /** Shared secret; requests without `Authorization: Bearer <token>` are refused. Required. */
  token: string
  store?: AssetStore
  maxBodyBytes?: number
  /** Browser origins allowed to call the server (exact match, e.g. https://create.aquaapp.online). None: no CORS. */
  allowedOrigins?: string[]
  /** Renders running at once; extra requests get 429. */
  concurrency?: number
}

function authorized(req: IncomingMessage, token: string): boolean {
  const got = Buffer.from(req.headers.authorization ?? '')
  const want = Buffer.from(`Bearer ${token}`)
  return got.length === want.length && timingSafeEqual(got, want)
}

async function body(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > limit) throw new RenderError('Body too large', 400)
    chunks.push(c as Buffer)
  }
  return Buffer.concat(chunks)
}

const send = (res: ServerResponse, status: number, data: string | Uint8Array, type = 'application/json', extra: Record<string, string> = {}) => {
  res.writeHead(status, { 'content-type': type, ...extra })
  res.end(data)
}

/**
 * Endpoints (all need the bearer token):
 *   PUT  /assets/:sha256   raw bytes; refused unless the bytes hash to :sha256
 *   POST /render           JSON VideoProject -> video/mp4
 */
export function createRenderServer(opts: ServerOptions) {
  if (!opts.token || opts.token.length < 16) throw new Error('A token of at least 16 characters is required')
  const store = opts.store ?? new MemoryAssetStore()
  const limit = opts.maxBodyBytes ?? 512 * 1024 * 1024
  const max = opts.concurrency ?? 2
  let active = 0

  return createServer(async (req, res) => {
    const origin = req.headers.origin
    const cors: Record<string, string> =
      origin && opts.allowedOrigins?.includes(origin)
        ? { 'access-control-allow-origin': origin, vary: 'Origin', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'PUT, POST, OPTIONS' }
        : {}
    const reply = (status: number, data: string | Uint8Array, type?: string) => send(res, status, data, type, cors)
    try {
      if (req.method === 'OPTIONS') return reply(cors['access-control-allow-origin'] ? 204 : 403, '') // preflight carries no credentials
      if (!authorized(req, opts.token)) return reply(401, '{"error":"unauthorized"}')
      const url = new URL(req.url ?? '/', 'http://x')
      const asset = /^\/assets\/([0-9a-f]{64})$/.exec(url.pathname)

      if (req.method === 'PUT' && asset) {
        const bytes = new Uint8Array(await body(req, limit))
        if ((await sha256Hex(bytes)) !== asset[1]) return reply(400, '{"error":"hash mismatch"}')
        await store.put(bytes, String(req.headers['content-type'] ?? 'application/octet-stream'))
        return reply(204, '')
      }
      if (req.method === 'POST' && url.pathname === '/render') {
        if (active >= max) return reply(429, '{"error":"busy"}')
        const project = JSON.parse((await body(req, 1024 * 1024)).toString('utf8'))
        active++
        try {
          return reply(200, await renderVideo(project, store, opts), 'video/mp4')
        } finally {
          active--
        }
      }
      reply(404, '{"error":"not found"}')
    } catch (e) {
      const status = e instanceof RenderError ? e.status : e instanceof SyntaxError ? 400 : 500
      reply(status, JSON.stringify({ error: e instanceof RenderError ? e.message : status === 400 ? 'bad request' : 'internal error' }))
    }
  })
}

// `npm start`: AQUA_RENDER_TOKEN is required; PORT and FFMPEG are optional.
if (process.argv[1]?.endsWith('server.ts')) {
  const token = process.env.AQUA_RENDER_TOKEN ?? ''
  createRenderServer({ token, ffmpeg: process.env.FFMPEG, allowedOrigins: process.env.AQUA_RENDER_ORIGINS?.split(',') }).listen(Number(process.env.PORT ?? 8788), () => console.log('aqua-render listening'))
}
