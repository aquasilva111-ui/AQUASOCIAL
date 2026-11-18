import {isDid} from './did'

export function dnsTxtName(handle: string): string {
  return `_atproto.${handle}`
}

export function dnsTxtValue(did: string): string {
  return `did=${did}`
}

export function wellKnownUrl(handle: string): string {
  return `https://${handle}/.well-known/atproto-did`
}

export function wellKnownBody(did: string): string {
  return did
}

function didFromTxt(data: string): string | undefined {
  const match = data.match(/did=([^\s"]+)/)
  return match?.[1]
}

type FetchLike = typeof fetch

/**
 * Confirms a handle publishes the expected DID.
 * HTTPS `/.well-known/atproto-did` is checked first, then DNS TXT via DoH.
 */
export async function verifyHandleDid(input: {
  handle: string
  expectedDid: string
  fetch: FetchLike
  dohUrl: string
}): Promise<
  | {ok: true; method: 'https' | 'dns'; did: string}
  | {ok: false; reason: 'handle-did-mismatch' | 'handle-verification-failed'}
> {
  const httpsDid = await readWellKnown(input.handle, input.fetch)
  if (httpsDid && httpsDid === input.expectedDid) {
    return {ok: true, method: 'https', did: httpsDid}
  }
  const dnsDid = await readDnsTxt(input.handle, input.fetch, input.dohUrl)
  if (dnsDid && dnsDid === input.expectedDid) {
    return {ok: true, method: 'dns', did: dnsDid}
  }
  if (httpsDid || dnsDid) return {ok: false, reason: 'handle-did-mismatch'}
  return {ok: false, reason: 'handle-verification-failed'}
}

async function readWellKnown(
  handle: string,
  fetchImpl: FetchLike,
): Promise<string | undefined> {
  try {
    const response = await fetchImpl(wellKnownUrl(handle), {
      headers: {accept: 'text/plain'},
    })
    if (!response.ok) return undefined
    const text = (await response.text()).trim()
    return isDid(text) ? text : undefined
  } catch {
    return undefined
  }
}

async function readDnsTxt(
  handle: string,
  fetchImpl: FetchLike,
  dohUrl: string,
): Promise<string | undefined> {
  try {
    const url = new URL(dohUrl)
    url.searchParams.set('name', dnsTxtName(handle))
    url.searchParams.set('type', 'TXT')
    const response = await fetchImpl(url.toString(), {
      headers: {accept: 'application/dns-json'},
    })
    if (!response.ok) return undefined
    const body = (await response.json()) as {
      Answer?: {data?: string}[]
    }
    for (const answer of body.Answer ?? []) {
      const did = answer.data ? didFromTxt(answer.data) : undefined
      if (did && isDid(did)) return did
    }
    return undefined
  } catch {
    return undefined
  }
}
