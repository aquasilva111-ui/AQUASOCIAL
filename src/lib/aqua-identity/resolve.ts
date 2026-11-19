import {isDid, parseIdentifier} from './did'
import {
  type AquaIdentityConfig,
  type Failure,
  type ResolvedIdentity,
} from './types'

type FetchLike = typeof fetch

type DidDocument = {
  id?: string
  alsoKnownAs?: string[]
  service?: {
    id?: string
    type?: string
    serviceEndpoint?: string | {toString(): string}
  }[]
}

export async function resolveIdentity(
  identifier: string,
  config: Pick<AquaIdentityConfig, 'handleResolver' | 'plcDirectoryUrl'>,
  fetchImpl: FetchLike,
): Promise<{ok: true; identity: ResolvedIdentity} | Failure> {
  const parsed = parseIdentifier(identifier)
  if (parsed.kind === 'invalid')
    return {ok: false, reason: 'invalid-identifier'}
  try {
    if (parsed.kind === 'handle') {
      const did = await resolveHandle(
        parsed.handle,
        config.handleResolver,
        fetchImpl,
      )
      if (!did) return {ok: false, reason: 'resolve-failed'}
      const doc = await fetchDidDocument(did, config.plcDirectoryUrl, fetchImpl)
      if (!doc) return {ok: false, reason: 'resolve-failed'}
      const pdsUrl = pdsEndpoint(doc)
      if (!pdsUrl) return {ok: false, reason: 'pds-not-found'}
      return {
        ok: true,
        identity: {did, handle: parsed.handle, pdsUrl},
      }
    }
    const doc = await fetchDidDocument(
      parsed.did,
      config.plcDirectoryUrl,
      fetchImpl,
    )
    if (!doc) return {ok: false, reason: 'resolve-failed'}
    const pdsUrl = pdsEndpoint(doc)
    if (!pdsUrl) return {ok: false, reason: 'pds-not-found'}
    return {
      ok: true,
      identity: {
        did: parsed.did,
        handle: handleFromAlsoKnownAs(doc.alsoKnownAs),
        pdsUrl,
      },
    }
  } catch {
    return {ok: false, reason: 'resolve-failed'}
  }
}

async function resolveHandle(
  handle: string,
  resolver: string,
  fetchImpl: FetchLike,
): Promise<string | undefined> {
  const url = `${resolver}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
  const response = await fetchImpl(url, {headers: {accept: 'application/json'}})
  if (!response.ok) return undefined
  const body = (await response.json()) as {did?: string}
  return body.did && isDid(body.did) ? body.did : undefined
}

export function didWebUrl(did: string): string | undefined {
  if (!did.startsWith('did:web:')) return undefined
  const rest = did.slice('did:web:'.length)
  const [host, ...path] = rest.split(':').map(decodeURIComponent)
  if (!host) return undefined
  if (path.length === 0) return `https://${host}/.well-known/did.json`
  return `https://${host}/${path.join('/')}/did.json`
}

async function fetchDidDocument(
  did: string,
  plcDirectoryUrl: string,
  fetchImpl: FetchLike,
): Promise<DidDocument | undefined> {
  const url = did.startsWith('did:web:')
    ? didWebUrl(did)
    : did.startsWith('did:plc:')
      ? `${plcDirectoryUrl}/${did}`
      : undefined
  if (!url) return undefined
  const response = await fetchImpl(url, {headers: {accept: 'application/json'}})
  if (!response.ok) return undefined
  const doc = (await response.json()) as DidDocument
  if (doc.id && doc.id !== did) return undefined
  return doc
}

export function pdsEndpoint(doc: DidDocument): string | undefined {
  const service = doc.service?.find(item => {
    const id = item.id ?? ''
    return (
      id.endsWith('#atproto_pds') || item.type === 'AtprotoPersonalDataServer'
    )
  })
  const endpoint = service?.serviceEndpoint
  if (!endpoint) return undefined
  const value = typeof endpoint === 'string' ? endpoint : String(endpoint)
  if (!value.startsWith('https://') && !value.startsWith('http://'))
    return undefined
  return value.replace(/\/$/, '')
}

function handleFromAlsoKnownAs(
  values: string[] | undefined,
): string | undefined {
  const at = values?.find(value => value.startsWith('at://'))
  if (!at) return undefined
  const handle = at.slice('at://'.length).split('/')[0]
  return handle || undefined
}
