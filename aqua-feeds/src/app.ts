import {Hono} from 'hono'

import type {Config} from './config.ts'
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

export function createApp(cfg: Config, feed: Feed) {
  const app = new Hono()

  app.get('/health', c => c.json({ok: true}))

  app.get('/.well-known/did.json', c => {
    if (!cfg.serviceDid.startsWith('did:web:'))
      return c.json({error: 'NotFound'}, 404)
    return c.json(didDocument(cfg))
  })

  app.get('/xrpc/app.bsky.feed.describeFeedGenerator', c =>
    c.json({did: cfg.serviceDid, feeds: [{uri: cfg.feedUri}]}),
  )

  app.get('/xrpc/app.bsky.feed.getFeedSkeleton', async c => {
    const feedParam = c.req.query('feed')
    if (feedParam !== cfg.feedUri) {
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
      const out = await feed.skeleton({cursor: c.req.query('cursor'), limit})
      return c.json(out)
    } catch (e) {
      if (e instanceof BadCursorError)
        return c.json({error: 'BadCursor', message: e.message}, 400)
      throw e
    }
  })

  app.onError((err, c) => {
    console.error(err)
    return c.json({error: 'InternalServerError'}, 500)
  })

  return app
}
