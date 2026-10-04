import {type FastifyRequest} from 'fastify'
import {z} from 'zod'

import {type Queryable} from '../db/index.js'
import {
  assertAdultAccess,
  isAgeVerified,
  resolveResource,
} from '../entitlements/index.js'
import {audit} from '../lib/audit.js'
import {badRequest, conflict, forbidden, notFound} from '../lib/errors.js'
import {newId} from '../lib/ids.js'
import {enforce, SharedRateLimiter} from '../lib/rateLimit.js'
import {registerRoutes} from '../registry.js'
import {installMatching} from './matching.js'
import {
  ACTION_PERMISSION,
  applyModerationAction,
  CONTENT_TYPES,
  fileReport,
  loadCase,
  type ModerationAction,
  OPEN_STATUSES,
  openCase,
  recordDecision,
  resolveReportTarget,
  responsibleDids,
  setCaseStatus,
} from './moderation.js'
import {
  hasPermission,
  PRIVILEGED_ROLES,
  requireStaff,
  STAFF_PERMISSIONS,
  STAFF_ROLES,
  type StaffPermission,
  staffRoles,
} from './staff.js'
import {
  MockVerificationProvider,
  type VerificationProvider,
  type VerificationResult,
  VerificationWebhookError,
} from './verification.js'

const did = z.string().regex(/^did:(plc|web):[a-zA-Z0-9._:%-]{1,200}$/)
const reason = z.string().trim().min(3).max(2000)
const TARGETS = [
  'content',
  'creator',
  'user',
  'message',
  'live',
  'studio',
  'production',
] as const
const ACTIONS = Object.keys(ACTION_PERMISSION) as [
  ModerationAction,
  ...ModerationAction[],
]
const TAKEDOWN_PRIORITY: Record<string, number> = {
  non_consensual: 1,
  illegal: 1,
  privacy: 2,
  copyright: 3,
  ownership: 3,
  other: 4,
}
const AGREEMENT_VERSION = '2026-09-creator-v1'

