import {type Entitlement} from './types'

/**
 * Entitlement grant store.
 *
 * In-memory by design at this phase: grants are session-scoped client state,
 * never persisted, and a server-authoritative store replaces this in FASE 8.
 * Grants are bound to an explicit userId — a grant can never be looked up
 * for a different user than the one it was issued to.
 */

let grants: Entitlement[] = []
let sequence = 0

export function listEntitlements(userId: string): Entitlement[] {
  return grants.filter(grant => grant.userId === userId)
}

export function listResourceEntitlements(resourceId: string): Entitlement[] {
  return grants.filter(grant => grant.resourceId === resourceId)
}

export function grantEntitlement(
  input: Omit<Entitlement, 'id' | 'grantedAt' | 'revokedAt'>,
): Entitlement {
  const entitlement: Entitlement = {
    ...input,
    id: `ent_${++sequence}`,
    grantedAt: new Date().toISOString(),
  }
  grants = grants.concat(entitlement)
  return entitlement
}

/** Revocation keeps the record — administrative history is never erased. */
export function revokeEntitlement(id: string): void {
  grants = grants.map(grant =>
    grant.id === id && !grant.revokedAt
      ? {...grant, revokedAt: new Date().toISOString()}
      : grant,
  )
}

/** Test/reset hook — the store must never leak state across sessions. */
export function clearEntitlements(): void {
  grants = []
  sequence = 0
}
