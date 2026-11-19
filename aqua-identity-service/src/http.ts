import {timingSafeEqual} from 'node:crypto'
import {type IncomingMessage, type ServerResponse} from 'node:http'

import {type ServiceConfig} from './config.ts'

export class RequestError extends Error {
  status: number
  reason: string

  constructor(status: number, reason: string) {
    super(reason)
    this.status = status
    this.reason = reason
  }
}

const APP_PATHS = new Set(['/login', '/onboarding', '/settings/identity'])

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('referrer-policy', 'no-referrer')
  if (headers) {
    for (const [key, value] of Object.entries(headers))
      res.setHeader(key, value)
  }
  res.end(JSON.stringify(body))
}

export function redirect(
  res: ServerResponse,
  location: string,
  cookies: string[] = [],
) {
  res.statusCode = 302
  res.setHeader('location', location)
  res.setHeader('cache-control', 'no-store')
  res.setHeader('referrer-policy', 'no-referrer')
  if (cookies.length === 1) res.setHeader('set-cookie', cookies[0])
  if (cookies.length > 1) res.setHeader('set-cookie', cookies)
  res.end()
}

export function applyCors(
  req: IncomingMessage,
  res: ServerResponse,
  origins: string[],
): boolean {
  const origin = req.headers.origin
  if (typeof origin === 'string' && origins.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('access-control-allow-credentials', 'true')
    res.setHeader(
      'access-control-allow-headers',
      'content-type, x-aqua-csrf, x-aqua-client',
    )
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
    res.setHeader('vary', 'Origin')
  }
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return true
  }
  return false
}

export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for']
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0]?.trim() || 'unknown'
    }
  }
  return req.socket.remoteAddress ?? 'unknown'
}

export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return match?.[1]
}

export function sessionCookie(
  sessionId: string,
  options: {
    secure: boolean
    sameSite: 'Lax' | 'Strict' | 'None'
    maxAge: number
  },
): string {
  if (!/^[A-Za-z0-9_-]{22,}$/.test(sessionId)) {
    throw new Error('session id must be an opaque random token')
  }
  if (options.sameSite === 'None' && !options.secure) {
    throw new Error('SameSite=None requires Secure')
  }
  const parts = [
    `aqua_session=${sessionId}`,
    'HttpOnly',
    `SameSite=${options.sameSite}`,
    'Path=/',
    `Max-Age=${Math.floor(options.maxAge)}`,
  ]
  if (options.secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookie(options: {
  secure: boolean
  sameSite: 'Lax' | 'Strict' | 'None'
}): string {
  const parts = [
    'aqua_session=',
    'HttpOnly',
    `SameSite=${options.sameSite}`,
    'Path=/',
    'Max-Age=0',
  ]
  if (options.secure) parts.push('Secure')
  return parts.join('; ')
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function appLocation(
  config: ServiceConfig,
  path: string,
  query?: Record<string, string>,
): string {
  if (!APP_PATHS.has(path)) throw new RequestError(500, 'bad-request')
  const origin = config.appOrigins[0]
  if (!origin) throw new RequestError(500, 'app-origin-unset')
  const url = new URL(path, origin)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (!/^[a-z0-9_-]{1,64}$/.test(key)) continue
    if (!/^[a-z0-9_-]{1,64}$/.test(value)) continue
    url.searchParams.set(key, value)
  }
  return url.toString()
}

export async function readBody(
  req: IncomingMessage,
  limit = 16_384,
): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > limit) throw new RequestError(413, 'body-too-large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export function assertBrowserPost(req: IncomingMessage, config: ServiceConfig) {
  if (req.headers['x-aqua-client'] !== 'aqua-identity') {
    throw new RequestError(403, 'origin-rejected')
  }
  const origin = req.headers.origin
  if (typeof origin !== 'string' || !config.appOrigins.includes(origin)) {
    throw new RequestError(403, 'origin-rejected')
  }
}

export function socialRedirectUri(origin: string): string {
  return `${origin}/oauth/social/callback`
}
