import {type Queryable} from '../db/index.js'

export async function audit(
  db: Queryable,
  event: {
    actor: string | null
    action: string
    resourceType?: string
    resourceId?: string
    reason?: string
    result: 'ok' | 'denied' | 'error'
  },
) {
  await db.query(
    `insert into audit_events (actor_did, action, resource_type, resource_id, reason, result)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      event.actor,
      event.action,
      event.resourceType ?? null,
      event.resourceId ?? null,
      event.reason ?? null,
      event.result,
    ],
  )
}
