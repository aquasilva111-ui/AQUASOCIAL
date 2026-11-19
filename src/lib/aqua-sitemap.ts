/**
 * Build-time sitemap of public Aqua accounts.
 *
 * The site is static. `scripts/emit-aqua-sitemap.js` calls `loadAquaSitemap`
 * during the web build and writes `sitemap-posts.xml` and
 * `sitemap-profiles.xml`. URLs are `/profile/<handle>` and
 * `/profile/<handle>/post/<rkey>`.
 *
 * Source of truth is the public PDS API (`com.atproto.sync.listRepos`,
 * `com.atproto.repo.describeRepo`, `com.atproto.repo.getRecord`, and
 * `com.atproto.repo.listRecords` for `app.bsky.feed.post`). Deleted posts are
 * not in the repo, so they are not listed. Taken-down or deactivated accounts
 * are skipped from `listRepos`. A record the PDS still returns with a takedown
 * or deletion flag is skipped too.
 *
 * `!no-unauthenticated` and `!hide` are excluded, whether they are self-labels
 * on the record or moderation labels on the public AppView. Adult labels
 * (`porn`, `sexual`, `nudity`, `graphic-media`) exclude that post, and the
 * same labels on a profile exclude the profile and every post of that account.
 * Aqua+18 routes live under `/adult` and are never written.
 *
 * If the PDS does not answer, the lists are empty and the build continues.
 */

import {AQUA_PDS_URL} from './aqua-pds'

export const SITE_ORIGIN = 'https://aquaapp.systems'

export const APP_VIEW_ORIGIN = 'https://public.api.bsky.app'

/** Sitemap protocol limit. One file never holds more than this. */
export const SITEMAP_URL_LIMIT = 50000

export const LIST_REPOS_PAGE_LIMIT = 1000

export const LIST_RECORDS_PAGE_LIMIT = 100

const MAX_REPO_PAGES = 100

const MAX_RECORD_PAGES = 500

const APP_VIEW_BATCH = 25

export const ADULT_LABELS = [
  'porn',
  'sexual',
  'nudity',
  'graphic-media',
] as const

/** Logged-out opt-out, and moderation that hides the record. */
export const HIDDEN_LABELS = ['!no-unauthenticated', '!hide'] as const

const BLUESKY_HANDLE_SUFFIXES = ['.bsky.social', '.bsky.app', '.bsky.team']

const ACCOUNT_BLOCK_ERRORS = new Set([
  'AccountTakedown',
  'AccountDeactivated',
  'AccountDeleted',
  'AccountSuspended',
])

const RECORD_MISSING_ERRORS = new Set(['RecordNotFound'])

