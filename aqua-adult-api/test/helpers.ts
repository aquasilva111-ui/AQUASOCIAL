import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {Secp256k1Keypair} from '@atproto/crypto'
import {createServiceJwt} from '@atproto/xrpc-server'

import {buildApp} from '../src/app.js'
import {type Config, loadConfig} from '../src/config.js'
import {createPgliteDb, type Db, migrate} from '../src/db/index.js'
import {type MockPaymentProvider} from '../src/economy/payments/mock.js'

export type TestApp = Awaited<ReturnType<typeof createTestApp>>

export async function createTestApp(overrides: Partial<Config> = {}) {
  const mediaDir = await mkdtemp(join(tmpdir(), 'aqua-media-'))
  const config = loadConfig(
    {},
    {
      env: 'test',
      devAuth: true,
      mockPayments: true,
      mockWebhookSecret: 'test-webhook-secret',
      mediaSigningSecret: 'test-media-secret',
      mediaDir,
      ...overrides,
    },
  )
  const db: Db = await createPgliteDb()
  await migrate(db)
  const keys = new Map<string, string>()
  const app = await buildApp({
    config,
    db,
    getSigningKey: async did => {
      const key = keys.get(did)
      if (!key) throw new Error('unknown did')
      return key
    },
  })

  const as = (did: string) => ({'x-aqua-dev-did': did})

  async function call(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    did?: string,
    payload?: unknown,
  ) {
    const res = await app.inject({
      method,
      url,
      headers: {
        ...(did ? as(did) : {}),
        ...(payload !== undefined ? {'content-type': 'application/json'} : {}),
      },
      payload: payload !== undefined ? JSON.stringify(payload) : undefined,
    })
    return {
      status: res.statusCode,
      body: res.body ? safeJson(res.body) : undefined,
      raw: res,
    }
  }

  return {
    app,
    db,
    config,
    call,
    /** Registers a real keypair for a DID and signs a service token for it. */
    async serviceToken(did: string, aud = config.serviceDid) {
      const keypair = await Secp256k1Keypair.create()
      keys.set(did, keypair.did())
      return createServiceJwt({iss: did, aud, lxm: null, keypair})
    },
    async verifiedUser(did: string) {
      const r = await call('POST', '/dev/age-verification', did, {})
      if (r.status !== 200) throw new Error(`verify failed ${r.status}`)
      return did
    },
    async approvedCreator(did: string, handle?: string) {
      await call('POST', '/dev/age-verification', did, {})
      const r = await call('POST', '/dev/creator-approval', did, {handle})
      if (r.status !== 200) throw new Error(`approve failed ${r.status}`)
      return r.body.creatorId as string
    },
    async setFees(platformBps: number, processingBps = 0, taxBps = 0) {
      await db.query(
        `update fee_config set platform_fee_bps = $1, processing_fee_bps = $2, tax_bps = $3`,
        [platformBps, processingBps, taxBps],
      )
    },
    /** Starts checkout and completes it through the signed mock webhook. */
    async buy(
      buyer: string,
      offerId: string,
      outcome: 'succeed' | 'fail' = 'succeed',
    ) {
      const order = await call('POST', '/checkout', buyer, {
        offerId,
        idempotencyKey: `key-${Math.random().toString(36).slice(2)}`,
      })
      if (order.status !== 200)
        throw new Error(`checkout ${order.status} ${order.raw.body}`)
      const ref = order.body.checkoutUrl.split('/').pop()
      const done = await call(
        'POST',
        `/dev/mock-checkout/${ref}/complete`,
        buyer,
        {outcome},
      )
      return {order: order.body, ref, result: done.body}
    },
    /** Upload through a one-time token, then wait for processing. */
    async upload(
      owner: string,
      kind: 'video' | 'image' | 'captions',
      purpose: string,
      mimeType: string,
      data: Buffer,
      declared = data.length,
    ) {
      const r = await call('POST', '/media/uploads', owner, {
        kind,
        purpose,
        mimeType,
        sizeBytes: declared,
      })
      if (r.status !== 200)
        return {
          status: r.status,
          body: r.body,
          assetId: undefined,
          uploadUrl: undefined,
        }
      const put = await app.inject({
        method: 'PUT',
        url: r.body.uploadUrl,
        headers: {'content-type': 'application/octet-stream'},
        payload: data,
      })
      await app.aquaMedia.drain()
      return {
        status: put.statusCode,
        body: safeJson(put.body),
        assetId: r.body.assetId as string,
        uploadUrl: r.body.uploadUrl as string,
      }
    },
    /** Unauthenticated GET (media delivery relies only on the signed URL). */
    async fetch(url: string) {
      const res = await app.inject({method: 'GET', url})
      return {
        status: res.statusCode,
        body: res.body,
        headers: res.headers,
        raw: res.rawPayload,
      }
    },
    async deliver(event: Parameters<MockPaymentProvider['signEvent']>[0]) {
      const signed = getMock(app).signEvent(event)
      return app.inject({
        method: 'POST',
        url: '/webhooks/payments/mock',
        headers: {...signed.headers, 'content-type': 'application/json'},
        payload: signed.rawBody,
      })
    },
  }
}

function getMock(app: TestAppInstance): MockPaymentProvider {
  return app.aquaProviders.get('mock') as MockPaymentProvider
}
type TestAppInstance = Awaited<ReturnType<typeof buildApp>>

function safeJson(s: string) {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

export const did = (name: string) =>
  `did:plc:${name.padEnd(24, 'x').slice(0, 24)}`
