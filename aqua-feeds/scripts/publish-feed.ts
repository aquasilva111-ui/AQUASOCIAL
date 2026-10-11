// Publica (ou atualiza) o registro app.bsky.feed.generator na conta da Aqua.
// Uso: FEEDGEN_HANDLE=... FEEDGEN_APP_PASSWORD=... FEEDGEN_HOSTNAME=... npm run publish-feed
// Use uma senha de app (Configurações → Senhas de app), nunca a senha principal.
import {AtpAgent} from '@atproto/api'

const env = process.env
const need = (k: string) => {
  const v = env[k]
  if (!v) throw new Error(`Defina ${k}`)
  return v
}

const service = env.FEEDGEN_PDS_URL ?? 'https://bsky.social'
const handle = need('FEEDGEN_HANDLE')
const password = need('FEEDGEN_APP_PASSWORD')
const serviceDid =
  env.FEEDGEN_SERVICE_DID ?? `did:web:${need('FEEDGEN_HOSTNAME')}`
const rkey = env.FEED_RKEY ?? 'em-alta'

const agent = new AtpAgent({service})
await agent.login({identifier: handle, password})
const repo = agent.session!.did

const record = {
  $type: 'app.bsky.feed.generator',
  did: serviceDid,
  displayName: env.FEED_DISPLAY_NAME ?? 'Em alta na Aqua',
  description:
    env.FEED_DESCRIPTION ??
    'O que está bombando na Aqua agora: curtidas, reposts e respostas das últimas horas, com no máximo alguns posts por pessoa.',
  createdAt: new Date().toISOString(),
}

await agent.com.atproto.repo.putRecord({
  repo,
  collection: 'app.bsky.feed.generator',
  rkey,
  record,
})
console.log(`Publicado: at://${repo}/app.bsky.feed.generator/${rkey}`)
console.log(
  `Defina FEEDGEN_PUBLISHER_DID=${repo} no serviço e EXPO_PUBLIC_AQUA_HOT_FEED_URI no app.`,
)
