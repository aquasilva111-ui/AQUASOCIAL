/**
 * Server-side Entitlements engine — the authority for every +18 access
 * decision. Ported from the app's contract (src/lib/adult/entitlements) and
 * extended with scopes. Fail closed: anything unknown denies.
 */

export type AccessPolicy =
  | 'free'
  | 'follower_only'
  | 'subscriber_only'
  | 'tier_required'
  | 'ppv_required'
  | 'purchase_required'
  | 'rental_required'
  | 'custom'

export type ResourceStatus =
  | 'draft'
  | 'scheduled'
  | 'published'
  | 'unavailable'
  | 'quarantined'
  | 'removed'
  | 'archived'

export type ResourceRef = {type: string; id: string}

export type ProtectedResource = ResourceRef & {
  policy: AccessPolicy
  requiredTierId?: string | null
  status: ResourceStatus
  /** DIDs that always access their own work (creator, studio team). */
  ownerDids: string[]
  creatorSuspended?: boolean
  /** Availability window (studio releases). */
  availableFrom?: Date | null
  availableUntil?: Date | null
  /**
   * Containers whose grants also cover this resource: the creator/studio
   * (subscriptions), series/season (episodes), collections.
   */
  scopes: ResourceRef[]
}

export type Grant = {
  id: string
  resource_type: string
  resource_id: string
  type: string
  tier_id: string | null
  starts_at: Date | string | null
  expires_at: Date | string | null
  revoked_at: Date | string | null
}

export type DenialReason =
  | 'not_authenticated'
  | 'age_verification_required'
  | 'content_unavailable'
  | 'content_removed'
  | 'content_quarantined'
  | 'creator_suspended'
  | 'not_subscribed'
  | 'wrong_tier'
  | 'purchase_required'
  | 'rental_expired'
  | 'unknown'

export type AccessDecision =
  | {
      allowed: true
      reason: 'ok'
      via: 'free' | 'owner' | 'grant'
      entitlementId?: string
      entitlementType?: string
      expiresAt?: string
    }
  | {allowed: false; reason: DenialReason}

/** Which grant types satisfy each policy, and on which refs. */
const POLICY_ACCEPTS: Record<AccessPolicy, string[]> = {
  free: [],
  follower_only: [
    'follower',
    'subscription',
    'creator_granted',
    'administrative',
  ],
  subscriber_only: ['subscription', 'creator_granted', 'administrative'],
  tier_required: ['subscription', 'creator_granted', 'administrative'],
  ppv_required: [
    'ppv',
    'purchase',
    'collection',
    'creator_granted',
    'promotional',
    'administrative',
  ],
  purchase_required: [
    'purchase',
    'collection',
    'creator_granted',
    'promotional',
    'administrative',
  ],
  rental_required: [
    'rental',
    'purchase',
    'collection',
    'creator_granted',
    'promotional',
    'administrative',
  ],
  custom: ['creator_granted', 'administrative'],
}

const POLICY_DENIAL: Record<AccessPolicy, DenialReason> = {
  free: 'unknown',
  follower_only: 'not_subscribed',
  subscriber_only: 'not_subscribed',
  tier_required: 'wrong_tier',
  ppv_required: 'purchase_required',
  purchase_required: 'purchase_required',
  rental_required: 'rental_expired',
  custom: 'unknown',
}

const toTime = (v: Date | string | null) =>
  v === null ? null : new Date(v).getTime()

export function isGrantActive(grant: Grant, now: Date): boolean {
  if (grant.revoked_at) return false
  const t = now.getTime()
  const starts = toTime(grant.starts_at)
  const expires = toTime(grant.expires_at)
  if (starts !== null && starts > t) return false
  if (expires !== null && expires <= t) return false
  return true
}

export function evaluateAccess({
  userDid,
  ageVerified,
  resource,
  grants,
  now = new Date(),
}: {
  userDid: string | undefined
  ageVerified: boolean
  resource: ProtectedResource | undefined
  grants: Grant[]
  now?: Date
}): AccessDecision {
  try {
    if (!userDid) return {allowed: false, reason: 'not_authenticated'}
    if (!ageVerified)
      return {allowed: false, reason: 'age_verification_required'}
    if (!resource || !resource.id || !(resource.policy in POLICY_ACCEPTS))
      return {allowed: false, reason: 'content_unavailable'}

    const isOwner = resource.ownerDids.includes(userDid)
    const active = grants.filter(g => isGrantActive(g, now))
    const covers = (g: Grant) =>
      (g.resource_type === resource.type && g.resource_id === resource.id) ||
      resource.scopes.some(
        s => s.type === g.resource_type && s.id === g.resource_id,
      )
    const admin = active.find(g => g.type === 'administrative' && covers(g))

    if (resource.status === 'removed')
      return admin ? allow(admin) : {allowed: false, reason: 'content_removed'}
    if (resource.status === 'quarantined')
      return admin
        ? allow(admin)
        : {allowed: false, reason: 'content_quarantined'}
    // Owners reach drafts and scheduled work; nobody else does.
    if (resource.status !== 'published')
      return isOwner
        ? {allowed: true, reason: 'ok', via: 'owner'}
        : {allowed: false, reason: 'content_unavailable'}
    if (isOwner) return {allowed: true, reason: 'ok', via: 'owner'}
    if (resource.creatorSuspended)
      return {allowed: false, reason: 'creator_suspended'}
    const t = now.getTime()
    if (
      (resource.availableFrom && resource.availableFrom.getTime() > t) ||
      (resource.availableUntil && resource.availableUntil.getTime() <= t)
    )
      return {allowed: false, reason: 'content_unavailable'}

    if (resource.policy === 'free')
      return {allowed: true, reason: 'ok', via: 'free'}

    const accepted = POLICY_ACCEPTS[resource.policy]
    const grant = active.find(
      g =>
        covers(g) &&
        accepted.includes(g.type) &&
        (resource.policy !== 'tier_required' ||
          g.type !== 'subscription' ||
          !resource.requiredTierId ||
          g.tier_id === resource.requiredTierId),
    )
    if (grant) return allow(grant)
    return {allowed: false, reason: POLICY_DENIAL[resource.policy]}
  } catch {
    return {allowed: false, reason: 'unknown'}
  }
}

function allow(grant: Grant): AccessDecision {
  return {
    allowed: true,
    reason: 'ok',
    via: 'grant',
    entitlementId: grant.id,
    entitlementType: grant.type,
    expiresAt: grant.expires_at
      ? new Date(grant.expires_at).toISOString()
      : undefined,
  }
}