export type SitemapResponse = {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

export type SitemapFetch = (
  url: string,
  init?: {signal?: AbortSignal},
) => Promise<SitemapResponse>

export type AquaSitemap = {
  posts: string[]
  profiles: string[]
  warning?: string
}

const POSTS_FILE = 'sitemap-posts.xml'
const PROFILES_FILE = 'sitemap-profiles.xml'

export function isBlockedPublicLabel(value: string): boolean {
  const label = value.trim().toLowerCase()
  return (
    (ADULT_LABELS as readonly string[]).includes(label) ||
    (HIDDEN_LABELS as readonly string[]).includes(label)
  )
}

function takeLabel(value: unknown, found: string[]) {
  if (!value || typeof value !== 'object') return
  const item = value as {val?: unknown; values?: unknown}
  if (typeof item.val === 'string') found.push(item.val)
  if (Array.isArray(item.values)) {
    for (const entry of item.values) takeLabel(entry, found)
  }
}

function labelsOn(node: unknown, found: string[]) {
  if (!node || typeof node !== 'object') return
  const labels = (node as {labels?: unknown}).labels
  if (Array.isArray(labels)) {
    for (const entry of labels) takeLabel(entry, found)
    return
  }
  takeLabel(labels, found)
}

/** Self-labels and AppView moderation labels. Does not walk post text. */
export function labelValuesFrom(node: unknown): string[] {
  if (!node || typeof node !== 'object') return []
  const found: string[] = []
  const record = node as {record?: unknown; value?: unknown}
  labelsOn(node, found)
  labelsOn(record.record, found)
  labelsOn(record.value, found)
  return found
}

export function hasBlockedPublicLabel(node: unknown): boolean {
  return labelValuesFrom(node).some(isBlockedPublicLabel)
}

export function isPublicRepo(repo: unknown): repo is {did: string} {
  if (!repo || typeof repo !== 'object') return false
  const row = repo as {did?: unknown; active?: unknown; status?: unknown}
  if (typeof row.did !== 'string' || !row.did.startsWith('did:')) return false
  if (row.active === false) return false
  if (typeof row.status === 'string' && row.status.trim()) return false
  return true
}

const HIDDEN_RECORD_STATUSES = new Set([
  'takendown',
  'deleted',
  'suspended',
  'deactivated',
  'hidden',
])

/**
 * A post that is gone or hidden. `listRecords` already omits deletes and
 * public takedowns; this still drops a row that carries those flags, a
 * missing value, or a blocking label.
 */
export function isHiddenPostRecord(record: unknown): boolean {
  if (!record || typeof record !== 'object') return true
  const row = record as {
    deleted?: unknown
    takedown?: unknown
    takedownRef?: unknown
    status?: unknown
    value?: unknown
  }
  if (row.deleted === true || row.takedown || row.takedownRef) return true
  if (
    typeof row.status === 'string' &&
    HIDDEN_RECORD_STATUSES.has(row.status.trim().toLowerCase())
  ) {
    return true
  }
  if (!row.value || typeof row.value !== 'object') return true
  const value = row.value as {
    $type?: unknown
    deleted?: unknown
    takedown?: unknown
  }
  if (value.deleted === true || value.takedown) return true
  if (typeof value.$type === 'string' && value.$type !== 'app.bsky.feed.post') {
    return true
  }
  return hasBlockedPublicLabel(record)
}

export function rkeyFromPostUri(uri: unknown): string | undefined {
  if (typeof uri !== 'string') return undefined
  const parts = uri.split('/')
  if (parts.length !== 5 || parts[0] !== 'at:' || parts[1] !== '') {
    return undefined
  }
  if (parts[3] !== 'app.bsky.feed.post') return undefined
  const rkey = parts[4]
  if (!rkey || !/^[A-Za-z0-9._~:-]+$/.test(rkey)) return undefined
  return rkey
}

export function profileSitemapUrl(handle: string): string | undefined {
  const path = profilePath(handle)
  if (!path) return undefined
  const url = `${SITE_ORIGIN}${path}`
  return isAllowedSitemapUrl(url) ? url : undefined
}

export function postSitemapUrl(
  handle: string,
  rkey: string,
): string | undefined {
  const path = profilePath(handle)
  if (!path || !/^[A-Za-z0-9._~:-]+$/.test(rkey)) return undefined
  const url = `${SITE_ORIGIN}${path}/post/${encodeURIComponent(rkey)}`
  return isAllowedSitemapUrl(url) ? url : undefined
}

export function isAllowedSitemapUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.origin !== SITE_ORIGIN) return false
    if (parsed.search || parsed.hash) return false
    const path = parsed.pathname
    if (path === '/adult' || path.startsWith('/adult/')) return false
    return (
      /^\/profile\/[^/]+$/i.test(path) ||
      /^\/profile\/[^/]+\/post\/[^/]+$/i.test(path)
    )
  } catch {
    return false
  }
}

