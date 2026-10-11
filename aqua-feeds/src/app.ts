import {Hono} from 'hono'

import {
  BadCursorError as ForYouCursorError,
  type ForYou,
  InvalidAdjustmentError,
} from './algos/for-you/feed.ts'
import {AuthError, type ViewerAuth} from './auth.ts'
import type {Config} from './config.ts'
import type {SignalKind} from './conventions/profile.ts'
import {BadCursorError, type Feed} from './feed.ts'

/** Documento did:web que diz ao AppView onde o feed generator responde. */
export function didDocument(cfg: Config) {
  return {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: cfg.serviceDid,
    service: [
      {
        id: '#bsky_fg',
        type: 'BskyFeedGenerator',
        serviceEndpoint: `https://${cfg.hostname}`,
      },
    ],
  }
}

export interface ForYouDeps {
  forYou: ForYou
  auth: ViewerAuth
}

const AT_URI = /^at:\/\/did:[a-z]+:[a-zA-Z0-9._:%-]+\/app\.bsky\.feed\.post\/[a-zA-Z0-9._~:-]{1,512}$/

export function createApp(cfg: Config, feed: Feed, deps?: ForYouDeps) {
  const app = new Hono()
  const forYouOn = Boolean(deps && cfg.forYouEnabled)

  /** DID de quem pede (JWT de serviço). `required`: 401 se não houver. */
  async function viewerOf(
    c: {req: {header: (n: string) => string | undefined}},
    lxm: string,
  ) {
    return deps!.auth(
      {
        authorization: c.req.header('authorization'),
        devViewer: c.req.header('x-aqua-viewer'),
      },
      lxm,
    )
  }

  app.get('/health', c => c.json({ok: true}))

  app.get('/.well-known/did.json', c => {
    if (!cfg.serviceDid.startsWith('did:web:'))
      return c.json({error: 'NotFound'}, 404)
    return c.json(didDocument(cfg))
  })

  app.get('/xrpc/app.bsky.feed.describeFeedGenerator', c =>
    c.json({
      did: cfg.serviceDid,
      feeds: [{uri: cfg.feedUri}, ...(forYouOn ? [{uri: cfg.forYouUri}] : [])],
    }),
  )

  app.get('/xrpc/app.bsky.feed.getFeedSkeleton', async c => {
    const feedParam = c.req.query('feed')
    const isForYou = forYouOn && feedParam === cfg.forYouUri
    if (feedParam !== cfg.feedUri && !isForYou) {
      return c.json(
        {error: 'UnsupportedAlgorithm', message: 'Feed desconhecido'},
        400,
      )
    }
    const rawLimit = c.req.query('limit')
    const limit = rawLimit === undefined ? undefined : Number(rawLimit)
    if (
      limit !== undefined &&
      (!Number.isInteger(limit) || limit < 1 || limit > 100)
    ) {
      return c.json(
        {error: 'InvalidRequest', message: 'limit deve ser 1–100'},
        400,
      )
    }
    try {
      if (isForYou) {
        // Sem login (ou token inválido) o "Pra você" vira um feed genérico.
        const viewer = await viewerOf(c, 'app.bsky.feed.getFeedSkeleton').catch(
          () => undefined,
        )
        return c.json(
          await deps!.forYou.skeleton({viewer, cursor: c.req.query('cursor'), limit}),
        )
      }
      const out = await feed.skeleton({cursor: c.req.query('cursor'), limit})
      return c.json(out)
    } catch (e) {
      if (e instanceof BadCursorError || e instanceof ForYouCursorError)
        return c.json({error: 'BadCursor', message: e.message}, 400)
      throw e
    }
  })

  if (forYouOn) mountForYou(app, deps!, viewerOf)

  app.onError((err, c) => {
    if (err instanceof AuthError)
      return c.json({error: 'AuthRequired', message: err.message}, 401)
    if (err instanceof InvalidAdjustmentError)
      return c.json({error: 'InvalidRequest', message: err.message}, 400)
    console.error(err)
    return c.json({error: 'InternalServerError'}, 500)
  })

  return app
}

