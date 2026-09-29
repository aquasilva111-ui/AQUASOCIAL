import {buildApp} from './app.js'
import {createSigningKeyResolver} from './auth/index.js'
import {loadConfig} from './config.js'
import {createPgDb, createPgliteDb, migrate} from './db/index.js'

const config = loadConfig()
const db = config.databaseUrl
  ? await createPgDb(config.databaseUrl)
  : await createPgliteDb(config.pgliteDir)
await migrate(db)
const app = await buildApp({
  config,
  db,
  getSigningKey: createSigningKeyResolver(),
})
const port = Number(process.env.PORT ?? 4318)
await app.listen({
  port,
  host: config.env === 'production' ? '0.0.0.0' : '127.0.0.1',
})
console.log(`aqua-adult-api (${config.env}) listening on ${port}`)
