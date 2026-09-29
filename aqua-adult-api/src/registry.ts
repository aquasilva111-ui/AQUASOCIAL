import {type FastifyInstance, type FastifyRequest} from 'fastify'

import {type SigningKeyResolver} from './auth/index.js'
import {type Config} from './config.js'
import {type Db} from './db/index.js'
import {type PaymentProvider} from './economy/payments/provider.js'
import {type MediaEngine} from './media/engine.js'

export type RouteContext = {
  config: Config
  db: Db
  getSigningKey: SigningKeyResolver
  app: FastifyInstance
  providers: Map<string, PaymentProvider>
  media: MediaEngine
  user: (req: FastifyRequest) => Promise<string>
  devOnly: () => void
}

type RoutePlugin = (ctx: RouteContext) => void
const plugins: RoutePlugin[] = []

/** Feature modules (media, views, studios) register their routes here. */
export function registerRoutes(plugin: RoutePlugin) {
  plugins.push(plugin)
}

export function installRoutes(ctx: RouteContext) {
  for (const plugin of plugins) plugin(ctx)
}
