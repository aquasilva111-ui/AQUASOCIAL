/**
 * AQUA Entitlements — contracts.
 *
 * The single system that answers "can this user access this content?" for
 * every adult surface (Feed, Creators, Views, Studios, Live, Library, PPV).
 * UI components never decide access themselves; they consume AccessDecision.
 */

export type EntitlementResourceType =
  | 'post'
  | 'image'
  | 'video'
  | 'audio'
  | 'stream'
  | 'movie'
  | 'episode'
  | 'collection'
  | 'creator_content'
  | 'download'

export type EntitlementType =
  | 'free'
  | 'follower'
  | 'subscription'
  | 'tier'
  | 'purchase'
  | 'ppv'
  | 'rental'
  | 'creator_granted'
  | 'promotional'
  | 'administrative'

export type AccessPolicy =
  | 'free'
  | 'follower_only'
  | 'subscriber_only'
  | 'tier_required'
  | 'ppv_required'
  | 'purchase_required'
  | 'rental_required'
  | 'custom'

export type AccessDenialReason =
  | 'not_authenticated'
  | 'adult_context_required'
  | 'age_access_required'
  | 'not_subscribed'
  | 'wrong_tier'
  | 'purchase_required'
  | 'rental_expired'
  | 'content_unavailable'
  | 'content_removed'
  | 'creator_suspended'
  | 'region_restricted'
  | 'account_restricted'
  | 'unknown'

export type AccessRequest = {
  userId: string | undefined
  resourceId: string
  resourceType: EntitlementResourceType
  /** Whether the caller holds a deliberate, verified adult context. */
  adultContextActive: boolean
}

/**
 * The protected resource as the engine sees it. Note what is NOT here:
 * no prices, no card data, no transaction payloads — content knows its
 * policy, Entitlements knows whether the user satisfies it.
 */
export type AccessControlledResource = {
  id: string
  type: EntitlementResourceType
  creatorId: string
  policy: AccessPolicy
  /** Required tier id when policy is 'tier_required'. */
  requiredTierId?: string
  /** Soft-removed content denies everyone except administrative holders. */
  removed?: boolean
  creatorSuspended?: boolean
}

export type Entitlement = {
  id: string
  userId: string
  resourceId: string
  resourceType: EntitlementResourceType
  type: EntitlementType
  /** Origin of the grant (subscription id, purchase id...). Opaque here. */
  sourceId?: string
  /** Tier covered by this grant, when type is 'subscription'/'tier'. */
  tierId?: string
  grantedAt: string
  expiresAt?: string
  revokedAt?: string
}

export type AccessDecision = {
  allowed: boolean
  reason: AccessDenialReason | 'ok'
  entitlementType?: EntitlementType
  entitlementId?: string
  expiresAt?: string
}

export const ACCESS_DENIED_UNKNOWN: AccessDecision = {
  allowed: false,
  reason: 'unknown',
}
