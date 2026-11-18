import {createServer} from 'node:http'

import {createIdentityApp} from './app.ts'
import {publicDirectory, readServiceConfig} from './config.ts'

/**
 * Does not listen unless AQUA_IDENTITY_ENABLE_SERVER=true.
 * The static site does not start this process and does not publish it.
 */
export async function main() {
  if ((process.env.AQUA_IDENTITY_ENABLE_SERVER ?? '').trim() !== 'true') {
    console.error(
      'Refusing to start. Set AQUA_IDENTITY_ENABLE_SERVER=true only on the separate identity service.',
    )
    process.exitCode = 1
    return
  }
  const loaded = readServiceConfig(process.env)
  if (!loaded.ok) {
    console.error(loaded.reason)
    process.exitCode = 1
    return
  }
  const app = await createIdentityApp(loaded.config)
  const server = createServer((req, res) => {
    void app.handle(req, res)
  })
  const {port, host} = loaded.config
  await new Promise<void>(resolve => {
    server.listen(port, host, () => resolve())
  })
  const directory = publicDirectory(loaded.config)
  console.log(`AQUA Identity service listening on ${host}:${port}`)
  console.log(
    `providers ${directory.providers.join(',') || 'none'} atproto ${directory.atproto}`,
  )
}

const entry = process.argv[1] ?? ''
if (entry.endsWith('server.ts') || entry.endsWith('server.js')) {
  void main()
}
