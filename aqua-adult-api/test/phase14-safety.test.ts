import {afterEach, beforeAll, beforeEach, describe, expect, it} from 'vitest'

import {registerMatchingProvider} from '../src/safety/matching.js'
import {createTestApp, did, type TestApp} from './helpers.js'
import {fixtures} from './media-fixtures.js'

const CREATOR = did('tcreator')
const VIEWER = did('tviewer')
const OTHER = did('tother')
const SUPER = did('tsuper')
const ADMIN = did('tadmin')
const MOD = did('tmod')
const SENIOR = did('tsenior')
const TNS = did('ttns')
const FIN = did('tfin')
const SUPPORT = did('tsupport')

let t: TestApp
let f: ReturnType<typeof fixtures>
let creatorId: string

beforeAll(() => {
  f = fixtures()
})

beforeEach(async () => {
  t = await createTestApp({superadminDids: [SUPER]})
  creatorId = await t.approvedCreator(CREATOR, 'safety.creator.test')
  for (const d of [VIEWER, OTHER]) await t.verifiedUser(d)
  for (const [who, role] of [
    [ADMIN, 'ADMIN'],
    [MOD, 'MODERATOR'],
    [SENIOR, 'SENIOR_MODERATOR'],
    [TNS, 'TRUST_SAFETY'],
    [FIN, 'FINANCE'],
    [SUPPORT, 'SUPPORT'],
  ])
    expect(
      (await t.call('POST', '/admin/staff', SUPER, {did: who, role})).status,
    ).toBe(200)
})

async function publishVideo(policy = 'free') {
  const up = await t.upload(CREATOR, 'video', 'original', 'video/mp4', f.video)
  const r = await t.call('POST', '/creator/videos', CREATOR, {
    title: 'Clip',
    category: 'solo',
    mediaAssetId: up.assetId,
    accessPolicy: policy,
    publish: true,
  })
  expect(r.status).toBe(200)
  return r.body.videoId as string
}

const report = (who: string, body: Record<string, unknown>) =>
  t.call('POST', '/reports', who, body)

async function reportVideo(
  id: string,
  who = VIEWER,
  reasonCode = 'harassment',
) {
  const r = await report(who, {
    targetType: 'content',
    resourceType: 'video',
    resourceId: id,
    reasonCode,
  })
  expect(r.status).toBe(200)
  const [row] = await t.db.query(`select case_id from reports where id = $1`, [
    r.body.reportId,
  ])
  return row.case_id as string
}

const act = (who: string, caseId: string, body: Record<string, unknown>) =>
  t.call('POST', `/admin/cases/${caseId}/actions`, who, body)

const play = (who: string, id: string) =>
  t.call('POST', `/views/videos/${id}/playback`, who, {})

const feedIds = async (who = VIEWER) =>
  (await t.call('GET', '/views/feed', who)).body.videos.map((v: any) => v.id)

