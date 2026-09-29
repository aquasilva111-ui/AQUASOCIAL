import {type Queryable} from '../db/index.js'
import {newId} from '../lib/ids.js'
import {
  type AccessDecision,
  evaluateAccess,
  type Grant,
  type ProtectedResource,
  type ResourceRef,
} from './engine.js'

export * from './engine.js'

export type ResourceResolver = (
  db: Queryable,
  id: string,
) => Promise<ProtectedResource | undefined>

/** Each domain (posts, videos, studio titles) registers how to load its resources. */
const resolvers = new Map<string, ResourceResolver>()

export function registerResourceResolver(
  type: string,
  resolver: ResourceResolver,
) {
  resolvers.set(type, resolver)
}

export async function resolveResource(
  db: Queryable,
  ref: ResourceRef,
): Promise<ProtectedResource | undefined> {
  const resolver = resolvers.get(ref.type)
  return resolver ? resolver(db, ref.id) : undefined
}

export async function isAgeVerified(
  db: Queryable,
  did: string,
  now = new Date(),
) {
  const [row] = await db.query(
    `select age_verified_at, age_verification_expires_at from adult_accounts where did = $1`,
    [did],
  )
  if (!row?.age_verified_at) return false
  return (
    !row.age_verification_expires_at ||
    new Date(row.age_verification_expires_at).getTime() > now.getTime()
  )
}

export async function listGrants(
  db: Queryable,
  userDid: string,
  refs: ResourceRef[],
): Promise<Grant[]> {
  if (!refs.length) return []
  const types = refs.map(r => r.type)
  const ids = refs.map(r => r.id)
  return db.query<Grant>(
    `select e.id, e.resource_type, e.resource_id, e.type, e.tier_id,
            e.starts_at, e.expires_at, e.revoked_at
       from entitlements e
       join unnest($2::text[], $3::text[]) as r(type, id)
         on e.resource_type = r.type and e.resource_id = r.id
      where e.user_did = $1`,
    [userDid, types, ids],
  )
}

/** The single entry point every +18 surface uses to decide access. */
export async function checkAccess(
  db: Queryable,
  userDid: string | undefined,
  ref: ResourceRef,
  now = new Date(),
): Promise<{decision: AccessDecision; resource?: ProtectedResource}> {
  try {
    if (!userDid)
      return {decision: {allowed: false, reason: 'not_authenticated'}}
    const resource = await resolveResource(db, ref)
    const [ageVerified, grants] = await Promise.all([
      isAgeVerified(db, userDid, now),
      resource ? listGrants(db, userDid, [ref, ...resource.scopes]) : [],
    ])
    return {
      decision: evaluateAccess({userDid, ageVerified, resource, grants, now}),
      resource,
    }
  } catch {
    // An outage in any dependency is a denial, never an allow.
    return {decision: {allowed: false, reason: 'unknown'}}
  }
}

export async function grantEntitlement(
  db: Queryable,
  input: {
    userDid: string
    resource: ResourceRef
    type: string
    sourceType?: string
    sourceId?: string
    tierId?: string | null
    startsAt?: Date | null
    expiresAt?: Date | null
  },
): Promise<string> {
  const id = newId('ent')
  await db.query(
    `insert into entitlements
       (id, user_did, resource_type, resource_id, type, source_type, source_id, tier_id, starts_at, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      input.userDid,
      input.resource.type,
      input.resource.id,
      input.type,
      input.sourceType ?? null,
      input.sourceId ?? null,
      input.tierId ?? null,
      input.startsAt ?? null,
      input.expiresAt ?? null,
    ],
  )
  return id
}

/** Revocation keeps the row (history, audits, disputes). */
export async function revokeEntitlementsBySource(
  db: Queryable,
  sourceType: string,
  sourceId: string,
  reason: string,
): Promise<number> {
  const rows = await db.query(
    `update entitlements set revoked_at = now(), revoke_reason = $3
      where source_type = $1 and source_id = $2 and revoked_at is null
      returning id`,
    [sourceType, sourceId, reason],
  )
  return rows.length
}

export async function listUserEntitlements(db: Queryable, userDid: string) {
  return db.query(
    `select id, resource_type, resource_id, type, tier_id, granted_at, starts_at,
            expires_at, revoked_at
       from entitlements where user_did = $1 order by granted_at desc`,
    [userDid],
  )
}