const INTERACTION_KIND: Record<string, SignalKind> = {
  'app.bsky.feed.defs#requestLess': 'less',
  'app.bsky.feed.defs#requestMore': 'more',
  'app.bsky.feed.defs#interactionSeen': 'seen',
  'app.bsky.feed.defs#interactionLike': 'like',
  'app.bsky.feed.defs#interactionRepost': 'repost',
  'app.bsky.feed.defs#interactionReply': 'reply',
}

function mountForYou(
  app: Hono,
  deps: ForYouDeps,
  viewerOf: (
    c: {req: {header: (n: string) => string | undefined}},
    lxm: string,
  ) => Promise<string | undefined>,
) {
  const need = async (
    c: {req: {header: (n: string) => string | undefined}},
    lxm: string,
  ) => {
    const did = await viewerOf(c, lxm)
    if (!did) throw new AuthError('faça login (JWT de serviço)')
    return did
  }
  const body = async (c: {req: {json: () => Promise<unknown>}}) => {
    const b = await c.req.json().catch(() => undefined)
    if (!b || typeof b !== 'object') throw new InvalidAdjustmentError('JSON inválido')
    return b as Record<string, unknown>
  }

  // Interações que o app manda pelo AppView (mostrar mais/menos, visto…).
  // Curtidas/reposts/respostas já chegam pelo Jetstream; aqui só os sem registro.
  app.post('/xrpc/app.bsky.feed.sendInteractions', async c => {
    const did = await need(c, 'app.bsky.feed.sendInteractions')
    const b = await body(c)
    const list = Array.isArray(b.interactions) ? b.interactions.slice(0, 100) : []
    let aceitas = 0
    for (const i of list as Array<{item?: unknown; event?: unknown}>) {
      const kind = INTERACTION_KIND[String(i?.event)]
      if (!kind || !['less', 'more', 'seen'].includes(kind)) continue
      if (typeof i.item !== 'string' || !AT_URI.test(i.item)) continue
      await deps.forYou.addSignal(did, kind, i.item)
      aceitas++
    }
    return c.json({aceitas})
  })

  // Sinais que não existem no protocolo: salvar e tempo de leitura.
  app.post('/xrpc/place.aqua.feed.sendSignals', async c => {
    const did = await need(c, 'place.aqua.feed.sendSignals')
    const b = await body(c)
    const list = Array.isArray(b.signals) ? b.signals.slice(0, 100) : []
    let aceitas = 0
    for (const s of list as Array<{kind?: unknown; uri?: unknown; seconds?: unknown}>) {
      if (s?.kind !== 'save' && s?.kind !== 'dwell') continue
      if (typeof s.uri !== 'string' || !AT_URI.test(s.uri)) continue
      const seconds = s.kind === 'dwell' ? Math.min(600, Math.max(0, Number(s.seconds) || 0)) : undefined
      await deps.forYou.addSignal(did, s.kind, s.uri, seconds)
      aceitas++
    }
    return c.json({aceitas})
  })

  app.get('/xrpc/place.aqua.feed.explain', async c => {
    const uri = c.req.query('uri') ?? ''
    if (!AT_URI.test(uri))
      return c.json({error: 'InvalidRequest', message: 'uri de post inválida'}, 400)
    const viewer = await viewerOf(c, 'place.aqua.feed.explain')
    const out = await deps.forYou.explain(viewer, uri)
    if (!out)
      return c.json({error: 'NotFound', message: 'post fora da janela do feed'}, 404)
    return c.json(out)
  })

  app.get('/xrpc/place.aqua.convencoes.getProfile', async c => {
    const did = await need(c, 'place.aqua.convencoes.getProfile')
    return c.json(await deps.forYou.getProfile(did))
  })

  app.get('/xrpc/place.aqua.convencoes.getHistory', async c => {
    const did = await need(c, 'place.aqua.convencoes.getHistory')
    const limit = Number(c.req.query('limit') ?? 50)
    return c.json(
      await deps.forYou.getHistory(
        did,
        c.req.query('key') || undefined,
        Number.isInteger(limit) && limit > 0 ? limit : 50,
      ),
    )
  })

  app.post('/xrpc/place.aqua.convencoes.adjust', async c => {
    const did = await need(c, 'place.aqua.convencoes.adjust')
    return c.json(await deps.forYou.adjust(did, await body(c)))
  })
}