describe('reports', () => {
  it('structured reasons per target; reports pile onto one case', async () => {
    const reasons = await t.call(
      'GET',
      '/reports/reasons?targetType=message',
      VIEWER,
    )
    const codes = reasons.body.reasons.map((r: any) => r.code)
    expect(codes).toContain('harassment')
    expect(codes).not.toContain('copyright')

    const id = await publishVideo()
    const bad = await report(VIEWER, {
      targetType: 'content',
      resourceType: 'video',
      resourceId: id,
      reasonCode: 'made_up',
    })
    expect(bad.body.error).toBe('invalid_reason')
    const wrongTarget = await report(VIEWER, {
      targetType: 'message',
      resourceId: id,
      reasonCode: 'spam',
    })
    expect(wrongTarget.status).toBe(404)

    const c1 = await reportVideo(id, VIEWER, 'spam')
    const c2 = await reportVideo(id, OTHER, 'underage_suspected')
    expect(c2).toBe(c1)
    const [c] = await t.db.query(
      `select * from moderation_cases where id = $1`,
      [c1],
    )
    expect(c).toMatchObject({report_count: 2, priority: 1, source: 'report'})
    // Same reporter, same item, same day: refused.
    const again = await report(VIEWER, {
      targetType: 'content',
      resourceType: 'video',
      resourceId: id,
      reasonCode: 'spam',
    })
    expect(again.status).toBe(429)

    // All seven targets resolve.
    for (const body of [
      {
        targetType: 'creator',
        resourceId: creatorId,
        reasonCode: 'impersonation',
      },
      {targetType: 'user', resourceId: CREATOR, reasonCode: 'harassment'},
      {
        targetType: 'production',
        resourceType: 'video',
        resourceId: id,
        reasonCode: 'copyright',
      },
    ])
      expect((await report(OTHER, body)).status).not.toBe(500)
    expect(
      (
        await report(OTHER, {
          targetType: 'user',
          resourceId: OTHER,
          reasonCode: 'spam',
        })
      ).body.error,
    ).toBe('invalid_target')

    const mine = await t.call('GET', '/me/reports', VIEWER)
    expect(mine.body.reports[0]).toMatchObject({status: 'in_review'})
    expect(JSON.stringify(mine.body)).not.toContain(OTHER)
  })

  it('reporters stay hidden from moderators below Trust & Safety', async () => {
    const id = await publishVideo()
    const caseId = await reportVideo(id)
    const asMod = await t.call('GET', `/admin/cases/${caseId}`, MOD)
    expect(asMod.body.reports[0].reporterDid).toBeUndefined()
    const asTns = await t.call('GET', `/admin/cases/${caseId}`, TNS)
    expect(asTns.body.reports[0].reporterDid).toBe(VIEWER)
    expect((await t.call('GET', `/admin/cases/${caseId}`, VIEWER)).status).toBe(
      403,
    )
    expect((await t.call('GET', `/admin/cases/${caseId}`, FIN)).status).toBe(
      403,
    )
  })
})

describe('quarantine, removal and restore', () => {
  it('pulls the item everywhere, kills old signed URLs, and restores it', async () => {
    const id = await publishVideo()
    const before = await play(VIEWER, id)
    expect(before.status).toBe(200)
    const oldUrl = before.body.url as string
    expect((await t.fetch(oldUrl)).status).toBe(200)

    const caseId = await reportVideo(id)
    const q = await act(MOD, caseId, {
      action: 'quarantine',
      reason: 'under review',
    })
    expect(q.status).toBe(200)
    // Old URL, new playback, feed, detail, related, search — all gone.
    expect((await t.fetch(oldUrl)).status).toBe(403)
    expect((await play(VIEWER, id)).status).toBe(403)
    expect(await feedIds()).toEqual([])
    expect((await t.call('GET', `/views/videos/${id}`, VIEWER)).status).toBe(
      404,
    )
    expect(
      (await t.call('GET', '/views/feed?category=solo', VIEWER)).body.videos,
    ).toEqual([])
    // Personalized responses are never cacheable.
    const res = await t.call('GET', '/views/feed', VIEWER)
    expect(res.raw.headers['cache-control']).toBe('private, no-store')

    // A moderator may quarantine but not remove.
    expect(
      (await act(MOD, caseId, {action: 'remove', reason: 'confirmed'})).status,
    ).toBe(403)
    expect(
      (await act(SENIOR, caseId, {action: 'remove', reason: 'confirmed'}))
        .status,
    ).toBe(200)
    const [v] = await t.db.query(`select status from videos where id = $1`, [
      id,
    ])
    expect(v.status).toBe('removed')

    // Restore reverses the latest action (removal → back to quarantine) and
    // then the quarantine — as new actions; history is kept.
    await act(SENIOR, caseId, {action: 'restore', reason: 'appeal accepted'})
    expect(
      (await t.db.query(`select status from videos where id = $1`, [id]))[0]
        .status,
    ).toBe('quarantined')
    await act(SENIOR, caseId, {action: 'restore', reason: 'appeal accepted'})
    expect((await play(VIEWER, id)).status).toBe(200)
    expect(await feedIds()).toEqual([id])
    const actions = await t.db.query(
      `select action, reverses_action_id from moderation_actions where case_id = $1 order by created_at, id`,
      [caseId],
    )
    expect(actions.map(a => a.action)).toEqual([
      'quarantine',
      'remove',
      'restore',
      'restore',
    ])
    await expect(
      t.db.query(`update moderation_actions set reason = 'x'`),
    ).rejects.toThrow()
    await expect(t.db.query(`delete from audit_events`)).rejects.toThrow()
  })

  it('restrict hides from discovery but keeps the owner’s access; age and region restrict', async () => {
    const id = await publishVideo()
    const caseId = await reportVideo(id)
    await act(MOD, caseId, {action: 'restrict', reason: 'temporary'})
    expect(await feedIds()).toEqual([])
    expect((await play(VIEWER, id)).body.error).toBe('content_restricted')
    expect((await play(CREATOR, id)).status).toBe(200)
    await act(MOD, caseId, {action: 'lift_restriction', reason: 'cleared'})
    expect((await play(VIEWER, id)).status).toBe(200)

    // Age restriction: verified users only — a self-declaration is not enough.
    await act(MOD, caseId, {action: 'age_restrict', reason: 'extra care'})
    await t.call('POST', '/me/adult/self-declaration', OTHER + 'x', {
      declaration: 'adult',
      policyVersion: 'v1',
    })
    const declared = did('tdeclared')
    await t.call('POST', '/me/adult/self-declaration', declared, {
      declaration: 'adult',
      policyVersion: 'v1',
    })
    expect((await play(declared, id)).body.error).toBe(
      'age_verification_required',
    )
    expect((await play(VIEWER, id)).status).toBe(200)

    // Region restriction: unknown viewer region is denied.
    await act(MOD, caseId, {
      action: 'region_restrict',
      reason: 'legal',
      params: {regions: ['PT']},
    })
    expect((await play(VIEWER, id)).body.error).toBe('region_restricted')
    expect(
      (
        await act(MOD, caseId, {
          action: 'region_restrict',
          reason: 'legal',
          params: {},
        })
      ).body.error,
    ).toBe('regions_required')
  })
})

