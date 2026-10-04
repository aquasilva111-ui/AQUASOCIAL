import './modules.js'

import cors from '@fastify/cors'
import Fastify, {type FastifyInstance, type FastifyRequest} from 'fastify'
import {z, ZodError} from 'zod'

import {authenticate, type SigningKeyResolver} from './auth/index.js'
import {type Config} from './config.js'
import {type Db} from './db/index.js'
import {
  applyPaymentEvent,
  cancelSubscription,
  checkout,
  createOffer,
  createTier,
  getApprovedCreatorForDid,
  ledgerSummary,
  publicOrder,
  updateTier,
} from './economy/index.js'
import {MockPaymentProvider} from './economy/payments/mock.js'
import {
  type PaymentProvider,
  WebhookVerificationError,
} from './economy/payments/provider.js'
import {
  adultAccessStatus,
  checkAccess,
  configureAdultAccess,
  listUserEntitlements,
} from './entitlements/index.js'
import {audit} from './lib/audit.js'
import {ApiError, badRequest, forbidden, notFound} from './lib/errors.js'
import {newId} from './lib/ids.js'
import {MoneyError} from './lib/money.js'
import {enforce, SharedRateLimiter} from './lib/rateLimit.js'
import {MediaEngine} from './media/engine.js'
import {LocalPrivateStorage} from './media/storage.js'
import {installRoutes} from './registry.js'

export type AppDeps = {
  config: Config
  db: Db
  getSigningKey: SigningKeyResolver
  providers?: PaymentProvider[]
}

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string
  }
  interface FastifyInstance {
    aquaProviders: Map<string, PaymentProvider>
    aquaMedia: MediaEngine
  }
}

const MIN = 60_000
const HOUR = 3600_000
/** [METHOD route, max requests, window] per client address. */
const RATE_LIMITS: [string, number, number][] = [
  ['POST /checkout', 30, MIN],
  ['POST /views/videos/:id/playback', 120, MIN],
  ['POST /views/videos/:id/preview', 120, MIN],
  ['POST /studio-titles/:type/:id/playback', 120, MIN],
  ['POST /studio-titles/:type/:id/preview', 120, MIN],
  ['POST /live/:id/playback', 120, MIN],
  ['POST /live/:id/chat', 60, MIN],
  ['POST /media/uploads', 60, HOUR],
  ['POST /reports', 60, HOUR],
  ['GET /studios/search', 120, MIN],
  ['POST /me/adult/self-declaration', 30, HOUR],
  ['POST /creator/applications', 20, HOUR],
  ['POST /dashboard/creator/payout-requests', 30, HOUR],
  ['* /admin/*', 600, MIN],
]

/** Masks bearer-like path segments (signed media tokens, stream keys). */
export function redactUrl(url: string) {
  return url.replace(
    /\/(stream|live-stream|media\/upload|live\/ingest)\/[^/?]+/g,
    '/$1/[redacted]',
  )
}

