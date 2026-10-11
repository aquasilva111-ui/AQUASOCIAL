import {serve} from '@hono/node-server'

import {createForYou} from './algos/for-you/feed.ts'
import {createApp} from './app.ts'
import {createAuth} from './auth.ts'
import {loadConfig} from './config.ts'
import {createPgDb, createPgliteDb, migrate} from './db.ts'
import {createFeed} from './feed.ts'
import {startJetstream} from './jetstream.ts'
import {createStore} from './store.ts'

const cfg = loadConfig()
const db = cfg.databaseUrl
  ? await createPgDb(cfg.databaseUrl)
  : await createPgliteDb(cfg.pgliteDir)
await migrate(db)
const store = createStore(db)
await store.loadKnown()
const feed = createFeed(store, cfg)
const forYou = createForYou(store, cfg)
const auth = createAuth(cfg)

const jetstream = cfg.jetstreamEnabled
  ? startJetstream({
      url: cfg.jetstreamUrl,
      store,
      filter: {langs: cfg.langs, authorDids: cfg.authorDids},
    })
  : undefined

// Ranking e limpeza em segundo plano.
const timers = [
  setInterval(
    () => feed.refresh().catch(e => console.error('refresh', e)),
    cfg.refreshSeconds * 1000,
  ),
  setInterval(
    () =>
      store
        .prune(
          Date.now(),
          cfg.retentionHours,
          cfg.snapshotTtlMinutes,
          cfg.signalRetentionDays,
        )
        .catch(e => console.error('prune', e)),
    10 * 60_000,
  ),
]

const server = serve(
  {fetch: createApp(cfg, feed, {forYou, auth}).fetch, port: cfg.port, hostname: cfg.host},
  () =>
    console.log(
      `aqua-feeds (${cfg.env}) em http://${cfg.host}:${cfg.port} — feeds ${cfg.feedUri}${cfg.forYouEnabled ? ` e ${cfg.forYouUri}` : ''}`,
    ),
)

const shutdown = async () => {
  timers.forEach(clearInterval)
  await jetstream?.stop()
  server.close()
  await db.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