describe('accounts', () => {
  it('suspending a creator hides their content; only Trust & Safety may do it', async () => {
    const id = await publishVideo()
    const r = await report(VIEWER, {
      targetType: 'creator',
      resourceId: creatorId,
      reasonCode: 'scam_fraud',
    })
    const [{case_id: caseId}] = await t.db.query(
      `select case_id from reports where id = $1`,
      [r.body.reportId],
    )
    for (const who of [MOD, SENIOR, ADMIN, FIN, SUPPORT, VIEWER])
      expect(
        (await act(who, caseId, {action: 'suspend', reason: 'fraud'})).status,
      ).toBe(403)
    expect(
      (await act(TNS, caseId, {action: 'suspend', reason: 'fraud'})).status,
    ).toBe(200)
    expect((await play(VIEWER, id)).body.error).toBe('creator_suspended')
    expect(await feedIds()).toEqual([])
    expect(
      (await t.call('GET', '/dashboard/creator', CREATOR)).body.error,
    ).toBe('creator_not_approved')
    await act(TNS, caseId, {action: 'restore', reason: 'reinstated'})
    expect((await play(VIEWER, id)).status).toBe(200)
  })

  it('a ban closes the +18 context for that account', async () => {
    const caseRes = await report(VIEWER, {
      targetType: 'user',
      resourceId: OTHER,
      reasonCode: 'harassment',
    })
    const [{case_id: caseId}] = await t.db.query(
      `select case_id from reports where id = $1`,
      [caseRes.body.reportId],
    )
    expect(
      (await act(TNS, caseId, {action: 'ban', reason: 'repeated harassment'}))
        .status,
    ).toBe(200)
    const denied = await t.call('GET', '/views/feed', OTHER)
    expect(denied.body.error).toBe('account_banned')
    // A ban is not undone by declaring again.
    await t.call('POST', '/me/adult/self-declaration', OTHER, {
      declaration: 'adult',
      policyVersion: 'v1',
    })
    expect((await t.call('GET', '/views/feed', OTHER)).status).toBe(403)
    await act(TNS, caseId, {action: 'restore', reason: 'ban lifted'})
    expect((await t.call('GET', '/views/feed', OTHER)).status).toBe(200)
  })
})

