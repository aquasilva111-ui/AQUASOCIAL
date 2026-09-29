import {z} from 'zod'

import {getApprovedCreatorForDid} from '../economy/index.js'
import {notFound} from '../lib/errors.js'
import {registerRoutes} from '../registry.js'

registerRoutes(ctx => {
  const {app, db, media} = ctx

  /** Temporary upload authorization for an approved creator. */
  app.post('/media/uploads', async req => {
    const did = await ctx.user(req)
    // Approved creators, or studio staff allowed to edit titles.
    const [staff] = await db.query(
      `select 1 from studio_members where member_did = $1 and role in ('OWNER', 'ADMIN', 'EDITOR') limit 1`,
      [did],
    )
    if (!staff) await getApprovedCreatorForDid(db, did)
    const body = z
      .object({
        kind: z.enum(['video', 'image', 'captions']),
        purpose: z
          .enum(['original', 'preview', 'poster', 'thumbnail', 'captions'])
          .default('original'),
        mimeType: z.string().max(100),
        sizeBytes: z.number().int().positive(),
      })
      .parse(req.body)
    return media.createUpload(did, body)
  })

  /**
   * Receives bytes for a one-time upload token. In production this is a
   * presigned PUT straight to the private bucket instead of the API.
   */
  app.put('/media/upload/:token', async req => {
    const {token} = z
      .object({token: z.string().min(20).max(100)})
      .parse(req.params)
    const length = Number(req.headers['content-length'])
    return media.receiveUpload(
      token,
      req.body as any,
      Number.isFinite(length) ? length : undefined,
    )
  })

  app.get('/media/assets/:id', async req => {
    const did = await ctx.user(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const [a] = await db.query(
      `select id, kind, purpose, status, mime_type, size_bytes, duration_ms, width, height, created_at
         from media_assets where id = $1 and owner_did = $2`,
      [id, did],
    )
    if (!a) throw notFound()
    const variants = await db.query(
      `select kind from media_variants where asset_id = $1`,
      [id],
    )
    return {
      ...a,
      size_bytes: a.size_bytes == null ? null : String(a.size_bytes),
      variants: variants.map(v => v.kind),
    }
  })

  /** Signed, short-lived media delivery. No bucket URLs ever leave the API. */
  app.get('/stream/:token/*', async (req, reply) => {
    const params = req.params as {token: string; '*': string}
    const file = await media.open(params.token, params['*'])
    reply
      .header('cache-control', `private, max-age=${Math.min(file.maxAge, 300)}`)
      .header('content-length', file.size)
      .type(file.mime)
    return reply.send(file.stream)
  })
})
