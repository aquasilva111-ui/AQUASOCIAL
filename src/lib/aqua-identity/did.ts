const DID_RE = /^did:[a-z0-9]+:[a-zA-Z0-9._:%-]*[a-zA-Z0-9._%-]$/
const HANDLE_RE =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/

export function isDid(value: string): boolean {
  return DID_RE.test(value)
}

export function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase()
}

export type ParsedIdentifier =
  | {kind: 'did'; did: string}
  | {kind: 'handle'; handle: string}
  | {kind: 'invalid'}

/** Handle or DID. A URL is not an account id. */
export function parseIdentifier(raw: string): ParsedIdentifier {
  const trimmed = raw.trim().replace(/^@/, '')
  if (!trimmed || /\s/.test(trimmed)) return {kind: 'invalid'}
  if (trimmed.toLowerCase().startsWith('did:')) {
    return isDid(trimmed) ? {kind: 'did', did: trimmed} : {kind: 'invalid'}
  }
  const handle = trimmed.toLowerCase()
  if (!HANDLE_RE.test(handle)) return {kind: 'invalid'}
  return {kind: 'handle', handle}
}

/** The only stable key for an AQUA account. */
export function accountKey(account: {did: string}): string {
  return account.did
}