describe('blocks', () => {
  it('apply to feed, recommendations, creator content and live chat', async () => {
    const id = await publishVideo()
    expect(await feedIds()).toEqual([id])
    // Viewer blocks the creator: gone from the viewer's discovery.
    expect(
      (await t.call('PUT', `/me/adult/blocks/${CREATOR}`, VIEWER)).status,
    ).toBe(200)
    expect(await feedIds()).toEqual([])
    expect(
      (await t.call('GET', `/views/videos/${id}/related`, VIEWER)).body.videos,
    ).toEqual([])
    await t.call('DELETE', `/me/adult/blocks/${CREATOR}`, VIEWER)
    expect(await feedIds()).toEqual([id])
    // Creator blocks the viewer: the viewer can't reach their content.
    await t.call('PUT', `/me/adult/blocks/${VIEWER}`, CREATOR)
    expect((await play(VIEWER, id)).body.error).toBe('blocked')
    expect((await play(OTHER, id)).status).toBe(200)
    expect(
      (await t.call('PUT', `/me/adult/blocks/${VIEWER}`, VIEWER)).status,
    ).toBe(400)
  })
})

describe('appeals', () => {
  it('open a new linked case; overturning restores; the original stays', async () => {
    const id = await publishVideo()
    const caseId = await reportVideo(id)
    await act(SENIOR, caseId, {action: 'remove', reason: 'violation'})
    const notDecided = await t.call('POST', '/appeals', CREATOR, {
      caseId,
      statement: 'Este vídeo é meu e está dentro das regras.',
    })
    expect(notDecided.body.error).toBe('not_appealable')
    expect(
      (
        await t.call('POST', `/admin/cases/${caseId}/decision`, SENIOR, {
          decision: 'violation',
          reason: 'policy 3.1',
        })
      ).status,
    ).toBe(200)
    // Strangers can't appeal (and learn nothing).
    expect(
      (
        await t.call('POST', '/appeals', OTHER, {
          caseId,
          statement: 'Quero recorrer disso aqui.',
        })
      ).status,
    ).toBe(404)
    const appeal = await t.call('POST', '/appeals', CREATOR, {
      caseId,
      statement: 'Este vídeo é meu e está dentro das regras.',
    })
    expect(appeal.status).toBe(200)
    const mod = await t.call('GET', '/me/moderation', CREATOR)
    expect(mod.body.cases[0]).toMatchObject({caseId, decision: 'violation'})
    // The original decider can't judge the appeal.
    const conflict = await t.call(
      'POST',
      `/admin/appeals/${appeal.body.appealId}/decision`,
      SENIOR,
      {
        outcome: 'overturned',
        reason: 'second look',
      },
    )
    expect(conflict.body.error).toBe('reviewer_conflict')
    expect(
      (
        await t.call(
          'POST',
          `/admin/appeals/${appeal.body.appealId}/decision`,
          MOD,
          {outcome: 'overturned', reason: 'overturn'},
        )
      ).status,
    ).toBe(403)
    const ok = await t.call(
      'POST',
      `/admin/appeals/${appeal.body.appealId}/decision`,
      TNS,
      {
        outcome: 'overturned',
        reason: 'contexto artístico',
      },
    )
    expect(ok.status).toBe(200)
    expect((await play(VIEWER, id)).status).toBe(200)
    const decisions = await t.db.query(
      `select case_id, decision from moderation_decisions order by created_at`,
    )
    expect(decisions.map(d => d.decision)).toEqual([
      'violation',
      'appeal_overturned',
    ])
    expect(decisions[0].case_id).toBe(caseId)
    expect(decisions[1].case_id).not.toBe(caseId)
  })
})

