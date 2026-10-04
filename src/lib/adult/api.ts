import {type BskyAgent} from '@atproto/api'

import {ADULT_SELF_DECLARATION_POLICY_VERSION} from '#/state/adult/gate'

/**
 * Client for aqua-adult-api. The app never decides +18 access itself: every
 * call carries a short service-auth token minted by the user's own PDS
 * (no second login), and the API answers with its decision.
 */
export const ADULT_API_URL =
  process.env.EXPO_PUBLIC_AQUA_ADULT_API_URL ?? 'http://127.0.0.1:4318'
export const ADULT_API_DID =
  process.env.EXPO_PUBLIC_AQUA_ADULT_API_DID ??
  'did:web:adult-api.aqua.localhost'

export class AdultApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code)
  }
}

type CachedToken = {did: string; token: string; exp: number}
let cached: CachedToken | undefined

async function serviceToken(agent: BskyAgent): Promise<string> {
  const did = agent.session?.did
  if (!did) throw new AdultApiError(401, 'not_authenticated')
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.did === did && cached.exp - 30 > now) return cached.token
  const exp = now + 5 * 60
  const {data} = await agent.com.atproto.server.getServiceAuth({
    aud: ADULT_API_DID,
    exp,
  })
  cached = {did, token: data.token, exp}
  return data.token
}

/** Drops the cached token (logout/account switch/exit from +18). */
export function clearAdultApiToken() {
  cached = undefined
}

export async function adultApi<T = any>(
  agent: BskyAgent,
  path: string,
  init: {method?: string; body?: unknown} = {},
): Promise<T> {
  const token = await serviceToken(agent)
  const res = await fetch(`${ADULT_API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body !== undefined ? {'content-type': 'application/json'} : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok)
    throw new AdultApiError(res.status, json?.error ?? 'request_failed')
  return json as T
}

/**
 * Records the temporary self-declaration of majority on aqua-adult-api.
 * The server stores it apart from age verification — never AGE_VERIFIED.
 */
export function recordAdultSelfDeclaration(agent: BskyAgent) {
  return adultApi<{allowed: boolean; basis: string | null}>(
    agent,
    '/me/adult/self-declaration',
    {
      method: 'POST',
      body: {
        declaration: 'adult',
        policyVersion: ADULT_SELF_DECLARATION_POLICY_VERSION,
      },
    },
  )
}

/**
 * Mirrors a +18 block on aqua-adult-api so it applies to server-side feeds,
 * recommendations, creator content and live chat. Best effort: the local
 * block still hides the creator while the API is unreachable.
 */
export function syncAdultBlock(
  agent: BskyAgent,
  targetDid: string,
  blocked: boolean,
) {
  return adultApi(agent, `/me/adult/blocks/${encodeURIComponent(targetDid)}`, {
    method: blocked ? 'PUT' : 'DELETE',
  })
}

/** Mirrors a +18 follow or mute so it survives reloads and devices. */
export function syncAdultRelation(
  agent: BskyAgent,
  kind: 'follows' | 'mutes',
  targetDid: string,
  on: boolean,
) {
  return adultApi(agent, `/me/adult/${kind}/${encodeURIComponent(targetDid)}`, {
    method: on ? 'PUT' : 'DELETE',
  })
}

/** The server copy of the user's follows, mutes and blocks. */
export async function fetchAdultRelations(agent: BskyAgent) {
  const [follows, mutes, blocks] = await Promise.all([
    adultApi<{follows: {did: string}[]}>(agent, '/me/adult/follows'),
    adultApi<{mutes: {did: string}[]}>(agent, '/me/adult/mutes'),
    adultApi<{blocks: {did: string}[]}>(agent, '/me/adult/blocks'),
  ])
  return {
    follows: follows.follows.map(r => r.did),
    mutes: mutes.mutes.map(r => r.did),
    blocks: blocks.blocks.map(r => r.did),
  }
}

export type AdultDrop = {
  id: string
  title: string
  creator: {id: string; did: string; handle: string | null}
  accessPolicy: string
  previewDurationMs: number | null
  publishedAt: string
  posterUrl: string | null
}

export type AdultBoard = {
  id: string
  name: string
  visibility: 'private' | 'public'
  itemCount?: number
}

export type AdultBook = {
  id: string
  title: string
  description: string | null
  parts: number
  author: {did: string; handle: string | null}
}

/** Media URLs from the API are relative, signed and short-lived. */
export function adultMediaUrl(path: string | null | undefined) {
  return path ? `${ADULT_API_URL}${path}` : undefined
}

export type AdultVideoCard = {
  id: string
  title: string
  description: string | null
  category: string | null
  creator: {id: string; handle: string | null}
  durationMs: number | null
  accessPolicy: string
  viewCount: string
  publishedAt: string
  hasPreview: boolean
  posterUrl: string | null
}

export type AdultAccessDecision =
  | {allowed: true; reason: 'ok'; via: string; expiresAt?: string}
  | {allowed: false; reason: string}

export type AdultOffer = {
  id: string
  kind: 'ppv' | 'purchase' | 'rental'
  priceMinor: string
  currency: string
  accessHours: number | null
}

/** Formats integer minor units for display only (never for math). */
export function formatMinor(priceMinor: string, currency: string) {
  const digits = currency === 'JPY' ? 0 : 2
  const value = Number(priceMinor) / 10 ** digits
  return new Intl.NumberFormat('pt-BR', {style: 'currency', currency}).format(
    value,
  )
}
