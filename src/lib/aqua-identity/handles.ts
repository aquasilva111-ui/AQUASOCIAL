import {normalizeHandle, parseIdentifier} from './did'
import {type Failure} from './types'

const LOCAL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
const DOMAIN_RE =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/

/** App config has no leading dot. The PDS env var does (`.exemplo.com`). */
export function normalizeHandleDomain(domain: string): string {
  return domain.trim().replace(/^\.+/, '').replace(/\.+$/, '').toLowerCase()
}

/**
 * A native AQUA handle is exactly one label under the configured domain.
 * `ada.exemplo.com` matches `exemplo.com`. `ada.bsky.social` does not.
 * The domain is never assumed, including aquaapp.systems.
 */
export function nativeHandleOnDomain(
  handle: string,
  domain: string,
): {ok: true; handle: string} | Failure {
  const zone = normalizeHandleDomain(domain)
  if (!zone) return {ok: false, reason: 'handle-domain-unset'}
  if (!DOMAIN_RE.test(zone)) return {ok: false, reason: 'invalid-handle'}
  const parsed = parseIdentifier(handle)
  if (parsed.kind !== 'handle') return {ok: false, reason: 'invalid-handle'}
  const suffix = `.${zone}`
  if (!parsed.handle.endsWith(suffix)) {
    return {ok: false, reason: 'handle-domain-mismatch'}
  }
  const local = parsed.handle.slice(0, -suffix.length)
  if (!LOCAL_RE.test(local)) return {ok: false, reason: 'invalid-handle'}
  return {ok: true, handle: parsed.handle}
}

export function formatAquaHandle(
  local: string,
  domain: string,
): {ok: true; handle: string} | Failure {
  const zone = normalizeHandleDomain(domain)
  if (!zone) return {ok: false, reason: 'handle-domain-unset'}
  const name = normalizeHandle(local)
  if (!LOCAL_RE.test(name)) return {ok: false, reason: 'invalid-handle'}
  return nativeHandleOnDomain(`${name}.${zone}`, zone)
}

/**
 * Changing host is a handle update on the same DID.
 * The DID in the returned plan is the account key before and after.
 */
export function planHandleChange(input: {
  did: string
  currentHandle: string
  nextHandle: string
}):
  | {ok: true; did: string; from: string; to: string; didUnchanged: true}
  | Failure {
  if (!input.did.startsWith('did:')) return {ok: false, reason: 'missing-did'}
  const next = parseIdentifier(input.nextHandle)
  if (next.kind !== 'handle') return {ok: false, reason: 'invalid-handle'}
  return {
    ok: true,
    did: input.did,
    from: input.currentHandle,
    to: next.handle,
    didUnchanged: true,
  }
}
