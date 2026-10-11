// Publica (ou atualiza) o registro app.bsky.feed.generator na conta da Aqua.
// Uso: FEEDGEN_HANDLE=... FEEDGEN_APP_PASSWORD=... FEEDGEN_HOSTNAME=... npm run publish-feed
//   FEED=em-alta (padrão) | pra-voce | todos
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
const which = env.FEED ?? 'em-alta'

const agent = new AtpAgent({service})
await agent.login({identifier: handle, password})
const repo = agent.session!.did

const feeds = {
  'em-alta': {
    rkey: env.FEED_RKEY ?? 'em-alta',
    displayName: env.FEED_DISPLAY_NAME ?? 'Em alta na Aqua',
    description:
      env.FEED_DESCRIPTION ??
      'O que está bombando na Aqua agora: curtidas, reposts e respostas das últimas horas, com no máximo alguns posts por pessoa.',
    acceptsInteractions: false,
    envVar: 'EXPO_PUBLIC_AQUA_HOT_FEED_URI',
  },
  'pra-voce': {
    rkey: env.FOR_YOU_RKEY ?? 'pra-voce',
    displayName: env.FOR_YOU_DISPLAY_NAME ?? 'Pra você',
    description:
      env.FOR_YOU_DESCRIPTION ??
      'Seu feed pelas suas Convenções de Realidade: você vê por que cada post apareceu e ajusta o que pesa em "Minhas Convenções".',
    // o app pode mandar "mostrar mais/menos" (app.bsky.feed.sendInteractions)
    acceptsInteractions: true,
    envVar: 'EXPO_PUBLIC_AQUA_FOR_YOU_FEED_URI',
  },
}
if (which !== 'todos' && !(which in feeds))
  throw new Error(`FEED deve ser em-alta, pra-voce ou todos (recebido: ${which})`)
const chosen =
  which === 'todos' ? Object.values(feeds) : [feeds[which as keyof typeof feeds]]

for (const f of chosen) {
  await agent.com.atproto.repo.putRecord({
    repo,
    collection: 'app.bsky.feed.generator',
    rkey: f.rkey,
    record: {
      $type: 'app.bsky.feed.generator',
      did: serviceDid,
      displayName: f.displayName,
      description: f.description,
      ...(f.acceptsInteractions ? {acceptsInteractions: true} : {}),
      createdAt: new Date().toISOString(),
    },
  })
  const uri = `at://${repo}/app.bsky.feed.generator/${f.rkey}`
  console.log(`Publicado: ${uri}  →  ${f.envVar}=${uri}`)
}
console.log(
  `Defina FEEDGEN_PUBLISHER_DID=${repo} no serviço e as URIs acima no app.`,
)