const resourceRef = z.object({
  resourceType: z.string().min(1).max(40),
  resourceId: z.string().min(1).max(500),
})

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const {config, db} = deps
  configureAdultAccess({
    ageVerificationRequired: config.ageVerificationRequired,
  })
  const app = Fastify({
    // Structured JSON logs. Never bodies, never auth headers, and signed
    // tokens / stream keys in URLs are masked before anything is written.
    logger:
      config.logLevel === 'silent'
        ? false
        : {
            level: config.logLevel,
            serializers: {
              req: req => ({
                method: req.method,
                url: redactUrl(req.url),
                reqId: req.id,
              }),
              res: res => ({statusCode: res.statusCode}),
            },
          },
    trustProxy: config.trustProxy,
    bodyLimit: 1024 * 1024,
    routerOptions: {maxParamLength: 1024},
  })

  // Encoders (ffmpeg HTTP PUT) half-close the socket right after the body;
  // without this Node treats a complete upload as aborted.
  ;(app.server as {httpAllowHalfOpen?: boolean}).httpAllowHalfOpen = true

  const providers = new Map<string, PaymentProvider>()
  for (const p of deps.providers ?? []) providers.set(p.name, p)
  if (
    config.mockPayments &&
    config.env !== 'production' &&
    !providers.has('mock')
  )
    providers.set('mock', new MockPaymentProvider(config))
  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  })
  app.decorate('aquaProviders', providers)
  const media = new MediaEngine(
    db,
    new LocalPrivateStorage(config.mediaDir),
    config,
  )
  app.decorate('aquaMedia', media)
  // Upload bodies are streamed, never buffered in memory.
  // Encoders push live HLS with assorted media types; hand routes the stream.
  app.addContentTypeParser('*', (_req, payload, done) => done(null, payload))
  app.addContentTypeParser('application/octet-stream', (_req, payload, done) =>
    done(null, payload),
  )
  const defaultProvider = () => {
    const p = [...providers.values()][0]
    if (!p) throw new ApiError(503, 'payments_unavailable')
    return p
  }

  app.addContentTypeParser(
    'application/json',
    {parseAs: 'string'},
    (req, body, done) => {
      req.rawBody = body as string
      try {
        done(null, body ? JSON.parse(body as string) : {})
      } catch {
        done(badRequest('invalid_json'), undefined)
      }
    },
  )

  // Personalized responses must never be stored by shared caches.
  app.addHook('onSend', async (_req, reply) => {
    if (!reply.getHeader('cache-control'))
      reply.header('cache-control', 'private, no-store')
    reply.header('x-content-type-options', 'nosniff')
  })

  // Generous per-client limits on abuse-prone routes; normal use never hits them.
  const limiters = new Map<string, SharedRateLimiter>()
  for (const [route, limit, windowMs] of RATE_LIMITS)
    limiters.set(route, new SharedRateLimiter(db, limit, windowMs))
  app.addHook('onRequest', async req => {
    const pattern = req.routeOptions?.url
    if (!pattern) return
    const key = `${req.method} ${pattern}`
    const limiter =
      limiters.get(key) ??
      (pattern.startsWith('/admin/') ? limiters.get('* /admin/*') : undefined)
    if (limiter) await enforce(limiter, `${key}|${req.ip}`)
  })

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ApiError)
      return reply.status(err.status).send({error: err.code})
    if (err instanceof ZodError)
      return reply.status(400).send({error: 'invalid_request'})
    if (err instanceof MoneyError)
      return reply.status(400).send({error: 'invalid_amount'})
    const status = (err as {statusCode?: number}).statusCode
    if (status && status >= 400 && status < 500)
      return reply.status(status).send({error: 'bad_request'})
    // Logged server-side only (message + stack, no request body).
    _req.log.error({err}, 'unhandled_error')
    return reply.status(500).send({error: 'internal_error'})
  })

  const user = (req: FastifyRequest) =>
    authenticate(req.headers, config, deps.getSigningKey)
  const devOnly = () => {
    if (config.env === 'production' || !config.devAuth) throw notFound()
  }

  /** Liveness + database reachability. No details for anonymous callers. */
  app.get('/health', async (_req, reply) => {
    try {
      await db.query('select 1')
      return {ok: true}
    } catch {
      return reply.status(503).send({ok: false})
    }
  })

  // ------------------------------------------------------------ dev helpers
  /** Simulated age assurance result — the real provider replaces this. */
  app.post('/dev/age-verification', async req => {
    devOnly()
    const did = await user(req)
    await db.query(
      `insert into adult_accounts (did, age_verified_at, age_verification_ref)
       values ($1, now(), 'dev-simulated')
       on conflict (did) do update set age_verified_at = now(), age_verification_ref = 'dev-simulated'`,
      [did],
    )
    return {verified: true}
  })

  /** Simulated creator approval — FASE 14 builds the real review flow. */
  app.post('/dev/creator-approval', async req => {
    devOnly()
    const did = await user(req)
    const body = z
      .object({handle: z.string().max(253).optional()})
      .parse(req.body ?? {})
    const [row] = await db.query(
      `insert into creators (id, did, handle, status) values ($1, $2, $3, 'approved')
       on conflict (did) do update set status = 'approved' returning id`,
      [newId('cr'), did, body.handle ?? null],
    )
    return {creatorId: row.id}
  })

  // ------------------------------------------------------------ adult entry
  /** Which basis (if any) lets this user inside +18 right now. */
  app.get('/me/adult/access', async req => {
    const did = await user(req)
    const s = await adultAccessStatus(db, did)
    return {
      allowed: !!s.basis,
      basis: s.basis,
      verified: s.verified,
      selfDeclared: s.selfDeclared,
      selfDeclaredAt: s.selfDeclaredAt,
      policyVersion: s.policyVersion,
      ageVerificationRequired: s.ageVerificationRequired,
    }
  })

  /**
   * Records the temporary self-declaration of majority. Never touches
   * age_verified_at: a declaration is not a verification. While the
   * verification gate is on, it is recorded but grants nothing.
   */
  app.post('/me/adult/self-declaration', async req => {
    const did = await user(req)
    const body = z
      .object({
        declaration: z.literal('adult'),
        policyVersion: z.string().min(1).max(40),
      })
      .parse(req.body)
    await db.query(
      `insert into adult_accounts (did, self_declared_at, self_declaration_policy_version)
       values ($1, now(), $2)
       on conflict (did) do update
         set self_declared_at = now(), self_declaration_policy_version = excluded.self_declaration_policy_version`,
      [did, body.policyVersion],
    )
    await audit(db, {
      actor: did,
      action: 'adult.self_declaration',
      reason: body.policyVersion,
      result: 'ok',
    })
    const s = await adultAccessStatus(db, did)
    return {allowed: !!s.basis, basis: s.basis}
  })

  // ------------------------------------------------------------ access
  app.post('/access/check', async req => {
    const did = await user(req)
    const body = resourceRef.parse(req.body)
    const {decision} = await checkAccess(db, did, {
      type: body.resourceType,
      id: body.resourceId,
    })
    return decision
  })

  app.get('/me/entitlements', async req => {
    const did = await user(req)
    return {entitlements: await listUserEntitlements(db, did)}
  })

  // ------------------------------------------------------------ creator resources
  app.post('/creator/resources', async req => {
    const did = await user(req)
    const creator = await getApprovedCreatorForDid(db, did)
    const body = resourceRef
      .extend({
        accessPolicy: z.enum([
          'free',
          'follower_only',
          'subscriber_only',
          'tier_required',
          'ppv_required',
          'purchase_required',
          'rental_required',
        ]),
        requiredTierId: z.string().optional(),
      })
      .parse(req.body)
    if (!['post', 'image_set', 'audio'].includes(body.resourceType))
      throw badRequest('unsupported_resource_type')
    // A creator can only register records from their own AT repo.
    if (!body.resourceId.startsWith(`at://${did}/`))
      throw forbidden('not_owner')
    if (body.accessPolicy === 'tier_required') {
      const [tier] = await db.query(
        `select 1 from subscription_tiers where id = $1 and owner_type = 'creator' and owner_id = $2`,
        [body.requiredTierId, creator.id],
      )
      if (!tier) throw badRequest('invalid_tier')
    }
    const [existing] = await db.query(
      `select creator_id from adult_resources where resource_type = $1 and resource_id = $2`,
      [body.resourceType, body.resourceId],
    )
    if (existing && existing.creator_id !== creator.id)
      throw forbidden('not_owner')
    await db.query(
      `insert into adult_resources (resource_type, resource_id, creator_id, access_policy, required_tier_id)
       values ($1, $2, $3, $4, $5)
       on conflict (resource_type, resource_id)
       do update set access_policy = excluded.access_policy, required_tier_id = excluded.required_tier_id`,
      [
        body.resourceType,
        body.resourceId,
        creator.id,
        body.accessPolicy,
        body.requiredTierId ?? null,
      ],
    )
    return {ok: true}
  })

  // ------------------------------------------------------------ tiers & offers
  const tierBody = z.object({
    sellerType: z.enum(['creator', 'studio']).default('creator'),
    sellerId: z.string().optional(),
    name: z.string().min(1).max(60),
    description: z.string().max(1000).optional(),
    priceMinor: z.union([z.number(), z.string()]),
    currency: z.string().length(3),
    billingPeriod: z.enum(['month', 'year']),
    benefits: z.array(z.string().max(200)).max(20).optional(),
  })

  const sellerIdFor = async (
    did: string,
    sellerType: string,
    sellerId?: string,
  ) => {
    if (sellerType === 'creator')
      return (await getApprovedCreatorForDid(db, did)).id
    if (!sellerId) throw badRequest('seller_id_required')
    return sellerId
  }

  app.post('/creator/tiers', async req => {
    const did = await user(req)
    const body = tierBody.parse(req.body)
    const sellerId = await sellerIdFor(did, body.sellerType, body.sellerId)
    return createTier(db, did, {...body, sellerId})
  })

  app.patch('/creator/tiers/:id', async req => {
    const did = await user(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const body = tierBody
      .pick({name: true, description: true, benefits: true, priceMinor: true})
      .partial()
      .extend({active: z.boolean().optional()})
      .parse(req.body)
    await updateTier(db, did, id, body)
    return {ok: true}
  })

  app.get('/sellers/:type/:id/tiers', async req => {
    await user(req)
    const {type, id} = z
      .object({type: z.enum(['creator', 'studio']), id: z.string()})
      .parse(req.params)
    const rows = await db.query(
      `select t.id, t.name, t.description, t.price_minor, t.currency, t.billing_period, t.benefits,
              o.id as offer_id
         from subscription_tiers t
         join offers o on o.tier_id = t.id and o.kind = 'subscription' and o.active
        where t.owner_type = $1 and t.owner_id = $2 and t.active
          and case when $1 = 'creator'
                   then exists (select 1 from creators c where c.id = $2 and c.subscriptions_enabled)
                   else exists (select 1 from studios s where s.id = $2 and s.subscriptions_enabled) end
        order by t.price_minor`,
      [type, id],
    )
    return {
      tiers: rows.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        priceMinor: String(r.price_minor),
        currency: r.currency,
        billingPeriod: r.billing_period,
        benefits: r.benefits,
        offerId: r.offer_id,
      })),
    }
  })

  app.post('/creator/offers', async req => {
    const did = await user(req)
    const body = resourceRef
      .extend({
        sellerType: z.enum(['creator', 'studio']).default('creator'),
        sellerId: z.string().optional(),
        kind: z.enum(['ppv', 'purchase', 'rental']),
        priceMinor: z.union([z.number(), z.string()]),
        currency: z.string().length(3),
        accessHours: z
          .number()
          .int()
          .positive()
          .max(24 * 365)
          .optional(),
      })
      .parse(req.body)
    const sellerId = await sellerIdFor(did, body.sellerType, body.sellerId)
    return createOffer(db, did, {
      ...body,
      sellerId,
      resource: {type: body.resourceType, id: body.resourceId},
    })
  })

  app.get('/offers/:id', async req => {
    await user(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const [o] = await db.query(
      `select * from offers where id = $1 and active`,
      [id],
    )
    if (!o) throw notFound()
    return {
      id: o.id,
      kind: o.kind,
      resourceType: o.resource_type,
      resourceId: o.resource_id,
      priceMinor: String(o.price_minor),
      currency: o.currency,
      accessHours: o.access_hours,
    }
  })

  // ------------------------------------------------------------ orders
  app.post('/checkout', async req => {
    const did = await user(req)
    const body = z
      .object({
        offerId: z.string().min(1),
        idempotencyKey: z.string().min(8).max(100),
      })
      .parse(req.body)
    return checkout(db, defaultProvider(), did, body)
  })

  app.get('/me/orders', async req => {
    const did = await user(req)
    const rows = await db.query(
      `select * from orders where buyer_did = $1 order by created_at desc limit 200`,
      [did],
    )
    return {orders: rows.map(publicOrder)}
  })

  app.get('/orders/:id', async req => {
    const did = await user(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    // Scoped by buyer in the query itself: other users' orders are "not found".
    const [o] = await db.query(
      `select * from orders where id = $1 and buyer_did = $2`,
      [id, did],
    )
    if (!o) throw notFound()
    return publicOrder(o)
  })

  app.get('/me/subscriptions', async req => {
    const did = await user(req)
    const rows = await db.query(
      `select id, target_type, target_id, tier_id, status, current_period_end, cancel_at_period_end
         from subscriptions where subscriber_did = $1 order by created_at desc`,
      [did],
    )
    return {subscriptions: rows}
  })

  app.post('/subscriptions/:id/cancel', async req => {
    const did = await user(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    await cancelSubscription(db, defaultProvider(), did, id)
    return {ok: true}
  })

  // ------------------------------------------------------------ webhooks
  app.post('/webhooks/payments/:provider', async (req, reply) => {
    const {provider: name} = z.object({provider: z.string()}).parse(req.params)
    const provider = providers.get(name)
    if (!provider) throw notFound()
    let event
    try {
      event = provider.verifyWebhook(req.rawBody ?? '', req.headers)
    } catch (e) {
      if (e instanceof WebhookVerificationError) {
        await audit(db, {
          actor: null,
          action: 'webhook.rejected',
          resourceType: 'provider',
          resourceId: name,
          result: 'denied',
        })
        return reply.status(400).send({error: 'invalid_signature'})
      }
      throw e
    }
    const result = await applyPaymentEvent(db, name, event)
    return {result}
  })

  /** Dev stand-in for the provider's hosted checkout page. */
  app.post('/dev/mock-checkout/:ref/complete', async req => {
    devOnly()
    const did = await user(req)
    const {ref} = z.object({ref: z.string()}).parse(req.params)
    const body = z
      .object({outcome: z.enum(['succeed', 'fail'])})
      .parse(req.body)
    const mock = providers.get('mock') as MockPaymentProvider | undefined
    if (!mock) throw notFound()
    const [order] = await db.query(
      `select * from orders where provider_reference = $1 and buyer_did = $2`,
      [ref, did],
    )
    if (!order) throw notFound()
    const signed = mock.signEvent({
      type: body.outcome === 'succeed' ? 'payment.succeeded' : 'payment.failed',
      providerReference: ref,
      amountMinor: BigInt(order.total_minor),
      currency: order.currency,
    })
    // Delivered through the real webhook route: same verification path.
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/payments/mock',
      headers: {...signed.headers, 'content-type': 'application/json'},
      payload: signed.rawBody,
    })
    return res.json()
  })

  // ------------------------------------------------------------ ledger
  app.get('/creator/ledger', async req => {
    const did = await user(req)
    const creator = await getApprovedCreatorForDid(db, did)
    return {balances: await ledgerSummary(db, 'creator', creator.id)}
  })

  installRoutes({
    config,
    db,
    getSigningKey: deps.getSigningKey,
    app,
    providers,
    media,
    user,
    devOnly,
  })

  return app
}
