import {type FastifyRequest} from 'fastify'

import {type Config} from '../config.js'
import {type Queryable} from '../db/index.js'
import {audit} from '../lib/audit.js'
import {forbidden} from '../lib/errors.js'

export type StaffRole =
  | 'SUPPORT'
  | 'MODERATOR'
  | 'SENIOR_MODERATOR'
  | 'TRUST_SAFETY'
  | 'FINANCE'
  | 'ADMIN'
  | 'SUPERADMIN'

export const STAFF_ROLES: StaffRole[] = [
  'SUPPORT',
  'MODERATOR',
  'SENIOR_MODERATOR',
  'TRUST_SAFETY',
  'FINANCE',
  'ADMIN',
  'SUPERADMIN',
]

const MODS: StaffRole[] = [
  'MODERATOR',
  'SENIOR_MODERATOR',
  'TRUST_SAFETY',
  'SUPERADMIN',
]
const SENIOR: StaffRole[] = ['SENIOR_MODERATOR', 'TRUST_SAFETY', 'SUPERADMIN']
const TNS: StaffRole[] = ['TRUST_SAFETY', 'SUPERADMIN']

/**
 * Least privilege per capability — there is no catch-all isAdmin. ADMIN runs
 * the platform (staff, audit, emergencies) but does not decide moderation;
 * FINANCE touches money only; SUPPORT reads the queue.
 */
export const STAFF_PERMISSIONS = {
  viewCases: ['SUPPORT', ...MODS, 'ADMIN'],
  triageCases: MODS,
  assignOthers: SENIOR,
  decide: MODS,
  /** restrict, quarantine, age/region restrict, lift restriction */
  actContent: MODS,
  /** remove, restore */
  actRemove: SENIOR,
  /** suspend, ban, revoke creator privileges */
  actAccount: TNS,
  decideAppeals: SENIOR,
  reviewCreators: ['SENIOR_MODERATOR', 'TRUST_SAFETY', 'SUPERADMIN'],
  handleTakedowns: SENIOR,
  viewReporterIdentity: TNS,
  viewConsentRecords: TNS,
  emergencyRemoval: ['TRUST_SAFETY', 'ADMIN', 'SUPERADMIN'],
  viewAudit: ['TRUST_SAFETY', 'ADMIN', 'SUPERADMIN'],
  finance: ['FINANCE', 'SUPERADMIN'],
  manageStaff: ['ADMIN', 'SUPERADMIN'],
} as const satisfies Record<string, StaffRole[]>

export type StaffPermission = keyof typeof STAFF_PERMISSIONS

/** Roles only a SUPERADMIN may grant. */
export const PRIVILEGED_ROLES: StaffRole[] = ['ADMIN', 'SUPERADMIN']

export async function staffRoles(
  db: Queryable,
  config: Config,
  did: string,
): Promise<StaffRole[]> {
  const rows = await db.query(
    `select role from staff_roles where did = $1 and revoked_at is null`,
    [did],
  )
  const roles = new Set(rows.map(r => r.role as StaffRole))
  if (config.superadminDids.includes(did)) roles.add('SUPERADMIN')
  return [...roles]
}

export function hasPermission(roles: StaffRole[], p: StaffPermission) {
  return roles.some(r =>
    (STAFF_PERMISSIONS[p] as readonly string[]).includes(r),
  )
}

/** Authenticates a staff member holding `permission`; denials are audited. */
export async function requireStaff(
  ctx: {
    db: Queryable
    config: Config
    user: (req: FastifyRequest) => Promise<string>
  },
  req: FastifyRequest,
  permission: StaffPermission,
) {
  const did = await ctx.user(req)
  const roles = await staffRoles(ctx.db, ctx.config, did)
  if (!hasPermission(roles, permission)) {
    await audit(ctx.db, {
      actor: did,
      action: `staff.${permission}`,
      reason: req.url.slice(0, 200),
      result: 'denied',
    })
    throw forbidden('insufficient_staff_role')
  }
  return {did, roles}
}
