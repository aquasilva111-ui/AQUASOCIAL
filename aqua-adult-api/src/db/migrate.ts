import {loadConfig} from '../config.js'
import {createPgDb, createPgliteDb, migrate} from './index.js'

const config = loadConfig()
const db = config.databaseUrl
  ? await createPgDb(config.databaseUrl)
  : await createPgliteDb(config.pgliteDir)
console.log('applied:', await migrate(db))
await db.close()
