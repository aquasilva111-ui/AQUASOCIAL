import {type Queryable} from '../db/index.js'
import {
  type ProtectedResource,
  registerResourceResolver,
} from '../entitlements/index.js'

/**
 * Resources registered in adult_resources (posts, image sets). Their access
 * policy lives here, on the server — never on the public AT record.
 */
async function resolveRegistered(
  db: Queryable,
  type: string,
  id: string,
): Promise<ProtectedResource | undefined> {
  const [row] = await db.query(
    `select r.*, c.did as creator_did, c.status as creator_status
       from adult_resources r left join creators c on c.id = r.creator_id
      where r.resource_type = $1 and r.resource_id = $2`,
    [type, id],
  )
  if (!row) return undefined
  return {
    type,
    id,
    policy: row.access_policy,
    requiredTierId: row.required_tier_id,
    status: row.status,
    ownerDids: row.creator_did ? [row.creator_did] : [],
    creatorSuspended: row.creator_status === 'suspended',
    scopes: row.creator_id ? [{type: 'creator', id: row.creator_id}] : [],
  }
}

for (const type of ['post', 'image_set', 'audio']) {
  registerResourceResolver(type, (db, id) => resolveRegistered(db, type, id))
}
