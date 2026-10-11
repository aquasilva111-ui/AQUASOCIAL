export type FeedsEnv = 'development' | 'test' | 'production'

export interface Config {
  env: FeedsEnv
  port: number
  host: string
  /** Domínio público do serviço (did:web). Ex.: feeds.aquaapp.systems */
  hostname: string
  /** DID do serviço (did:web:<hostname> por padrão). */
  serviceDid: string
  /** DID da conta que publica o registro app.bsky.feed.generator. */
  publisherDid: string
  feedRkey: string
  feedUri: string
  databaseUrl?: string
  pgliteDir: string
  jetstreamEnabled: boolean
  jetstreamUrl: string
  /** Idiomas aceitos (vazio = todos). */
  langs: string[]
  /** Se preenchido, só posts destes autores entram (rede própria da Aqua). */
  authorDids: string[]
  retentionHours: number
  maxPerAuthor: number
  minEngagement: number
  snapshotSize: number
  refreshSeconds: number
  snapshotTtlMinutes: number
  /** "Pra você": feed por Convenções de Realidade, explicável */
  forYouEnabled: boolean
  forYouRkey: string
  forYouUri: string
  /** dias de sinais guardados por usuário (a gravidade usa meia-vida de 14 dias) */
  signalRetentionDays: number
  /** de quanto em quanto tempo a atividade vira um commit "inferido" no Git pessoal */
  digestHours: number
  /** JSON com as categorias sensíveis (vazio = lista padrão em conventions/sensitive.ts) */
  sensitiveCategoriesFile: string
  /** só dev/teste: aceita o cabeçalho X-Aqua-Viewer no lugar do JWT */
  authDevViewerHeader: boolean
}

const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : fallback
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = (env.AQUA_FEEDS_ENV ?? env.NODE_ENV ?? 'development') as FeedsEnv
  const isProd = mode === 'production'
  const hostname = env.FEEDGEN_HOSTNAME ?? 'localhost'
  const serviceDid = env.FEEDGEN_SERVICE_DID ?? `did:web:${hostname}`
  const publisherDid = env.FEEDGEN_PUBLISHER_DID ?? ''
  const feedRkey = env.FEED_RKEY ?? 'em-alta'
  if (isProd) {
    const missing = [
      !env.FEEDGEN_HOSTNAME && 'FEEDGEN_HOSTNAME',
      !publisherDid && 'FEEDGEN_PUBLISHER_DID',
      !env.DATABASE_URL && 'DATABASE_URL',
    ].filter(Boolean)
    if (missing.length)
      throw new Error(`Faltam variáveis em produção: ${missing.join(', ')}`)
  }
  return {
    env: mode,
    port: num(env.PORT, 3020),
    host: env.HOST ?? (isProd ? '0.0.0.0' : '127.0.0.1'),
    hostname,
    serviceDid,
    publisherDid,
    feedRkey,
    feedUri: `at://${publisherDid || serviceDid}/app.bsky.feed.generator/${feedRkey}`,
    databaseUrl: env.DATABASE_URL || undefined,
    pgliteDir: env.PGLITE_DIR ?? '.data/pglite',
    jetstreamEnabled: (env.JETSTREAM_ENABLED ?? '1') === '1',
    jetstreamUrl:
      env.JETSTREAM_URL ?? 'wss://jetstream2.us-east.bsky.network/subscribe',
    langs: list(env.FEED_LANGS ?? 'pt').map(l => l.toLowerCase()),
    authorDids: list(env.FEED_AUTHOR_DIDS),
    retentionHours: num(env.RETENTION_HOURS, 72),
    maxPerAuthor: num(env.MAX_PER_AUTHOR, 3),
    minEngagement: num(env.MIN_ENGAGEMENT, 1),
    snapshotSize: num(env.SNAPSHOT_SIZE, 1000),
    refreshSeconds: num(env.REFRESH_SECONDS, 120),
    snapshotTtlMinutes: num(env.SNAPSHOT_TTL_MINUTES, 60),
    forYouEnabled: (env.FOR_YOU_ENABLED ?? '1') === '1',
    forYouRkey: env.FOR_YOU_RKEY ?? 'pra-voce',
    forYouUri: `at://${publisherDid || serviceDid}/app.bsky.feed.generator/${env.FOR_YOU_RKEY ?? 'pra-voce'}`,
    signalRetentionDays: num(env.SIGNAL_RETENTION_DAYS, 180),
    digestHours: num(env.DIGEST_HOURS, 6),
    sensitiveCategoriesFile: env.SENSITIVE_CATEGORIES_FILE ?? '',
    authDevViewerHeader: !isProd && env.AUTH_DEV_VIEWER_HEADER === '1',
  }
}