registerRoutes(ctx => {
  const {app, db, config} = ctx
  installMatching(db)

  const verificationProviders = new Map<string, VerificationProvider>()
  if (config.mockPayments && config.env !== 'production') {
    const mock = new MockVerificationProvider(config)
    verificationProviders.set(mock.name, mock)
  }

  const staff = (req: FastifyRequest, p: StaffPermission) =>
    requireStaff(ctx, req, p)

  // Takedown form can be used without an AQUA account: limit by address.
  const takedownLimiter = new SharedRateLimiter(db, 10, 3600_000)
  const blockLimiter = new SharedRateLimiter(db, 120, 3600_000)

  // ------------------------------------------------------------ reports

  app.get('/reports/reasons', async req => {
    await ctx.user(req)
    const {targetType} = z
      .object({targetType: z.enum(TARGETS).optional()})
      .parse(req.query)
    const rows = await db.query(
      `select code, label, target_types, requires_details from report_reasons
        where active and ($1::text is null or $1 = any(target_types)) order by priority, code`,
      [targetType ?? null],
    )
    return {
      reasons: rows.map(r => ({
        code: r.code,
        label: r.label,
        targetTypes: r.target_types,
        requiresDetails: r.requires_details,
      })),
    }
  })

  app.post('/reports', async req => {
    const reporter = await ctx.user(req)
    const body = z
      .object({
        targetType: z.enum(TARGETS),
        resourceType: z.string().max(40).optional(),
        resourceId: z.string().min(1).max(500),
        reasonCode: z.string().max(40),
        details: z.string().max(1000).optional(),
      })
      .parse(req.body)
    const resource = await resolveReportTarget(
      db,
      body.targetType,
      body.resourceType,
      body.resourceId,
    )
    if (resource.type === 'user' && resource.id === reporter)
      throw badRequest('invalid_target')
    const {reportId} = await fileReport(db, {
      reporterDid: reporter,
      target: body.targetType,
      resource,
      reasonCode: body.reasonCode,
      details: body.details,
    })
    return {reportId}
  })

  /** The reporter's own reports and where they stand — nothing else. */
  app.get('/me/reports', async req => {
    const me = await ctx.user(req)
    const rows = await db.query(
      `select r.id, r.target_type, r.reason_code, r.created_at, c.status
         from reports r join moderation_cases c on c.id = r.case_id
        where r.reporter_did = $1 order by r.created_at desc limit 100`,
      [me],
    )
    return {
      reports: rows.map(r => ({
        id: r.id,
        targetType: r.target_type,
        reasonCode: r.reason_code,
        status: ['RESOLVED', 'DISMISSED'].includes(r.status)
          ? 'closed'
          : 'in_review',
        createdAt: r.created_at,
      })),
    }
  })

  // ------------------------------------------------------------ blocks

  app.get('/me/adult/blocks', async req => {
    const me = await ctx.user(req)
    const rows = await db.query(
      `select blocked_did, created_at from adult_blocks where blocker_did = $1 order by created_at desc`,
      [me],
    )
    return {
      blocks: rows.map(r => ({did: r.blocked_did, createdAt: r.created_at})),
    }
  })

  app.put('/me/adult/blocks/:did', async req => {
    const me = await ctx.user(req)
    await enforce(blockLimiter, me)
    const {did: target} = z.object({did}).parse(req.params)
    if (target === me) throw badRequest('invalid_target')
    const [count] = await db.query(
      `select count(*)::int as n from adult_blocks where blocker_did = $1`,
      [me],
    )
    if (count.n >= 5000) throw conflict('block_limit')
    await db.query(
      `insert into adult_blocks (blocker_did, blocked_did) values ($1, $2) on conflict do nothing`,
      [me, target],
    )
    return {ok: true}
  })

  app.delete('/me/adult/blocks/:did', async req => {
    const me = await ctx.user(req)
    const {did: target} = z.object({did}).parse(req.params)
    await db.query(
      `delete from adult_blocks where blocker_did = $1 and blocked_did = $2`,
      [me, target],
    )
    return {ok: true}
  })

  // ------------------------------------------------------------ takedowns & disputes

  async function createTakedown(
    req: FastifyRequest,
    requester: string | null,
    body: {
      resourceType: string
      resourceId: string
      basis: string
      details: string
      contact?: string
    },
  ) {
    if (
      !CONTENT_TYPES.includes(body.resourceType) &&
      body.resourceType !== 'live'
    )
      throw badRequest('invalid_target')
    if (
      !(await resolveResource(db, {
        type: body.resourceType,
        id: body.resourceId,
      }))
    )
      throw notFound()
    const id = newId('tkd')
    const caseId = await db.transaction(async tx => {
      const c = await openCase(tx, {
        source: body.basis === 'ownership' ? 'dispute' : 'takedown',
        resourceType: body.resourceType,
        resourceId: body.resourceId,
        reasonCode: body.basis,
        priority: TAKEDOWN_PRIORITY[body.basis],
        status:
          TAKEDOWN_PRIORITY[body.basis] === 1 ? 'ACTION_REQUIRED' : 'OPEN',
      })
      await tx.query(
        `insert into takedown_requests (id, requester_did, requester_contact, resource_type, resource_id, basis, details, case_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          requester,
          body.contact ?? null,
          body.resourceType,
          body.resourceId,
          body.basis,
          body.details,
          c,
        ],
      )
      return c
    })
    await audit(db, {
      actor: requester,
      action: 'takedown.request',
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      reason: `${caseId}: ${body.basis}`,
      result: 'ok',
    })
    return {requestId: id, status: 'RECEIVED'}
  }

  const takedownBody = z.object({
    resourceType: z.string().max(40),
    resourceId: z.string().min(1).max(500),
    basis: z.enum([
      'copyright',
      'non_consensual',
      'privacy',
      'illegal',
      'other',
    ]),
    details: z.string().trim().min(10).max(5000),
    contact: z.string().trim().max(320).optional(),
  })

  /** Takedown requests: from AQUA users, or anyone who leaves a contact. */
  app.post('/takedowns', async req => {
    const requester =
      req.headers.authorization || req.headers['x-aqua-dev-did']
        ? await ctx.user(req)
        : null
    await enforce(takedownLimiter, requester ?? `ip:${req.ip}`)
    const body = takedownBody.parse(req.body)
    if (!requester && !body.contact) throw badRequest('contact_required')
    return createTakedown(req, requester, body)
  })

  /** Ownership disputes between parties (content rights). */
  app.post('/disputes', async req => {
    const requester = await ctx.user(req)
    await enforce(takedownLimiter, requester)
    const body = takedownBody.omit({basis: true, contact: true}).parse(req.body)
    return createTakedown(req, requester, {...body, basis: 'ownership'})
  })

  // ------------------------------------------------------------ appeals

  app.post('/appeals', async req => {
    const me = await ctx.user(req)
    const body = z
      .object({
        caseId: z.string().max(100),
        statement: z.string().trim().min(10).max(2000),
      })
      .parse(req.body)
    const c = await loadCase(db, body.caseId)
    // Only the people answering for the item may appeal; others learn nothing.
    if (
      !(await responsibleDids(db, c.resource_type, c.resource_id)).includes(me)
    )
      throw notFound()
    const [decision] = await db.query(
      `select * from moderation_decisions where case_id = $1 and appeal_id is null
        order by created_at desc limit 1`,
      [c.id],
    )
    if (
      !decision ||
      !['violation', 'partial_violation'].includes(decision.decision)
    )
      throw conflict('not_appealable')
    const [existing] = await db.query(
      `select 1 from appeals where decision_id = $1 and appellant_did = $2`,
      [decision.id, me],
    )
    if (existing) throw conflict('already_appealed')
    const id = newId('apl')
    await db.transaction(async tx => {
      const appealCase = await openCase(tx, {
        source: 'appeal',
        resourceType: c.resource_type,
        resourceId: c.resource_id,
        reasonCode: c.reason_code,
        priority: c.priority,
        parentCaseId: c.id,
      })
      await tx.query(
        `insert into appeals (id, case_id, decision_id, appellant_did, statement, appeal_case_id)
         values ($1, $2, $3, $4, $5, $6)`,
        [id, c.id, decision.id, me, body.statement, appealCase],
      )
      await tx.query(
        `update takedown_requests set status = 'APPEALED', updated_at = now() where case_id = $1`,
        [c.id],
      )
    })
    await audit(db, {
      actor: me,
      action: 'appeal.create',
      resourceType: 'case',
      resourceId: c.id,
      result: 'ok',
    })
    return {appealId: id, status: 'OPEN'}
  })

  app.get('/me/appeals', async req => {
    const me = await ctx.user(req)
    const rows = await db.query(
      `select id, case_id, status, created_at, decided_at from appeals where appellant_did = $1
        order by created_at desc`,
      [me],
    )
    return {
      appeals: rows.map(r => ({
        id: r.id,
        caseId: r.case_id,
        status: r.status,
        createdAt: r.created_at,
        decidedAt: r.decided_at,
      })),
    }
  })

  /** Cases about the caller's own content/account, with decisions. */
  app.get('/me/moderation', async req => {
    const me = await ctx.user(req)
    const cases = await db.query(
      `select c.id, c.resource_type, c.resource_id, c.status, c.reason_code, c.created_at,
              (select d.decision from moderation_decisions d where d.case_id = c.id and d.appeal_id is null
                order by d.created_at desc limit 1) as decision
         from moderation_cases c
        where c.source <> 'appeal' and exists (select 1 from moderation_decisions d where d.case_id = c.id)
        order by c.created_at desc limit 200`,
    )
    const mine = []
    for (const c of cases)
      if (
        (await responsibleDids(db, c.resource_type, c.resource_id)).includes(me)
      )
        mine.push({
          caseId: c.id,
          resourceType: c.resource_type,
          resourceId: c.resource_id,
          status: c.status,
          reasonCode: c.reason_code,
          decision: c.decision,
          appealable: ['violation', 'partial_violation'].includes(c.decision),
          createdAt: c.created_at,
        })
    return {cases: mine}
  })

  // ------------------------------------------------------------ creator verification

  async function advanceApplication(tx: Queryable, applicantDid: string) {
    const [a] = await tx.query(
      `select * from creator_applications where did = $1 and status in ('IDENTITY_PENDING', 'AGE_PENDING')`,
      [applicantDid],
    )
    if (!a) return
    const next = !a.identity_verified_at
      ? 'IDENTITY_PENDING'
      : (await isAgeVerified(tx, applicantDid))
        ? 'AGREEMENT_PENDING'
        : 'AGE_PENDING'
    await tx.query(
      `update creator_applications set status = $2, updated_at = now() where id = $1`,
      [a.id, next],
    )
  }

  const publicApplication = (a: any) => ({
    id: a.id,
    status: a.status,
    identityVerified: !!a.identity_verified_at,
    agreementVersion: a.agreement_version,
    agreementRequired: AGREEMENT_VERSION,
    decisionReason: a.status === 'REJECTED' ? a.decision_reason : null,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  })

  app.post('/creator/applications', async req => {
    const me = await ctx.user(req)
    const body = z
      .object({handle: z.string().max(253).optional()})
      .parse(req.body ?? {})
    const [creator] = await db.query(
      `select status from creators where did = $1`,
      [me],
    )
    if (creator?.status === 'approved') throw conflict('already_creator')
    if (creator?.status === 'suspended') throw forbidden('creator_suspended')
    const id = newId('capp')
    try {
      await db.query(
        `insert into creator_applications (id, did, handle) values ($1, $2, $3)`,
        [id, me, body.handle ?? null],
      )
    } catch {
      throw conflict('application_open')
    }
    await audit(db, {
      actor: me,
      action: 'creator.apply',
      resourceType: 'creator_application',
      resourceId: id,
      result: 'ok',
    })
    const [a] = await db.query(
      `select * from creator_applications where id = $1`,
      [id],
    )
    return publicApplication(a)
  })

  app.get('/creator/applications/me', async req => {
    const me = await ctx.user(req)
    const rows = await db.query(
      `select * from creator_applications where did = $1 order by created_at desc limit 10`,
      [me],
    )
    return {applications: rows.map(publicApplication)}
  })

  app.post('/creator/applications/:id/agreement', async req => {
    const me = await ctx.user(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const {version} = z.object({version: z.string().max(40)}).parse(req.body)
    if (version !== AGREEMENT_VERSION) throw badRequest('agreement_outdated')
    const rows = await db.transaction(async tx => {
      const r = await tx.query(
        `update creator_applications set agreement_version = $3, agreement_accepted_at = now(),
           status = 'IN_REVIEW', updated_at = now()
          where id = $1 and did = $2 and status = 'AGREEMENT_PENDING' returning id`,
        [id, me, version],
      )
      if (r.length)
        await openCase(tx, {
          source: 'creator_review',
          resourceType: 'creator_application',
          resourceId: id,
          priority: 3,
        })
      return r
    })
    if (!rows.length) throw conflict('not_ready_for_agreement')
    return {status: 'IN_REVIEW'}
  })

  app.post('/creator/applications/:id/withdraw', async req => {
    const me = await ctx.user(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const rows = await db.query(
      `update creator_applications set status = 'WITHDRAWN', updated_at = now()
        where id = $1 and did = $2 and status not in ('APPROVED', 'REJECTED', 'WITHDRAWN') returning id`,
      [id, me],
    )
    if (!rows.length) throw notFound()
    return {ok: true}
  })

  // ------------------------------------------------------------ verification webhooks

  async function applyVerification(
    providerName: string,
    r: VerificationResult,
  ) {
    return db.transaction(async tx => {
      const fresh = await tx.query(
        `insert into verification_events (provider, event_id, kind) values ($1, $2, $3)
         on conflict do nothing returning 1`,
        [providerName, r.eventId, r.kind],
      )
      if (!fresh.length) return 'duplicate'
      await audit(tx, {
        actor: null,
        action: `verification.${r.kind}`,
        resourceType: 'did',
        resourceId: r.did,
        reason: `${providerName}:${r.reference}`.slice(0, 500),
        result: r.verified ? 'ok' : 'denied',
      })
      if (!r.verified) return 'recorded'
      if (r.kind === 'age') {
        // Only the result: outcome, provider reference, when, until when.
        await tx.query(
          `insert into adult_accounts (did, age_verified_at, age_verification_ref, age_verification_expires_at)
           values ($1, $2, $3, $4)
           on conflict (did) do update set age_verified_at = excluded.age_verified_at,
             age_verification_ref = excluded.age_verification_ref,
             age_verification_expires_at = excluded.age_verification_expires_at`,
          [r.did, r.verifiedAt, r.reference, r.expiresAt ?? null],
        )
      } else {
        await tx.query(
          `update creator_applications set identity_verified_at = $2, identity_verification_ref = $3, updated_at = now()
            where did = $1 and status in ('IDENTITY_PENDING', 'AGE_PENDING')`,
          [r.did, r.verifiedAt, r.reference],
        )
      }
      await advanceApplication(tx, r.did)
      return 'applied'
    })
  }

  app.post('/webhooks/verification/:provider', async (req, reply) => {
    const {provider: name} = z.object({provider: z.string()}).parse(req.params)
    const provider = verificationProviders.get(name)
    if (!provider) throw notFound()
    let result: VerificationResult
    try {
      result = provider.verifyWebhook(req.rawBody ?? '', req.headers)
    } catch (e) {
      if (e instanceof VerificationWebhookError) {
        await audit(db, {
          actor: null,
          action: 'verification.webhook_rejected',
          resourceType: 'provider',
          resourceId: name,
          result: 'denied',
        })
        return reply.status(400).send({error: 'invalid_signature'})
      }
      throw e
    }
    return {result: await applyVerification(name, result)}
  })

  /** Dev stand-in for the verification provider finishing a check. */
  app.post('/dev/verification/complete', async req => {
    ctx.devOnly()
    const me = await ctx.user(req)
    const body = z
      .object({
        kind: z.enum(['age', 'identity']),
        verified: z.boolean().default(true),
      })
      .parse(req.body)
    const mock = verificationProviders.get('mock-verification') as
      | MockVerificationProvider
      | undefined
    if (!mock) throw notFound()
    const signed = mock.signResult({
      kind: body.kind,
      did: me,
      verified: body.verified,
      reference: `dev-${body.kind}`,
      expiresAt:
        body.kind === 'age'
          ? new Date(Date.now() + 365 * 24 * 3600_000).toISOString()
          : undefined,
    })
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/verification/mock-verification',
      headers: {...signed.headers, 'content-type': 'application/json'},
      payload: signed.rawBody,
    })
    return res.json()
  })

  // ------------------------------------------------------------ consent / rights (private)

  app.post('/consent-records', async req => {
    const me = await ctx.user(req)
    await assertAdultAccess(db, me)
    const body = z
      .object({
        resourceType: z.string().max(40),
        resourceId: z.string().min(1).max(500),
        kind: z.enum([
          'performer_consent',
          'content_rights',
          'production_authorization',
        ]),
        subjectRef: z.string().trim().min(1).max(200),
        documentRef: z.string().trim().max(500).optional(),
      })
      .parse(req.body)
    if (
      !CONTENT_TYPES.includes(body.resourceType) &&
      body.resourceType !== 'live'
    )
      throw badRequest('invalid_target')
    const resource = await resolveResource(db, {
      type: body.resourceType,
      id: body.resourceId,
    })
    if (!resource || !resource.ownerDids.includes(me)) throw notFound()
    if (body.documentRef && /^https?:\/\//i.test(body.documentRef))
      throw badRequest('document_ref_must_be_private')
    const id = newId('cns')
    await db.query(
      `insert into consent_records (id, resource_type, resource_id, kind, subject_ref, document_ref, submitted_by)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        body.resourceType,
        body.resourceId,
        body.kind,
        body.subjectRef,
        body.documentRef ?? null,
        me,
      ],
    )
    await audit(db, {
      actor: me,
      action: 'consent.record',
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      result: 'ok',
    })
    return {recordId: id}
  })

  /** Owners see that records exist and their status — never the references. */
  app.get('/consent-records', async req => {
    const me = await ctx.user(req)
    const q = z
      .object({
        resourceType: z.string().max(40),
        resourceId: z.string().max(500),
      })
      .parse(req.query)
    const resource = await resolveResource(db, {
      type: q.resourceType,
      id: q.resourceId,
    })
    const roles = await staffRoles(db, config, me)
    const tns = hasPermission(roles, 'viewConsentRecords')
    if (!tns && (!resource || !resource.ownerDids.includes(me)))
      throw notFound()
    const rows = await db.query(
      `select * from consent_records where resource_type = $1 and resource_id = $2 order by created_at`,
      [q.resourceType, q.resourceId],
    )
    return {
      records: rows.map(r => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        createdAt: r.created_at,
        revokedAt: r.revoked_at,
        ...(tns
          ? {
              subjectRef: r.subject_ref,
              documentRef: r.document_ref,
              submittedBy: r.submitted_by,
            }
          : {}),
      })),
    }
  })

  /**
   * Revoking consent restricts the item at once (pending review) and opens a
   * priority-1 case. Submitter or Trust & Safety only.
   */
  app.post('/consent-records/:id/revoke', async req => {
    const me = await ctx.user(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const body = z.object({reason}).parse(req.body)
    const [r] = await db.query(`select * from consent_records where id = $1`, [
      id,
    ])
    const roles = await staffRoles(db, config, me)
    if (
      !r ||
      (r.submitted_by !== me && !hasPermission(roles, 'viewConsentRecords'))
    )
      throw notFound()
    if (r.status === 'REVOKED') throw conflict('already_revoked')
    const caseId = await db.transaction(async tx => {
      await tx.query(
        `update consent_records set status = 'REVOKED', revoked_at = now() where id = $1`,
        [id],
      )
      const c = await openCase(tx, {
        source: 'consent',
        resourceType: r.resource_type,
        resourceId: r.resource_id,
        reasonCode: 'non_consensual',
        priority: 1,
        status: 'ACTION_REQUIRED',
      })
      await applyModerationAction(tx, {
        caseId: c,
        action: 'restrict',
        resourceType: r.resource_type,
        resourceId: r.resource_id,
        actor: me,
        reason: `consent revoked: ${body.reason}`,
      })
      return c
    })
    return {ok: true, caseId}
  })

  // ------------------------------------------------------------ staff: identity

  app.get('/admin/me', async req => {
    const me = await ctx.user(req)
    const roles = await staffRoles(db, config, me)
    if (!roles.length) throw notFound()
    return {
      roles,
      permissions: (Object.keys(STAFF_PERMISSIONS) as StaffPermission[]).filter(
        p => hasPermission(roles, p),
      ),
    }
  })

  // ------------------------------------------------------------ staff: cases

  app.get('/admin/cases', async req => {
    await staff(req, 'viewCases')
    const q = z
      .object({
        status: z
          .enum([
            'OPEN',
            'REVIEWING',
            'ACTION_REQUIRED',
            'RESOLVED',
            'DISMISSED',
            'ESCALATED',
          ])
          .optional(),
        source: z.string().max(40).optional(),
        open: z.enum(['1', '0']).optional(),
      })
      .parse(req.query)
    const rows = await db.query(
      `select * from moderation_cases
        where ($1::text is null or status = $1) and ($2::text is null or source = $2)
          and ($3::boolean is null or (status = any($4)) = $3)
        order by priority, created_at limit 200`,
      [
        q.status ?? null,
        q.source ?? null,
        q.open ? q.open === '1' : null,
        OPEN_STATUSES,
      ],
    )
    return {cases: rows.map(publicCase)}
  })

  const publicCase = (c: any) => ({
    id: c.id,
    source: c.source,
    resourceType: c.resource_type,
    resourceId: c.resource_id,
    reasonCode: c.reason_code,
    status: c.status,
    priority: c.priority,
    assignedTo: c.assigned_to,
    parentCaseId: c.parent_case_id,
    reportCount: c.report_count,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    resolvedAt: c.resolved_at,
  })

  app.get('/admin/cases/:id', async req => {
    const {roles} = await staff(req, 'viewCases')
    const {id} = z.object({id: z.string()}).parse(req.params)
    const c = await loadCase(db, id)
    const showReporter = hasPermission(roles, 'viewReporterIdentity')
    const tns = hasPermission(roles, 'viewConsentRecords')
    const [
      reports,
      actions,
      decisions,
      appeals,
      takedown,
      restrictions,
      consents,
    ] = await Promise.all([
      db.query(`select * from reports where case_id = $1 order by created_at`, [
        id,
      ]),
      db.query(
        `select * from moderation_actions where case_id = $1 order by created_at`,
        [id],
      ),
      db.query(
        `select * from moderation_decisions where case_id = $1 order by created_at`,
        [id],
      ),
      db.query(
        `select * from appeals where case_id = $1 or appeal_case_id = $1 order by created_at`,
        [id],
      ),
      db.query(`select * from takedown_requests where case_id = $1`, [id]),
      db.query(
        `select * from moderation_restrictions where resource_type = $1 and resource_id = $2 order by created_at`,
        [c.resource_type, c.resource_id],
      ),
      tns
        ? db.query(
            `select id, kind, status, created_at, revoked_at from consent_records
                where resource_type = $1 and resource_id = $2`,
            [c.resource_type, c.resource_id],
          )
        : Promise.resolve(null),
    ])
    return {
      case: publicCase(c),
      reports: reports.map(r => ({
        id: r.id,
        reasonCode: r.reason_code,
        details: r.details,
        createdAt: r.created_at,
        ...(showReporter ? {reporterDid: r.reporter_did} : {}),
      })),
      actions: actions.map(a => ({
        id: a.id,
        action: a.action,
        resourceType: a.resource_type,
        resourceId: a.resource_id,
        actorDid: a.actor_did,
        reason: a.reason,
        params: a.params,
        reversesActionId: a.reverses_action_id,
        createdAt: a.created_at,
      })),
      decisions: decisions.map(d => ({
        id: d.id,
        decision: d.decision,
        actorDid: d.actor_did,
        reason: d.reason,
        appealId: d.appeal_id,
        createdAt: d.created_at,
      })),
      appeals: appeals.map(a => ({
        id: a.id,
        caseId: a.case_id,
        appealCaseId: a.appeal_case_id,
        statement: a.statement,
        status: a.status,
        createdAt: a.created_at,
      })),
      takedown: takedown[0]
        ? {
            id: takedown[0].id,
            basis: takedown[0].basis,
            details: takedown[0].details,
            status: takedown[0].status,
            ...(tns
              ? {
                  contact: takedown[0].requester_contact,
                  requesterDid: takedown[0].requester_did,
                }
              : {}),
          }
        : null,
      restrictions: restrictions.map(r => ({
        id: r.id,
        kind: r.kind,
        regions: r.regions,
        active: r.active,
        createdAt: r.created_at,
      })),
      consentRecords: consents,
    }
  })

  app.post('/admin/cases/:id/assign', async req => {
    const {did: me, roles} = await staff(req, 'triageCases')
    const {id} = z.object({id: z.string()}).parse(req.params)
    const {to} = z.object({to: did.optional()}).parse(req.body ?? {})
    const assignee = to ?? me
    if (assignee !== me && !hasPermission(roles, 'assignOthers'))
      throw forbidden('insufficient_staff_role')
    if (assignee !== me) {
      const theirs = await staffRoles(db, config, assignee)
      if (!hasPermission(theirs, 'triageCases'))
        throw badRequest('assignee_not_moderator')
    }
    const c = await loadCase(db, id)
    await db.query(
      `update moderation_cases set assigned_to = $2, updated_at = now(),
         status = case when status = 'OPEN' then 'REVIEWING' else status end where id = $1`,
      [c.id, assignee],
    )
    await audit(db, {
      actor: me,
      action: 'case.assign',
      resourceType: 'case',
      resourceId: id,
      reason: assignee,
      result: 'ok',
    })
    return {ok: true}
  })

  app.post('/admin/cases/:id/status', async req => {
    const {did: me} = await staff(req, 'triageCases')
    const {id} = z.object({id: z.string()}).parse(req.params)
    const {status} = z
      .object({status: z.enum(['REVIEWING', 'ACTION_REQUIRED', 'ESCALATED'])})
      .parse(req.body)
    const c = await loadCase(db, id)
    if (!OPEN_STATUSES.includes(c.status)) throw conflict('case_closed')
    await setCaseStatus(db, id, status)
    await audit(db, {
      actor: me,
      action: 'case.status',
      resourceType: 'case',
      resourceId: id,
      reason: status,
      result: 'ok',
    })
    return {ok: true}
  })

  app.post('/admin/cases/:id/actions', async req => {
    const me = await ctx.user(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const body = z
      .object({
        action: z.enum(ACTIONS),
        reason,
        resourceType: z.string().max(40).optional(),
        resourceId: z.string().max(500).optional(),
        params: z
          .object({
            regions: z
              .array(z.string().regex(/^[A-Z]{2}$/))
              .max(250)
              .optional(),
            restrictionId: z.string().max(100).optional(),
          })
          .optional(),
      })
      .parse(req.body)
    // Capability per action: a moderator can quarantine, not ban.
    await staff(req, ACTION_PERMISSION[body.action])
    const c = await loadCase(db, id)
    if (!OPEN_STATUSES.includes(c.status) && body.action !== 'restore')
      throw conflict('case_closed')
    const actionId = await db.transaction(async tx => {
      const aid = await applyModerationAction(tx, {
        caseId: c.id,
        action: body.action,
        resourceType: body.resourceType ?? c.resource_type,
        resourceId: body.resourceId ?? c.resource_id,
        actor: me,
        reason: body.reason,
        params: body.params,
      })
      if (c.status === 'OPEN') await setCaseStatus(tx, c.id, 'REVIEWING')
      return aid
    })
    return {actionId}
  })

  app.post('/admin/cases/:id/decision', async req => {
    const {did: me} = await staff(req, 'decide')
    const {id} = z.object({id: z.string()}).parse(req.params)
    const body = z
      .object({
        decision: z.enum(['no_violation', 'violation', 'partial_violation']),
        reason,
      })
      .parse(req.body)
    const c = await loadCase(db, id)
    if (c.source === 'appeal') throw badRequest('use_appeal_decision')
    if (!OPEN_STATUSES.includes(c.status)) throw conflict('case_closed')
    const decisionId = await db.transaction(async tx => {
      const d = await recordDecision(tx, {
        caseId: id,
        decision: body.decision,
        actor: me,
        reason: body.reason,
      })
      await setCaseStatus(
        tx,
        id,
        body.decision === 'no_violation' ? 'DISMISSED' : 'RESOLVED',
      )
      return d
    })
    return {decisionId}
  })

  // ------------------------------------------------------------ staff: appeals

  app.get('/admin/appeals', async req => {
    await staff(req, 'decideAppeals')
    const rows = await db.query(
      `select * from appeals where status = 'OPEN' order by created_at limit 200`,
    )
    return {
      appeals: rows.map(a => ({
        id: a.id,
        caseId: a.case_id,
        appealCaseId: a.appeal_case_id,
        statement: a.statement,
        status: a.status,
        createdAt: a.created_at,
      })),
    }
  })

  /**
   * A new decision on the appeal case; the original decision stays as it
   * was. Overturning reverses the original case's actions (as new actions).
   */
  app.post('/admin/appeals/:id/decision', async req => {
    const {did: me} = await staff(req, 'decideAppeals')
    const {id} = z.object({id: z.string()}).parse(req.params)
    const body = z
      .object({outcome: z.enum(['upheld', 'overturned']), reason})
      .parse(req.body)
    const [appeal] = await db.query(`select * from appeals where id = $1`, [id])
    if (!appeal) throw notFound()
    if (appeal.status !== 'OPEN') throw conflict('appeal_decided')
    const [original] = await db.query(
      `select actor_did from moderation_decisions where id = $1`,
      [appeal.decision_id],
    )
    // A second pair of eyes: the original decider can't judge the appeal.
    if (original?.actor_did === me) throw forbidden('reviewer_conflict')
    await db.transaction(async tx => {
      await recordDecision(tx, {
        caseId: appeal.appeal_case_id,
        decision:
          body.outcome === 'upheld' ? 'appeal_upheld' : 'appeal_overturned',
        actor: me,
        reason: body.reason,
        appealId: id,
      })
      if (body.outcome === 'overturned') {
        const actions = await tx.query(
          `select a.* from moderation_actions a
            where a.case_id = $1 and a.action <> 'restore' and a.action <> 'lift_restriction'
              and not exists (select 1 from moderation_actions r where r.reverses_action_id = a.id)
            order by a.created_at desc, a.id desc`,
          [appeal.case_id],
        )
        for (const a of actions)
          await applyModerationAction(tx, {
            caseId: appeal.appeal_case_id,
            action: 'restore',
            resourceType: a.resource_type,
            resourceId: a.resource_id,
            actor: me,
            reason: `appeal ${id} overturned`,
            params: {actionId: a.id},
          })
      }
      await tx.query(
        `update appeals set status = $2, decided_at = now() where id = $1`,
        [id, body.outcome === 'upheld' ? 'UPHELD' : 'OVERTURNED'],
      )
      await setCaseStatus(tx, appeal.appeal_case_id, 'RESOLVED')
    })
    return {ok: true}
  })

  // ------------------------------------------------------------ staff: creator review

  app.get('/admin/creator-applications', async req => {
    await staff(req, 'reviewCreators')
    const rows = await db.query(
      `select * from creator_applications where status = 'IN_REVIEW' order by updated_at limit 200`,
    )
    return {
      applications: rows.map(a => ({
        ...publicApplication(a),
        did: a.did,
        handle: a.handle,
        identityReference: a.identity_verification_ref,
      })),
    }
  })

  app.post('/admin/creator-applications/:id/decision', async req => {
    const {did: me} = await staff(req, 'reviewCreators')
    const {id} = z.object({id: z.string()}).parse(req.params)
    const body = z
      .object({decision: z.enum(['approve', 'reject']), reason})
      .parse(req.body)
    await db.transaction(async tx => {
      const [a] = await tx.query(
        `select * from creator_applications where id = $1 for update`,
        [id],
      )
      if (!a) throw notFound()
      if (a.status !== 'IN_REVIEW') throw conflict('not_in_review')
      // Server re-checks every step; nothing here trusts the client.
      if (
        !a.identity_verified_at ||
        !a.agreement_accepted_at ||
        !(await isAgeVerified(tx, a.did))
      )
        throw conflict('verification_incomplete')
      await tx.query(
        `update creator_applications set status = $2, reviewed_by = $3, reviewed_at = now(),
           decision_reason = $4, updated_at = now() where id = $1`,
        [
          id,
          body.decision === 'approve' ? 'APPROVED' : 'REJECTED',
          me,
          body.reason,
        ],
      )
      if (body.decision === 'approve')
        await tx.query(
          `insert into creators (id, did, handle, status) values ($1, $2, $3, 'approved')
           on conflict (did) do update set status = 'approved', handle = coalesce(excluded.handle, creators.handle)`,
          [newId('cr'), a.did, a.handle],
        )
      const [reviewCase] = await tx.query(
        `select id from moderation_cases where source = 'creator_review' and resource_id = $1`,
        [id],
      )
      if (reviewCase) {
        await recordDecision(tx, {
          caseId: reviewCase.id,
          decision: body.decision === 'approve' ? 'no_violation' : 'violation',
          actor: me,
          reason: body.reason,
        })
        await setCaseStatus(tx, reviewCase.id, 'RESOLVED')
      }
      await audit(tx, {
        actor: me,
        action: `creator.review.${body.decision}`,
        resourceType: 'creator_application',
        resourceId: id,
        reason: body.reason,
        result: 'ok',
      })
    })
    return {ok: true}
  })

  // ------------------------------------------------------------ staff: takedowns

  app.get('/admin/takedowns', async req => {
    const {roles} = await staff(req, 'handleTakedowns')
    const rows = await db.query(
      `select * from takedown_requests where status not in ('ACTIONED', 'REJECTED') order by created_at limit 200`,
    )
    const tns = hasPermission(roles, 'viewConsentRecords')
    return {
      takedowns: rows.map(t => ({
        id: t.id,
        caseId: t.case_id,
        resourceType: t.resource_type,
        resourceId: t.resource_id,
        basis: t.basis,
        details: t.details,
        status: t.status,
        createdAt: t.created_at,
        ...(tns
          ? {contact: t.requester_contact, requesterDid: t.requester_did}
          : {}),
      })),
    }
  })

  const loadTakedown = async (id: string) => {
    const [t] = await db.query(
      `select * from takedown_requests where id = $1`,
      [id],
    )
    if (!t) throw notFound()
    return t
  }

  /** Temporary restriction while the request is reviewed. */
  app.post('/admin/takedowns/:id/restrict', async req => {
    const {did: me} = await staff(req, 'handleTakedowns')
    const {id} = z.object({id: z.string()}).parse(req.params)
    const body = z.object({reason}).parse(req.body)
    const t = await loadTakedown(id)
    if (!['RECEIVED', 'IN_REVIEW'].includes(t.status))
      throw conflict('invalid_state')
    await db.transaction(async tx => {
      await applyModerationAction(tx, {
        caseId: t.case_id,
        action: 'restrict',
        resourceType: t.resource_type,
        resourceId: t.resource_id,
        actor: me,
        reason: body.reason,
      })
      await tx.query(
        `update takedown_requests set status = 'RESTRICTED', updated_at = now() where id = $1`,
        [id],
      )
      await setCaseStatus(tx, t.case_id, 'ACTION_REQUIRED')
    })
    return {status: 'RESTRICTED'}
  })

  app.post('/admin/takedowns/:id/decision', async req => {
    const {did: me} = await staff(req, 'handleTakedowns')
    const {id} = z.object({id: z.string()}).parse(req.params)
    const body = z
      .object({decision: z.enum(['accept', 'reject']), reason})
      .parse(req.body)
    const t = await loadTakedown(id)
    if (!['RECEIVED', 'IN_REVIEW', 'RESTRICTED'].includes(t.status))
      throw conflict('invalid_state')
    await db.transaction(async tx => {
      if (body.decision === 'accept') {
        await applyModerationAction(tx, {
          caseId: t.case_id,
          action: 'remove',
          resourceType: t.resource_type,
          resourceId: t.resource_id,
          actor: me,
          reason: body.reason,
        })
      } else {
        const [active] = await tx.query(
          `select 1 from moderation_restrictions where case_id = $1 and active`,
          [t.case_id],
        )
        if (active)
          await tx.query(
            `update moderation_restrictions set active = false, lifted_at = now() where case_id = $1 and active`,
            [t.case_id],
          )
      }
      await recordDecision(tx, {
        caseId: t.case_id,
        decision: body.decision === 'accept' ? 'violation' : 'no_violation',
        actor: me,
        reason: body.reason,
      })
      await tx.query(
        `update takedown_requests set status = $2, updated_at = now() where id = $1`,
        [id, body.decision === 'accept' ? 'ACTIONED' : 'REJECTED'],
      )
      await setCaseStatus(
        tx,
        t.case_id,
        body.decision === 'accept' ? 'RESOLVED' : 'DISMISSED',
      )
    })
    return {status: body.decision === 'accept' ? 'ACTIONED' : 'REJECTED'}
  })

  // ------------------------------------------------------------ staff: emergency removal

  /**
   * Stops distribution immediately: removes the item, pulls its media (old
   * signed URLs die), ends a live broadcast and opens a priority-1 case.
   * Strongly restricted and always audited.
   */
  app.post('/admin/emergency-removal', async req => {
    const {did: me} = await staff(req, 'emergencyRemoval')
    const body = z
      .object({
        resourceType: z.string().max(40),
        resourceId: z.string().min(1).max(500),
        reason: z.string().trim().min(10).max(2000),
      })
      .parse(req.body)
    const result = await db.transaction(async tx => {
      const caseId = await openCase(tx, {
        source: 'emergency',
        resourceType: body.resourceType,
        resourceId: body.resourceId,
        priority: 1,
        status: 'ACTION_REQUIRED',
      })
      const actionId = await applyModerationAction(tx, {
        caseId,
        action: 'remove',
        resourceType: body.resourceType,
        resourceId: body.resourceId,
        actor: me,
        reason: `EMERGENCY: ${body.reason}`,
      })
      await audit(tx, {
        actor: me,
        action: 'emergency.removal',
        resourceType: body.resourceType,
        resourceId: body.resourceId,
        reason: `${caseId}: ${body.reason}`.slice(0, 1000),
        result: 'ok',
      })
      return {caseId, actionId}
    })
    return result
  })

  // ------------------------------------------------------------ staff: audit

  app.get('/admin/audit', async req => {
    await staff(req, 'viewAudit')
    const q = z
      .object({
        action: z.string().max(100).optional(),
        actor: z.string().max(300).optional(),
        resourceType: z.string().max(40).optional(),
        resourceId: z.string().max(500).optional(),
        before: z.coerce.number().int().positive().optional(),
      })
      .parse(req.query)
    const rows = await db.query(
      `select * from audit_events
        where ($1::text is null or action like $1 || '%')
          and ($2::text is null or actor_did = $2)
          and ($3::text is null or resource_type = $3)
          and ($4::text is null or resource_id = $4)
          and ($5::bigint is null or id < $5)
        order by id desc limit 200`,
      [
        q.action ?? null,
        q.actor ?? null,
        q.resourceType ?? null,
        q.resourceId ?? null,
        q.before ?? null,
      ],
    )
    return {
      events: rows.map(e => ({
        id: String(e.id),
        actor: e.actor_did,
        action: e.action,
        resourceType: e.resource_type,
        resourceId: e.resource_id,
        reason: e.reason,
        result: e.result,
        createdAt: e.created_at,
      })),
    }
  })

  // ------------------------------------------------------------ staff: operations health

  /**
   * Media processing, payments, verification and moderation queue health.
   * Counts only — no content, titles or user identifiers.
   */
  app.get('/admin/health', async req => {
    await staff(req, 'viewAudit')
    const [mediaRows, stuck, payments, verifications, cases, live] =
      await Promise.all([
        db.query(
          `select status, count(*)::int as n from media_assets group by status`,
        ),
        db.query(
          `select count(*)::int as n from media_assets
            where status in ('QUEUED', 'PROCESSING') and updated_at < now() - interval '30 minutes'`,
        ),
        db.query(
          `select count(*)::int as n, max(received_at) as last from payment_events
            where received_at > now() - interval '24 hours'`,
        ),
        db.query(
          `select count(*)::int as n from verification_events where received_at > now() - interval '24 hours'`,
        ),
        db.query(
          `select priority, count(*)::int as n from moderation_cases
            where status = any($1) group by priority`,
          [OPEN_STATUSES],
        ),
        db.query(
          `select count(*)::int as n from live_streams where status in ('LIVE', 'INTERRUPTED')`,
        ),
      ])
    return {
      media: {
        byStatus: Object.fromEntries(mediaRows.map(r => [r.status, r.n])),
        stuckOver30Min: stuck[0].n,
      },
      payments: {eventsLast24h: payments[0].n, lastEventAt: payments[0].last},
      verification: {eventsLast24h: verifications[0].n},
      moderation: {
        openByPriority: Object.fromEntries(
          cases.map(r => [`P${r.priority}`, r.n]),
        ),
      },
      live: {broadcasting: live[0].n},
      database: 'ok',
    }
  })

  // ------------------------------------------------------------ staff: roles

  app.get('/admin/staff', async req => {
    await staff(req, 'manageStaff')
    const rows = await db.query(
      `select did, role, granted_by, granted_at from staff_roles where revoked_at is null order by did, role`,
    )
    return {
      staff: rows.map(r => ({
        did: r.did,
        role: r.role,
        grantedBy: r.granted_by,
        grantedAt: r.granted_at,
      })),
      bootstrapSuperadmins: config.superadminDids.length,
    }
  })

  app.post('/admin/staff', async req => {
    const {did: me, roles} = await staff(req, 'manageStaff')
    const body = z
      .object({did, role: z.enum(STAFF_ROLES as [string, ...string[]])})
      .parse(req.body)
    // Only a SUPERADMIN can create ADMINs or SUPERADMINs.
    if (
      PRIVILEGED_ROLES.includes(body.role as any) &&
      !roles.includes('SUPERADMIN')
    )
      throw forbidden('insufficient_staff_role')
    await db.query(
      `insert into staff_roles (did, role, granted_by) values ($1, $2, $3)
       on conflict (did, role) do update set revoked_at = null, granted_by = $3, granted_at = now()`,
      [body.did, body.role, me],
    )
    await audit(db, {
      actor: me,
      action: 'staff.grant',
      resourceType: 'did',
      resourceId: body.did,
      reason: body.role,
      result: 'ok',
    })
    return {ok: true}
  })

  app.delete('/admin/staff/:did/:role', async req => {
    const {did: me, roles} = await staff(req, 'manageStaff')
    const p = z
      .object({did, role: z.enum(STAFF_ROLES as [string, ...string[]])})
      .parse(req.params)
    if (
      PRIVILEGED_ROLES.includes(p.role as any) &&
      !roles.includes('SUPERADMIN')
    )
      throw forbidden('insufficient_staff_role')
    const rows = await db.query(
      `update staff_roles set revoked_at = now() where did = $1 and role = $2 and revoked_at is null returning 1`,
      [p.did, p.role],
    )
    if (!rows.length) throw notFound()
    await audit(db, {
      actor: me,
      action: 'staff.revoke',
      resourceType: 'did',
      resourceId: p.did,
      reason: p.role,
      result: 'ok',
    })
    return {ok: true}
  })

  // ------------------------------------------------------------ staff: finance

  app.get('/admin/payout-requests', async req => {
    await staff(req, 'finance')
    const rows = await db.query(
      `select id, seller_type, seller_id, amount_minor, currency, status, created_at from payout_requests
        where status in ('REQUESTED', 'APPROVED') order by created_at limit 200`,
    )
    return {
      requests: rows.map(r => ({
        id: r.id,
        sellerType: r.seller_type,
        sellerId: r.seller_id,
        amountMinor: String(r.amount_minor),
        currency: r.currency,
        status: r.status,
        createdAt: r.created_at,
      })),
    }
  })

  /** Approval only records the decision: no provider, no transfer. */
  app.post('/admin/payout-requests/:id/decision', async req => {
    const {did: me} = await staff(req, 'finance')
    const {id} = z.object({id: z.string()}).parse(req.params)
    const body = z
      .object({decision: z.enum(['approve', 'reject']), reason})
      .parse(req.body)
    const rows = await db.query(
      `update payout_requests set status = $2, decided_at = now() where id = $1 and status = 'REQUESTED' returning id`,
      [id, body.decision === 'approve' ? 'APPROVED' : 'REJECTED'],
    )
    if (!rows.length) throw notFound()
    await audit(db, {
      actor: me,
      action: `finance.payout.${body.decision}`,
      resourceType: 'payout_request',
      resourceId: id,
      reason: body.reason,
      result: 'ok',
    })
    return {ok: true}
  })
})
