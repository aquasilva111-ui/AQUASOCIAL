const DID_RE = /^did:[a-z0-9]+:[a-zA-Z0-9._:%-]*[a-zA-Z0-9._%-]$/
const HANDLE_RE =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/

export function isDid(value: string): boolean {
  return DID_RE.test(value)
}

export function normalizeHandle(value: string): string | undefined {
  const handle = value.trim().replace(/^@/, '').toLowerCase()
  if (!HANDLE_RE.test(handle)) return undefined
  return handle
}

/**
 * Same HTTPS and DNS TXT check as src/lib/aqua-identity/domain.ts.
 * The Expo module is extensionless and cannot be imported by this Node process.
 * The service runs the check itself so a client cannot claim a handle.
 */
export async function verifyHandleDid(input: {
  handle: string
  expectedDid: string
  fetch: typeof fetch
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
  fetchImpl: typeof fetch,
): Promise<string | undefined> {
  try {
    const response = await fetchImpl(
      `https://${handle}/.well-known/atproto-did`,
      {headers: {accept: 'text/plain'}},
    )
    if (!response.ok) return undefined
    const text = (await response.text()).trim()
    return isDid(text) ? text : undefined
  } catch {
    return undefined
  }
}

async function readDnsTxt(
  handle: string,
  fetchImpl: typeof fetch,
  dohUrl: string,
): Promise<string | undefined> {
  try {
    const url = new URL(dohUrl)
    url.searchParams.set('name', `_atproto.${handle}`)
    url.searchParams.set('type', 'TXT')
    const response = await fetchImpl(url, {
      headers: {accept: 'application/dns-json'},
    })
    if (!response.ok) return undefined
    const body = (await response.json()) as {Answer?: {data?: string}[]}
    for (const answer of body.Answer ?? []) {
      const match = answer.data?.match(/did=([^\s"]+)/)
      if (match?.[1] && isDid(match[1])) return match[1]
    }
    return undefined
  } catch {
    return undefined
  }
}
