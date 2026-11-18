import {normalizeHandle, parseIdentifier} from './did'
import {type Failure} from './types'

const LOCAL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

export function formatAquaHandle(
  local: string,
  domain: string,
): {ok: true; handle: string} | Failure {
  const zone = domain.trim().replace(/^\./, '').toLowerCase()
  if (!zone) return {ok: false, reason: 'handle-domain-unset'}
  const name = normalizeHandle(local)
  if (!LOCAL_RE.test(name)) return {ok: false, reason: 'invalid-handle'}
  const handle = `${name}.${zone}`
  if (parseIdentifier(handle).kind !== 'handle') {
    return {ok: false, reason: 'invalid-handle'}
  }
  return {ok: true, handle}
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
