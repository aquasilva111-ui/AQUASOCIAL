import {PUBLIC_BSKY_SERVICE} from '#/lib/constants'
import {logger} from '#/logger'

const TEXT_LIMIT = 400
const DESCRIPTION_LIMIT = 280
const ERROR_LIMIT = 180

export type PublicActor = {
  did: string
  handle: string
  displayName: string | null
  description: string | null
  path: string
}

export type PublicPost = {
  uri: string
  text: string
  createdAt: string | null
  author: {
    did: string
    handle: string
    displayName: string | null
  }
  replyCount: number | null
  repostCount: number | null
  likeCount: number | null
  path: string
}

export type PublicApiSuccess<T> = {ok: true; value: T}
export type PublicApiFailure = {ok: false; error: string}
export type PublicApiResult<T> = PublicApiSuccess<T> | PublicApiFailure

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>

type RequestOptions = {
  signal?: AbortSignal
  fetchImpl?: FetchLike
}

const SEARCH_POSTS = 'app.bsky.feed.searchPosts'
const SEARCH_ACTORS = 'app.bsky.actor.searchActors'
const GET_PROFILE = 'app.bsky.actor.getProfile'

export async function searchPublicPosts(
  query: string,
  options: RequestOptions & {limit: number; sort: 'top' | 'latest'},
): Promise<PublicApiResult<PublicPost[]>> {
  const url = xrpcUrl(SEARCH_POSTS, {
    q: query,
    limit: String(options.limit),
    sort: options.sort,
  })
  const result = await callPublicApi(url, 'search posts', options)
  if (!result.ok) return result
  const record = asRecord(result.value)
  const posts = Array.isArray(record?.posts) ? record.posts : []
  return {
    ok: true,
    value: posts
      .slice(0, options.limit)
      .map(pickPublicPost)
      .filter((post): post is PublicPost => post !== null),
  }
}

export async function searchPublicActors(
  query: string,
  options: RequestOptions & {limit: number},
): Promise<PublicApiResult<PublicActor[]>> {
  const url = xrpcUrl(SEARCH_ACTORS, {
    q: query,
    limit: String(options.limit),
  })
  const result = await callPublicApi(url, 'search users', options)
  if (!result.ok) return result
  const record = asRecord(result.value)
  const actors = Array.isArray(record?.actors) ? record.actors : []
  return {
    ok: true,
    value: actors
      .slice(0, options.limit)
      .map(pickPublicActor)
      .filter((actor): actor is PublicActor => actor !== null),
  }
}

export async function getPublicProfile(
  actor: string,
  options: RequestOptions = {},
): Promise<PublicApiResult<PublicActor>> {
  const url = xrpcUrl(GET_PROFILE, {actor})
  const result = await callPublicApi(url, 'load profile', options)
  if (!result.ok) return result
  const profile = pickPublicActor(result.value)
  if (!profile) {
    return {ok: false, error: 'The public profile did not include a handle.'}
  }
  return {ok: true, value: profile}
}

function xrpcUrl(method: string, query: Record<string, string>): string {
  const url = new URL(`/xrpc/${method}`, PUBLIC_BSKY_SERVICE)
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

async function callPublicApi(
  url: string,
  action: string,
  options: RequestOptions,
): Promise<PublicApiResult<unknown>> {
  const fetchImpl = options.fetchImpl ?? fetch
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      credentials: 'omit',
      headers: {accept: 'application/json'},
      signal: options.signal,
    })
    const body = await readJson(response)
    if (!response.ok) {
      return {ok: false, error: failureMessage(action, response.status, body)}
    }
    return {ok: true, value: body}
  } catch (err) {
    if (isAbort(err)) {
      return {ok: false, error: `The request to ${action} was cancelled.`}
    }
    logger.warn('webmcp: public AppView request failed', {
      message: err instanceof Error ? err.message : String(err),
    })
    return {ok: false, error: `The public AppView could not ${action}.`}
  }
}

async function readJson(response: Pick<Response, 'json'>): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function failureMessage(action: string, status: number, body: unknown): string {
  const record = asRecord(body)
  const message =
    record && typeof record.message === 'string'
      ? record.message.slice(0, ERROR_LIMIT)
      : ''
  const suffix = message ? `: ${message}` : '.'
  return `The public AppView could not ${action} (${status})${suffix}`
}

export function pickPublicActor(raw: unknown): PublicActor | null {
  const actor = asRecord(raw)
  if (!actor) return null
  const handle = stringField(actor, 'handle')
  const did = stringField(actor, 'did')
  if (!handle || !did || handle.includes('/') || did.includes('/')) return null
  const description = stringField(actor, 'description')
  return {
    did,
    handle,
    displayName: stringField(actor, 'displayName') ?? null,
    description: description ? description.slice(0, DESCRIPTION_LIMIT) : null,
    path: `/profile/${handle}`,
  }
}

export function pickPublicPost(raw: unknown): PublicPost | null {
  const post = asRecord(raw)
  if (!post) return null
  const uri = stringField(post, 'uri')
  const author = pickPublicActor(post.author)
  if (!uri || !author) return null
  const record = asRecord(post.record)
  const text = record ? (stringField(record, 'text') ?? '') : ''
  const rkey = uri.split('/').pop()
  return {
    uri,
    text: text.slice(0, TEXT_LIMIT),
    createdAt: record ? (stringField(record, 'createdAt') ?? null) : null,
    author: {
      did: author.did,
      handle: author.handle,
      displayName: author.displayName,
    },
    replyCount: numberField(post, 'replyCount'),
    repostCount: numberField(post, 'repostCount'),
    likeCount: numberField(post, 'likeCount'),
    path: rkey ? `/profile/${author.handle}/post/${rkey}` : author.path,
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function stringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function numberField(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}
