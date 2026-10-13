import {beforeEach, describe, expect, it} from 'vitest'

import {QUARANTINE_CONTENT_HASH} from '../src/portal/index.js'
import {createTestApp, did, type TestApp} from './helpers.js'

const ME = did('portalme')
const STRANGER = did('portalnew')

let t: TestApp

beforeEach(async () => {
  t = await createTestApp()
  await t.verifiedUser(ME)
})

describe('portal catalog', () => {
  it('refuses anonymous and undeclared callers', async () => {
    expect((await t.call('GET', '/portal/feed')).status).toBe(401)
    expect((await t.call('GET', '/portal/feed', STRANGER)).status).toBe(403)
  })

  it('lists only published adult items', async () => {
    const feed = await t.call('GET', '/portal/feed', ME)
    expect(feed.status).toBe(200)
    expect(feed.body.items.length).toBeGreaterThanOrEqual(8)
    expect(feed.body.items.every((item: {adult: boolean}) => item.adult)).toBe(
      true,
    )
    expect(
      feed.body.items.some((item: {title: string}) =>
        item.title.includes('Ensaio noturno'),
      ),
    ).toBe(true)
  })

  it('searches the curated external index and does not crawl', async () => {
    const web = await t.call(
      'GET',
      '/portal/web?q=fotografia&category=Fotografia',
      ME,
    )
    expect(web.status).toBe(200)
    expect(web.body.crawled).toBe(false)
    expect(web.body.results.map((row: {domain: string}) => row.domain)).toEqual(
      ['arte-exemplo.com'],
    )
  })
})

describe('age gate and verification placeholder', () => {
  it('reports required until a declaration, and keeps identity pending', async () => {
    const fresh = await t.call('GET', '/me/adult/status', STRANGER)
    expect(fresh.body).toEqual({
      ageGateStatus: 'required',
      identityVerificationStatus: 'pending',
      providersConnected: false,
    })
    await t.call('POST', '/me/adult/self-declaration', STRANGER, {
      declaration: 'adult',
      policyVersion: '2026-09-29',
    })
    const declared = await t.call('GET', '/me/adult/status', STRANGER)
    expect(declared.body.ageGateStatus).toBe('self_declared')
    expect(declared.body.identityVerificationStatus).toBe('pending')
    const verified = await t.call('GET', '/me/adult/status', ME)
    expect(verified.body.ageGateStatus).toBe('verified')
    expect(verified.body.identityVerificationStatus).toBe('pending')
  })
})

describe('preferences, consent and the hash hook', () => {
  it('stores portal preferences', async () => {
    const before = await t.call('GET', '/me/adult/portal-preferences', ME)
    expect(before.body.hideFromMain).toBe(true)
    expect(before.body.blurThumbnails).toBe(true)
    const saved = await t.call('PUT', '/me/adult/portal-preferences', ME, {
      blurThumbnails: false,
      autoplayVideos: false,
      hideFromMain: true,
      confirmExternal: true,
      formats: ['post', 'video'],
      categories: ['literatura'],
      mutedWords: 'termo1',
    })
    expect(saved.status).toBe(200)
    const after = await t.call('GET', '/me/adult/portal-preferences', ME)
    expect(after.body.mutedWords).toBe('termo1')
    expect(after.body.formats).toEqual(['post', 'video'])
    expect(after.body.blurThumbnails).toBe(false)
  })

  it('refuses a publish without consent', async () => {
    const res = await t.call('POST', '/portal/publish', ME, {
      format: 'post',
      title: 'Sem declaração',
      tags: [],
      visibility: 'aqua18',
      consent: false,
    })
    expect(res.status).toBe(400)
  })

  it('publishes after the hash hook and records consent', async () => {
    const res = await t.call('POST', '/portal/publish', ME, {
      format: 'post',
      title: 'Ensaio publicado',
      tags: ['ensaio'],
      visibility: 'aqua18',
      consent: true,
      contentHash: 'hash:ok',
    })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('published')
    const [consent] = await t.db.query(
      `select statement from portal_consent_attestations where resource_id = $1`,
      [res.body.id],
    )
    expect(String(consent.statement)).toMatch(/18\+/)
    const feed = await t.call('GET', '/portal/feed', ME)
    expect(
      feed.body.items.some((item: {id: string}) => item.id === res.body.id),
    ).toBe(true)
  })

  it('quarantines a hash-list hit and keeps it out of the feed', async () => {
    const res = await t.call('POST', '/portal/publish', ME, {
      format: 'post',
      title: 'Conteúdo retido',
      tags: [],
      visibility: 'aqua18',
      consent: true,
      contentHash: QUARANTINE_CONTENT_HASH,
    })
    expect(res.body.status).toBe('quarantined')
    const feed = await t.call('GET', '/portal/feed', ME)
    expect(
      feed.body.items.some((item: {id: string}) => item.id === res.body.id),
    ).toBe(false)
    const [held] = await t.db.query(
      `select source, priority from moderation_cases where resource_id = $1`,
      [res.body.id],
    )
    expect(held.source).toBe('hash_match')
    expect(held.priority).toBe(1)
  })

  it('does not index a page the hash hook rejects', async () => {
    const res = await t.call('POST', '/dev/portal/index', ME, {
      title: 'Página retida',
      domain: 'retida.example',
      url: 'https://retida.example/a',
      snippet: 'Não deve aparecer na busca.',
      category: 'Literatura',
      contentHash: QUARANTINE_CONTENT_HASH,
    })
    expect(res.body.status).toBe('quarantined')
    const web = await t.call('GET', '/portal/web?q=retida', ME)
    expect(web.body.results).toEqual([])
  })

  it('opens a priority report', async () => {
    const res = await t.call('POST', '/portal/reports', ME, {
      resourceKind: 'portal_item',
      resourceId: 'pi-ensaio',
      reasonCode: 'illegal_content',
    })
    expect(res.status).toBe(200)
    const again = await t.call('POST', '/portal/reports', ME, {
      resourceKind: 'portal_item',
      resourceId: 'pi-ensaio',
      reasonCode: 'illegal_content',
    })
    expect(again.status).toBe(409)
    const [row] = await t.db.query(
      `select status, priority from moderation_cases where id = $1`,
      [res.body.caseId],
    )
    expect(row.status).toBe('ACTION_REQUIRED')
    expect(row.priority).toBe(1)
  })
})