function profilePath(handle: string): string | undefined {
  const normalized = handle.trim()
  const lower = normalized.toLowerCase()
  if (!lower || lower === 'handle.invalid') return undefined
  if (lower.includes('/') || lower.includes('@') || /\s/.test(lower)) {
    return undefined
  }
  if (!/^[a-z0-9.-]+$/.test(lower) || !lower.includes('.')) return undefined
  if (BLUESKY_HANDLE_SUFFIXES.some(suffix => lower.endsWith(suffix))) {
    return undefined
  }
  const path = `/profile/${encodeURIComponent(normalized)}`
  if (path === '/adult' || path.startsWith('/adult/')) return undefined
  return path
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderUrlSet(urls: readonly string[]): string {
  const lines = urls
    .filter(isAllowedSitemapUrl)
    .map(url => `  <url><loc>${escapeXml(url)}</loc></url>`)
  const body = lines.length ? `\n${lines.join('\n')}\n` : '\n'
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>\n`
}

export function ensureSitemapIndex(xml: string): string {
  let next = xml.trimEnd()
  if (!next.includes('</sitemapindex>')) {
    throw new Error('sitemap.xml is missing </sitemapindex>')
  }
  for (const file of [POSTS_FILE, PROFILES_FILE]) {
    const loc = `${SITE_ORIGIN}/${file}`
    if (next.includes(loc)) continue
    next = next.replace(
      '</sitemapindex>',
      `  <sitemap><loc>${escapeXml(loc)}</loc></sitemap>\n</sitemapindex>`,
    )
  }
  return `${next}\n`
}

function arrayOf(body: unknown, key: string): unknown[] {
  if (!body || typeof body !== 'object') return []
  const value = (body as Record<string, unknown>)[key]
  return Array.isArray(value) ? value : []
}

function cursorOf(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const cursor = (body as {cursor?: unknown}).cursor
  return typeof cursor === 'string' && cursor ? cursor : undefined
}

function errorName(body: unknown): string {
  if (!body || typeof body !== 'object') return ''
  const error = (body as {error?: unknown}).error
  return typeof error === 'string' ? error : ''
}

async function defaultFetch(url: string): Promise<SitemapResponse> {
  const response = await fetch(url, {signal: AbortSignal.timeout(20000)})
  return {
    ok: response.ok,
    status: response.status,
    json: () => response.json(),
  }
}

async function readJson(
  fetchImpl: SitemapFetch,
  url: string,
): Promise<{ok: boolean; status: number; body: unknown}> {
  const response = await fetchImpl(url)
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  return {ok: response.ok, status: response.status, body}
}

function pdsFailed(status: number): boolean {
  return status >= 500 || status === 429
}

async function listPublicRepos(
  fetchImpl: SitemapFetch,
  pdsOrigin: string,
): Promise<{did: string}[]> {
  const repos: {did: string}[] = []
  let cursor: string | undefined
  for (let page = 0; page < MAX_REPO_PAGES; page++) {
    const url = new URL(`${pdsOrigin}/xrpc/com.atproto.sync.listRepos`)
    url.searchParams.set('limit', String(LIST_REPOS_PAGE_LIMIT))
    if (cursor) url.searchParams.set('cursor', cursor)
    const href = url.toString()
    const result = await readJson(fetchImpl, href)
    if (pdsFailed(result.status) || !result.ok) {
      throw new Error(`${result.status} ${href}`)
    }
    const batch = arrayOf(result.body, 'repos')
    for (const repo of batch) {
      if (isPublicRepo(repo)) repos.push({did: repo.did})
    }
    const next = cursorOf(result.body)
    if (!next || next === cursor || batch.length === 0) break
    cursor = next
  }
  return repos
}

async function describeHandle(
  fetchImpl: SitemapFetch,
  pdsOrigin: string,
  did: string,
): Promise<string | undefined> {
  const url = new URL(`${pdsOrigin}/xrpc/com.atproto.repo.describeRepo`)
  url.searchParams.set('repo', did)
  const href = url.toString()
  const result = await readJson(fetchImpl, href)
  if (pdsFailed(result.status)) throw new Error(`${result.status} ${href}`)
  if (!result.ok || !result.body || typeof result.body !== 'object') {
    return undefined
  }
  const body = result.body as {handle?: unknown; handleIsCorrect?: unknown}
  if (body.handleIsCorrect === false) return undefined
  return typeof body.handle === 'string' ? body.handle : undefined
}

async function profileIsBlocked(
  fetchImpl: SitemapFetch,
  pdsOrigin: string,
  did: string,
): Promise<boolean> {
  const url = new URL(`${pdsOrigin}/xrpc/com.atproto.repo.getRecord`)
  url.searchParams.set('repo', did)
  url.searchParams.set('collection', 'app.bsky.actor.profile')
  url.searchParams.set('rkey', 'self')
  const href = url.toString()
  const result = await readJson(fetchImpl, href)
  if (pdsFailed(result.status)) throw new Error(`${result.status} ${href}`)
  if (!result.ok) {
    if (RECORD_MISSING_ERRORS.has(errorName(result.body))) return false
    return true
  }
  return hasBlockedPublicLabel(result.body)
}

type PostHit = {uri: string; url: string}

async function listActorPosts(
  fetchImpl: SitemapFetch,
  pdsOrigin: string,
  did: string,
  handle: string,
  limit: number,
): Promise<{posts: PostHit[]; truncated: boolean} | undefined> {
  const posts: PostHit[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  let truncated = false
  for (let page = 0; page < MAX_RECORD_PAGES && posts.length < limit; page++) {
    const url = new URL(`${pdsOrigin}/xrpc/com.atproto.repo.listRecords`)
    url.searchParams.set('repo', did)
    url.searchParams.set('collection', 'app.bsky.feed.post')
    url.searchParams.set('limit', String(LIST_RECORDS_PAGE_LIMIT))
    if (cursor) url.searchParams.set('cursor', cursor)
    const href = url.toString()
    const result = await readJson(fetchImpl, href)
    if (pdsFailed(result.status)) throw new Error(`${result.status} ${href}`)
    if (!result.ok) return undefined
    const records = arrayOf(result.body, 'records')
    for (let index = 0; index < records.length; index++) {
      const record = records[index]
      if (isHiddenPostRecord(record)) continue
      const uri =
        record && typeof record === 'object'
          ? (record as {uri?: unknown}).uri
          : undefined
      const rkey = rkeyFromPostUri(uri)
      const loc = rkey ? postSitemapUrl(handle, rkey) : undefined
      if (!loc || seen.has(loc) || typeof uri !== 'string') continue
      if (posts.length >= limit) {
        truncated = true
        break
      }
      seen.add(loc)
      posts.push({uri, url: loc})
    }
    if (posts.length >= limit) {
      const next = cursorOf(result.body)
      if (next && next !== cursor) truncated = true
      break
    }
    const next = cursorOf(result.body)
    if (!next || next === cursor || records.length === 0) break
    cursor = next
  }
  return {posts, truncated}
}

async function appViewHidesAccount(
  fetchImpl: SitemapFetch,
  appViewOrigin: string,
  did: string,
): Promise<'hide' | 'show' | 'unchecked'> {
  const url = new URL(`${appViewOrigin}/xrpc/app.bsky.actor.getProfile`)
  url.searchParams.set('actor', did)
  try {
    const result = await readJson(fetchImpl, url.toString())
    if (!result.ok) {
      if (ACCOUNT_BLOCK_ERRORS.has(errorName(result.body))) return 'hide'
      return 'unchecked'
    }
    return hasBlockedPublicLabel(result.body) ? 'hide' : 'show'
  } catch {
    return 'unchecked'
  }
}

async function dropLabeledByAppView(
  fetchImpl: SitemapFetch,
  appViewOrigin: string,
  posts: PostHit[],
): Promise<{posts: PostHit[]; unchecked: boolean}> {
  const kept: PostHit[] = []
  let unchecked = false
  for (let index = 0; index < posts.length; index += APP_VIEW_BATCH) {
    const chunk = posts.slice(index, index + APP_VIEW_BATCH)
    const url = new URL(`${appViewOrigin}/xrpc/app.bsky.feed.getPosts`)
    for (const post of chunk) url.searchParams.append('uris', post.uri)
    let result: {ok: boolean; status: number; body: unknown}
    try {
      result = await readJson(fetchImpl, url.toString())
    } catch {
      unchecked = true
      kept.push(...chunk)
      continue
    }
    if (!result.ok) {
      unchecked = true
      kept.push(...chunk)
      continue
    }
    const views = new Map<string, unknown>()
    for (const view of arrayOf(result.body, 'posts')) {
      if (!view || typeof view !== 'object') continue
      const uri = (view as {uri?: unknown}).uri
      if (typeof uri === 'string') views.set(uri, view)
    }
    for (const post of chunk) {
      const view = views.get(post.uri)
      if (view && hasBlockedPublicLabel(view)) continue
      kept.push(post)
    }
  }
  return {posts: kept, unchecked}
}

export async function loadAquaSitemap(opts?: {
  fetchImpl?: SitemapFetch
  pdsOrigin?: string
  appViewOrigin?: string
  limit?: number
}): Promise<AquaSitemap> {
  const pdsOrigin = (opts?.pdsOrigin ?? AQUA_PDS_URL).replace(/\/$/, '')
  const appViewOrigin = (opts?.appViewOrigin ?? APP_VIEW_ORIGIN).replace(
    /\/$/,
    '',
  )
  const fetchImpl = opts?.fetchImpl ?? defaultFetch
  const limit =
    opts?.limit && opts.limit > 0
      ? Math.min(opts.limit, SITEMAP_URL_LIMIT)
      : SITEMAP_URL_LIMIT
  try {
    const repos = await listPublicRepos(fetchImpl, pdsOrigin)
    const posts: string[] = []
    const profiles: string[] = []
    const seenProfiles = new Set<string>()
    let truncated = false
    let appViewUnchecked = false
    for (const repo of repos) {
      if (profiles.length >= limit && posts.length >= limit) {
        truncated = true
        break
      }
      const handle = await describeHandle(fetchImpl, pdsOrigin, repo.did)
      const profileUrl = handle ? profileSitemapUrl(handle) : undefined
      if (!handle || !profileUrl) continue
      if (await profileIsBlocked(fetchImpl, pdsOrigin, repo.did)) continue
      const appViewAccount = await appViewHidesAccount(
        fetchImpl,
        appViewOrigin,
        repo.did,
      )
      if (appViewAccount === 'hide') continue
      if (appViewAccount === 'unchecked') appViewUnchecked = true
      let actorPosts: PostHit[] = []
      if (posts.length >= limit) {
        truncated = true
      } else {
        const listed = await listActorPosts(
          fetchImpl,
          pdsOrigin,
          repo.did,
          handle,
          limit - posts.length,
        )
        if (!listed) continue
        if (listed.truncated) truncated = true
        const filtered = await dropLabeledByAppView(
          fetchImpl,
          appViewOrigin,
          listed.posts,
        )
        if (filtered.unchecked) appViewUnchecked = true
        actorPosts = filtered.posts
      }
      if (!seenProfiles.has(profileUrl) && profiles.length < limit) {
        seenProfiles.add(profileUrl)
        profiles.push(profileUrl)
      } else if (!seenProfiles.has(profileUrl)) {
        truncated = true
      }
      for (const post of actorPosts) {
        if (posts.length >= limit) {
          truncated = true
          break
        }
        posts.push(post.url)
      }
    }
    const notes: string[] = []
    if (truncated) {
      notes.push(`[aqua-sitemap] sitemap truncated to ${limit} URLs per file.`)
    }
    if (appViewUnchecked) {
      notes.push(
        '[aqua-sitemap] AppView labels could not be checked. PDS self-labels, takedown, and deactivated accounts were still applied.',
      )
    }
    return {
      posts,
      profiles,
      warning: notes.length ? notes.join(' ') : undefined,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      posts: [],
      profiles: [],
      warning: `[aqua-sitemap] PDS request failed (${message}). sitemap-posts.xml and sitemap-profiles.xml were left empty.`,
    }
  }
}
