import {describe, expect, it} from 'vitest'

import {loadConfig} from '../src/config.js'
import {createTestApp, did} from './helpers.js'

const ADULT = did('gadult')
const NOBODY = did('gnobody')
const CREATOR = did('gcreator')

async function freePost(t: Awaited<ReturnType<typeof createTestApp>>) {
  await t.approvedCreator(CREATOR)
  const uri = `at://${CREATOR}/app.bsky.feed.post/free1`
  const r = await t.call('POST', '/creator/resources', CREATOR, {
    resourceType: 'post',
    resourceId: uri,
    accessPolicy: 'free',
  })
  expect(r.status).toBe(200)
  return uri
}

const declare = (t: Awaited<ReturnType<typeof createTestApp>>, who: string) =>
  t.call('POST', '/me/adult/self-declaration', who, {
    declaration: 'adult',
    policyVersion: '2026-09-29',
  })

describe('self-declaration entry gate (verification flag off)', () => {
  it('records the declaration apart from age verification', async () => {
    const t = await createTestApp()
    const before = await t.call('GET', '/me/adult/access', ADULT)
    expect(before.body).toMatchObject({
      allowed: false,
      basis: null,
      verified: false,
      selfDeclared: false,
      ageVerificationRequired: false,
    })
    const r = await declare(t, ADULT)
    expect(r.body).toEqual({allowed: true, basis: 'self_declared'})
    const [row] = await t.db.query(
      `select * from adult_accounts where did = $1`,
      [ADULT],
    )
    // Never AGE_VERIFIED because of a click.
    expect(row.age_verified_at).toBeNull()
    expect(row.age_verification_ref).toBeNull()
    expect(row.self_declaration_policy_version).toBe('2026-09-29')
    const after = await t.call('GET', '/me/adult/access', ADULT)
    expect(after.body).toMatchObject({
      basis: 'self_declared',
      verified: false,
      selfDeclared: true,
    })
    const [a] = await t.db.query(
      `select count(*)::int as n from audit_events where action = 'adult.self_declaration' and actor_did = $1`,
      [ADULT],
    )
    expect(a.n).toBe(1)
  })

  it('opens free +18 content only after the declaration', async () => {
    const t = await createTestApp()
    const uri = await freePost(t)
    const check = (who: string) =>
      t.call('POST', '/access/check', who, {
        resourceType: 'post',
        resourceId: uri,
      })
    expect((await check(NOBODY)).body).toEqual({
      allowed: false,
      reason: 'adult_declaration_required',
    })
    expect((await t.call('GET', '/views/feed', NOBODY)).status).toBe(403)
    await declare(t, ADULT)
    expect((await check(ADULT)).body.allowed).toBe(true)
    expect((await t.call('GET', '/views/feed', ADULT)).status).toBe(200)
  })

  it('validates the declaration body', async () => {
    const t = await createTestApp()
    for (const body of [
      {},
      {declaration: 'minor', policyVersion: 'v1'},
      {declaration: 'adult', policyVersion: 'x'.repeat(41)},
    ])
      expect(
        (await t.call('POST', '/me/adult/self-declaration', ADULT, body))
          .status,
      ).toBe(400)
    expect(
      (await t.call('POST', '/me/adult/self-declaration', undefined, {}))
        .status,
    ).toBe(401)
  })
})

describe('age verification flag on (future Age Assurance)', () => {
  it('a declaration grants nothing; only a real verification does', async () => {
    const t = await createTestApp({ageVerificationRequired: true})
    const uri = await freePost(t)
    const r = await declare(t, ADULT)
    expect(r.body).toEqual({allowed: false, basis: null})
    const check = await t.call('POST', '/access/check', ADULT, {
      resourceType: 'post',
      resourceId: uri,
    })
    expect(check.body).toEqual({
      allowed: false,
      reason: 'age_verification_required',
    })
    expect((await t.call('GET', '/views/feed', ADULT)).body.error).toBe(
      'age_verification_required',
    )
    await t.verifiedUser(ADULT)
    const access = await t.call('GET', '/me/adult/access', ADULT)
    expect(access.body).toMatchObject({
      basis: 'verified',
      verified: true,
      selfDeclared: true,
    })
  })

  it('production fails closed unless self-declaration is switched on explicitly', () => {
    const prod = {
      AQUA_ENV: 'production',
      AQUA_MEDIA_SIGNING_SECRET: 's',
      DATABASE_URL: 'postgres://x',
      AQUA_SERVICE_DID: 'did:web:x',
    }
    expect(loadConfig(prod).ageVerificationRequired).toBe(true)
    expect(
      loadConfig({...prod, AQUA_ADULT_AGE_VERIFICATION_ENABLED: '0'})
        .ageVerificationRequired,
    ).toBe(false)
    expect(loadConfig({AQUA_ENV: 'development'}).ageVerificationRequired).toBe(
      false,
    )
    expect(
      loadConfig({
        AQUA_ENV: 'development',
        AQUA_ADULT_AGE_VERIFICATION_ENABLED: '1',
      }).ageVerificationRequired,
    ).toBe(true)
  })
})