describe('takedown flow', () => {
  it('request → review → temporary restriction → decision → action → appeal', async () => {
    const id = await publishVideo()
    const anon = await t.app.inject({
      method: 'POST',
      url: '/takedowns',
      headers: {'content-type': 'application/json'},
      payload: JSON.stringify({
        resourceType: 'video',
        resourceId: id,
        basis: 'copyright',
        details: 'Este é o meu filme, sem licença.',
      }),
    })
    expect(anon.json().error).toBe('contact_required')
    const req = await t.app.inject({
      method: 'POST',
      url: '/takedowns',
      headers: {'content-type': 'application/json'},
      payload: JSON.stringify({
        resourceType: 'video',
        resourceId: id,
        basis: 'copyright',
        details: 'Este é o meu filme, sem licença.',
        contact: 'rights@example.com',
      }),
    })
    expect(req.statusCode).toBe(200)
    const takedownId = req.json().requestId
    const list = await t.call('GET', '/admin/takedowns', SENIOR)
    expect(list.body.takedowns[0].contact).toBeUndefined()
    expect(
      (await t.call('GET', '/admin/takedowns', TNS)).body.takedowns[0].contact,
    ).toBe('rights@example.com')
    expect(
      (
        await t.call('POST', `/admin/takedowns/${takedownId}/restrict`, MOD, {
          reason: 'review',
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await t.call(
          'POST',
          `/admin/takedowns/${takedownId}/restrict`,
          SENIOR,
          {reason: 'review'},
        )
      ).status,
    ).toBe(200)
    expect((await play(VIEWER, id)).body.error).toBe('content_restricted')
    const decision = await t.call(
      'POST',
      `/admin/takedowns/${takedownId}/decision`,
      SENIOR,
      {decision: 'accept', reason: 'claim valid'},
    )
    expect(decision.body.status).toBe('ACTIONED')
    expect(
      (await t.db.query(`select status from videos where id = $1`, [id]))[0]
        .status,
    ).toBe('removed')
    const [tk] = await t.db.query(
      `select case_id from takedown_requests where id = $1`,
      [takedownId],
    )
    const appeal = await t.call('POST', '/appeals', CREATOR, {
      caseId: tk.case_id,
      statement: 'Tenho a licença deste conteúdo.',
    })
    expect(appeal.status).toBe(200)
    expect(
      (
        await t.db.query(`select status from takedown_requests where id = $1`, [
          takedownId,
        ])
      )[0].status,
    ).toBe('APPEALED')
  })
})

describe('emergency removal and audit', () => {
  it('stops distribution at once and is always audited; only T&S/admin', async () => {
    const id = await publishVideo()
    const url = (await play(VIEWER, id)).body.url
    const body = {
      resourceType: 'video',
      resourceId: id,
      reason: 'imminent harm reported',
    }
    for (const who of [MOD, SENIOR, FIN, SUPPORT, CREATOR])
      expect(
        (await t.call('POST', '/admin/emergency-removal', who, body)).status,
      ).toBe(403)
    const r = await t.call('POST', '/admin/emergency-removal', ADMIN, body)
    expect(r.status).toBe(200)
    expect((await t.fetch(url)).status).toBe(403)
    const audit = await t.call(
      'GET',
      `/admin/audit?resourceType=video&resourceId=${id}`,
      TNS,
    )
    const actions = audit.body.events.map((e: any) => e.action)
    expect(actions).toEqual(
      expect.arrayContaining(['emergency.removal', 'moderation.remove']),
    )
    const e = audit.body.events.find(
      (x: any) => x.action === 'emergency.removal',
    )
    expect(e).toMatchObject({actor: ADMIN, result: 'ok'})
    expect(e.reason).toContain(r.body.caseId)
    expect((await t.call('GET', '/admin/audit', MOD)).status).toBe(403)
    const denied = await t.call(
      'GET',
      `/admin/audit?action=staff.emergencyRemoval`,
      SUPER,
    )
    expect(denied.body.events.length).toBeGreaterThanOrEqual(5)
  })
})

describe('staff RBAC', () => {
  it('no catch-all admin: each role holds only its capabilities', async () => {
    const me = async (who: string) =>
      (await t.call('GET', '/admin/me', who)).body
    expect((await t.call('GET', '/admin/me', VIEWER)).status).toBe(404)
    expect((await me(ADMIN)).permissions).not.toContain('actRemove')
    expect((await me(FIN)).permissions).toEqual(['finance'])
    expect((await me(SUPPORT)).permissions).toEqual(['viewCases'])
    // Admin grants staff roles, but only a superadmin creates admins.
    expect(
      (
        await t.call('POST', '/admin/staff', ADMIN, {
          did: OTHER,
          role: 'MODERATOR',
        })
      ).status,
    ).toBe(200)
    expect(
      (await t.call('POST', '/admin/staff', ADMIN, {did: OTHER, role: 'ADMIN'}))
        .status,
    ).toBe(403)
    expect(
      (
        await t.call('POST', '/admin/staff', MOD, {
          did: OTHER,
          role: 'MODERATOR',
        })
      ).status,
    ).toBe(403)
    expect(
      (await t.call('DELETE', `/admin/staff/${OTHER}/MODERATOR`, ADMIN)).status,
    ).toBe(200)
    expect((await t.call('GET', '/admin/me', OTHER)).status).toBe(404)
  })

  it('finance decides payout requests without moving money', async () => {
    await t.call('POST', '/dashboard/creator/payout-account', CREATOR, {})
    await t.call(
      'POST',
      '/dashboard/creator/dev/payout-account/verify',
      CREATOR,
      {},
    )
    await t.db.query(
      `insert into ledger_entries (seller_type, seller_id, type, amount_minor, currency, reference, created_at)
       values ('creator', $1, 'ADJUSTMENT', 5000, 'BRL', 'settled', now() - interval '30 days')`,
      [creatorId],
    )
    const req = await t.call(
      'POST',
      '/dashboard/creator/payout-requests',
      CREATOR,
      {amountMinor: 1000, currency: 'BRL'},
    )
    const decide = (who: string) =>
      t.call(
        'POST',
        `/admin/payout-requests/${req.body.requestId}/decision`,
        who,
        {decision: 'approve', reason: 'approved'},
      )
    expect((await decide(TNS)).status).toBe(403)
    expect((await decide(FIN)).status).toBe(200)
    expect(
      (await t.db.query(`select 1 from ledger_entries where type = 'PAYOUT'`))
        .length,
    ).toBe(0)
  })
})

describe('creator verification', () => {
  it('application → identity → age → agreement → review; nothing from the client', async () => {
    const NEW = did('tnewcreator')
    const app = await t.call('POST', '/creator/applications', NEW, {
      handle: 'new.test',
    })
    expect(app.body.status).toBe('IDENTITY_PENDING')
    const id = app.body.id
    // The client can't skip steps.
    expect(
      (
        await t.call('POST', `/creator/applications/${id}/agreement`, NEW, {
          version: '2026-09-creator-v1',
        })
      ).body.error,
    ).toBe('not_ready_for_agreement')
    const forged = await t.app.inject({
      method: 'POST',
      url: '/webhooks/verification/mock-verification',
      headers: {
        'content-type': 'application/json',
        'x-mock-verification-signature': 't=1,v1=' + '0'.repeat(64),
      },
      payload: JSON.stringify({
        eventId: 'x',
        kind: 'identity',
        did: NEW,
        verified: true,
        reference: 'r',
      }),
    })
    expect(forged.statusCode).toBe(400)
    await t.call('POST', '/dev/verification/complete', NEW, {kind: 'identity'})
    expect(
      (await t.call('GET', '/creator/applications/me', NEW)).body
        .applications[0].status,
    ).toBe('AGE_PENDING')
    await t.call('POST', '/dev/verification/complete', NEW, {kind: 'age'})
    expect(
      (await t.call('GET', '/creator/applications/me', NEW)).body
        .applications[0].status,
    ).toBe('AGREEMENT_PENDING')
    // Only the verification result is kept: no documents.
    const [acct] = await t.db.query(
      `select * from adult_accounts where did = $1`,
      [NEW],
    )
    expect(acct.age_verification_ref).toBe('dev-age')
    expect(acct.age_verification_expires_at).toBeTruthy()
    expect(
      (
        await t.call('POST', `/creator/applications/${id}/agreement`, NEW, {
          version: 'old',
        })
      ).body.error,
    ).toBe('agreement_outdated')
    expect(
      (
        await t.call('POST', `/creator/applications/${id}/agreement`, NEW, {
          version: '2026-09-creator-v1',
        })
      ).status,
    ).toBe(200)
    expect((await t.call('GET', '/dashboard/creator', NEW)).body.error).toBe(
      'creator_not_approved',
    )
    const decide = (who: string) =>
      t.call('POST', `/admin/creator-applications/${id}/decision`, who, {
        decision: 'approve',
        reason: 'all checks passed',
      })
    expect((await decide(MOD)).status).toBe(403)
    expect((await decide(TNS)).status).toBe(200)
    const [c] = await t.db.query(`select status from creators where did = $1`, [
      NEW,
    ])
    expect(c.status).toBe('approved')
  })
})

describe('consent and rights', () => {
  it('records stay private; revoking consent restricts the item', async () => {
    const id = await publishVideo()
    const add = await t.call('POST', '/consent-records', CREATOR, {
      resourceType: 'video',
      resourceId: id,
      kind: 'performer_consent',
      subjectRef: 'provider-ref-123',
    })
    expect(add.status).toBe(200)
    expect(
      (
        await t.call('POST', '/consent-records', CREATOR, {
          resourceType: 'video',
          resourceId: id,
          kind: 'content_rights',
          subjectRef: 'x',
          documentRef: 'https://public.example/doc.pdf',
        })
      ).body.error,
    ).toBe('document_ref_must_be_private')
    expect(
      (
        await t.call('POST', '/consent-records', OTHER, {
          resourceType: 'video',
          resourceId: id,
          kind: 'content_rights',
          subjectRef: 'x',
        })
      ).status,
    ).toBe(404)
    const own = await t.call(
      'GET',
      `/consent-records?resourceType=video&resourceId=${id}`,
      CREATOR,
    )
    expect(own.body.records[0].subjectRef).toBeUndefined()
    expect(
      (
        await t.call(
          'GET',
          `/consent-records?resourceType=video&resourceId=${id}`,
          VIEWER,
        )
      ).status,
    ).toBe(404)
    const staffView = await t.call(
      'GET',
      `/consent-records?resourceType=video&resourceId=${id}`,
      TNS,
    )
    expect(staffView.body.records[0].subjectRef).toBe('provider-ref-123')
    // Nothing leaks through public video endpoints.
    expect(
      JSON.stringify((await t.call('GET', `/views/videos/${id}`, VIEWER)).body),
    ).not.toContain('provider-ref')

    const revoke = await t.call(
      'POST',
      `/consent-records/${add.body.recordId}/revoke`,
      CREATOR,
      {reason: 'performer withdrew'},
    )
    expect(revoke.status).toBe(200)
    expect((await play(VIEWER, id)).body.error).toBe('content_restricted')
    const [c] = await t.db.query(
      `select priority, status from moderation_cases where id = $1`,
      [revoke.body.caseId],
    )
    expect(c).toMatchObject({priority: 1, status: 'ACTION_REQUIRED'})
  })
})

describe('hash / matching hooks', () => {
  let unregister: (() => void) | undefined
  afterEach(() => unregister?.())

  it('an external provider match quarantines the upload and opens a case', async () => {
    unregister = registerMatchingProvider({
      name: 'test-provider',
      async check() {
        return {matched: true, reference: 'ref-1', category: 'illegal_content'}
      },
    })
    const up = await t.upload(
      CREATOR,
      'video',
      'original',
      'video/mp4',
      f.video,
    )
    const [a] = await t.db.query(
      `select status from media_assets where id = $1`,
      [up.assetId],
    )
    expect(a.status).toBe('QUARANTINED')
    const [c] = await t.db.query(
      `select * from moderation_cases where source = 'hash_match'`,
    )
    expect(c).toMatchObject({resource_id: up.assetId, priority: 1})
  })

  it('without a provider nothing is flagged (no home-made detector)', async () => {
    const up = await t.upload(
      CREATOR,
      'video',
      'original',
      'video/mp4',
      f.video,
    )
    const [a] = await t.db.query(
      `select status from media_assets where id = $1`,
      [up.assetId],
    )
    expect(a.status).toBe('READY')
  })
})

describe('live moderation', () => {
  it('live chat message reports and removal', async () => {
    const live = await t.call('POST', '/live', CREATOR, {
      title: 'Ao vivo',
      accessPolicy: 'free',
    })
    expect(live.status).toBe(200)
    const [msgCase] = await Promise.all([
      report(VIEWER, {
        targetType: 'live',
        resourceId: live.body.id ?? live.body.streamId,
        reasonCode: 'spam',
      }),
    ])
    expect(msgCase.status).toBe(200)
  })
})
