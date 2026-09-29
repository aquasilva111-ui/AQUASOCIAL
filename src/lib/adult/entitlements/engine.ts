import {logger} from '#/logger'
import {listEntitlements} from './store'
import {
  ACCESS_DENIED_UNKNOWN,
  type AccessControlledResource,
  type AccessDecision,
  type AccessRequest,
  type Entitlement,
  type EntitlementType,
} from './types'

/**
 * AQUA Entitlements engine.
 *
 * Fail closed, absolutely: an error, an unknown policy, a missing context or
 * a malformed request all deny access. `undefined` never means allowed.
 */

/** Short-lived positive decisions; revocation/expiration must not outlive it. */
const DECISION_CACHE_TTL_MS = 60_000

type CacheEntry = {decision: AccessDecision; expiresAt: number}
const decisionCache = new Map<string, CacheEntry>()

function cacheKey(request: AccessRequest, resource: AccessControlledResource) {
  // Per-user by construction — decisions are never shared across users.
  return `${request.userId}:${resource.id}`
}

export function invalidateEntitlementDecisions(resourceId?: string) {
  if (!resourceId) {
    decisionCache.clear()
    return
  }
  for (const key of decisionCache.keys()) {
    if (key.endsWith(`:${resourceId}`)) decisionCache.delete(key)
  }
}

function isGrantActive(grant: Entitlement, now: Date): boolean {
  if (grant.revokedAt) return false
  if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= now.getTime())
    return false
  return true
}

const POLICY_ACCEPTS: Record<string, EntitlementType[]> = {
  free: [],
  follower_only: ['follower', 'subscription', 'tier', 'creator_granted'],
  subscriber_only: ['subscription', 'tier', 'creator_granted'],
  tier_required: ['tier', 'creator_granted'],
  ppv_required: ['ppv', 'purchase', 'creator_granted'],
  purchase_required: ['purchase', 'creator_granted'],
  rental_required: ['rental', 'purchase', 'creator_granted'],
  custom: ['creator_granted', 'administrative'],
}

const POLICY_DENIAL: Record<string, AccessDecision['reason']> = {
  follower_only: 'not_subscribed',
  subscriber_only: 'not_subscribed',
  tier_required: 'wrong_tier',
  ppv_required: 'purchase_required',
  purchase_required: 'purchase_required',
  rental_required: 'rental_expired',
  custom: 'unknown',
}

function evaluate(
  request: AccessRequest,
  resource: AccessControlledResource,
): AccessDecision {
  if (!request.userId) return {allowed: false, reason: 'not_authenticated'}
  if (!request.adultContextActive)
    return {allowed: false, reason: 'adult_context_required'}
  if (!resource?.id || !resource.policy)
    return {allowed: false, reason: 'content_unavailable'}
  if (resource.creatorSuspended)
    return {allowed: false, reason: 'creator_suspended'}

  const now = new Date()
  const activeGrants = listEntitlements(request.userId).filter(
    grant => grant.resourceId === resource.id && isGrantActive(grant, now),
  )

  // Removed content is unreachable without an administrative grant.
  if (resource.removed) {
    const admin = activeGrants.find(g => g.type === 'administrative')
    return admin
      ? {
          allowed: true,
          reason: 'ok',
          entitlementType: admin.type,
          entitlementId: admin.id,
          expiresAt: admin.expiresAt,
        }
      : {allowed: false, reason: 'content_removed'}
  }

  if (resource.policy === 'free') return {allowed: true, reason: 'ok'}

  const accepted = POLICY_ACCEPTS[resource.policy]
  if (!accepted) return {allowed: false, reason: 'unknown'}

  const grant = activeGrants.find(
    g =>
      accepted.includes(g.type) &&
      (resource.policy !== 'tier_required' ||
        !resource.requiredTierId ||
        g.tierId === resource.requiredTierId),
  )
  if (grant) {
    return {
      allowed: true,
      reason: 'ok',
      entitlementType: grant.type,
      entitlementId: grant.id,
      expiresAt: grant.expiresAt,
    }
  }
  return {
    allowed: false,
    reason: POLICY_DENIAL[resource.policy] ?? 'unknown',
  }
}

/**
 * The only entry point UI/services should call. Any internal error is caught
 * and becomes a denial — never an allowance.
 */
export function canAccess(
  request: AccessRequest,
  resource: AccessControlledResource,
): AccessDecision {
  try {
    const key = request.userId ? cacheKey(request, resource) : undefined
    if (key) {
      const cached = decisionCache.get(key)
      if (cached && cached.expiresAt > Date.now()) return cached.decision
      if (cached) decisionCache.delete(key)
    }
    const decision = evaluate(request, resource)
    if (key && decision.allowed) {
      decisionCache.set(key, {
        decision,
        expiresAt: Date.now() + DECISION_CACHE_TTL_MS,
      })
    }
    if (__DEV__ && !decision.allowed) {
      logger.debug('entitlements: access denied', {
        reason: decision.reason,
        resourceType: resource?.type,
      })
    }
    return decision
  } catch (e) {
    logger.error('entitlements: evaluation failed closed', {error: e})
    return ACCESS_DENIED_UNKNOWN
  }
}
