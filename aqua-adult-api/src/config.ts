import {randomBytes} from 'node:crypto'

export type AquaEnv = 'development' | 'test' | 'production'

export type Config = {
  env: AquaEnv
  /** DID this service answers to; service-auth tokens must be addressed to it. */
  serviceDid: string
  /** Postgres URL (production). Dev/test use embedded PGlite instead. */
  databaseUrl?: string
  /** PGlite data dir for development; undefined = in-memory (tests). */
  pgliteDir?: string
  /** Accept `x-aqua-dev-did` instead of a signed service token. Never in production. */
  devAuth: boolean
  /** Enables MockPaymentProvider. Refused in production at startup. */
  mockPayments: boolean
  mockWebhookSecret: string
  /** HMAC secret for temporary media authorizations. */
  mediaSigningSecret: string
  /** Seconds a playback authorization stays valid. */
  playbackTtlSeconds: number
  /** Private media root (dev storage adapter). */
  mediaDir: string
  maxUploadBytes: number
  /** Browser origins allowed to call the API (the AQUA web app). */
  corsOrigins: string[]
  /**
   * ADULT_AGE_VERIFICATION_ENABLED. true = only a completed age verification
   * opens +18. false = the temporary self-declaration gate also opens it —
   * recorded as `self_declared`, never as a verification.
   */
  ageVerificationRequired: boolean
  /**
   * Bootstrap SUPERADMIN DIDs (AQUA_SUPERADMIN_DIDS, comma-separated). Every
   * other staff role is granted through the audited staff API.
   */
  superadminDids: string[]
  /** pino level; 'silent' disables logging (tests). */
  logLevel: string
  /** Behind a reverse proxy/CDN, trust X-Forwarded-For for client IPs. */
  trustProxy: boolean
}

function parseEnv(value: string | undefined, nodeEnv?: string): AquaEnv {
  if (value === 'development' || value === 'test' || value === 'production')
    return value
  // Unset or unknown: assume the strictest mode when Node says production.
  return nodeEnv === 'production' ? 'production' : 'development'
}

export class InsecureConfigError extends Error {}

/**
 * Loads config and refuses unsafe combinations. Development conveniences
 * (dev auth, mock payments, generated secrets) cannot be switched on in
 * production — the process fails to start instead.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<Config> = {},
): Config {
  const aquaEnv = overrides.env ?? parseEnv(env.AQUA_ENV, env.NODE_ENV)
  const isProd = aquaEnv === 'production'

  const config: Config = {
    env: aquaEnv,
    serviceDid: env.AQUA_SERVICE_DID ?? 'did:web:adult-api.aqua.localhost',
    databaseUrl: env.DATABASE_URL,
    pgliteDir: aquaEnv === 'development' ? '.data/pglite' : undefined,
    devAuth: !isProd && env.AQUA_DEV_AUTH === '1',
    mockPayments: env.AQUA_ENABLE_MOCK_PAYMENTS === '1',
    mockWebhookSecret:
      env.AQUA_MOCK_WEBHOOK_SECRET ?? randomBytes(32).toString('hex'),
    mediaSigningSecret:
      env.AQUA_MEDIA_SIGNING_SECRET ?? randomBytes(32).toString('hex'),
    playbackTtlSeconds: Number(env.AQUA_PLAYBACK_TTL_SECONDS ?? 300),
    mediaDir: env.AQUA_MEDIA_DIR ?? '.data/media',
    maxUploadBytes: Number(env.AQUA_MAX_UPLOAD_BYTES ?? 2 * 1024 ** 3),
    corsOrigins: (
      env.AQUA_CORS_ORIGINS ??
      (isProd ? '' : 'http://localhost:19006,http://127.0.0.1:19006')
    )
      .split(',')
      .filter(Boolean),
    // Production fails closed: self-declaration must be switched on explicitly.
    ageVerificationRequired:
      env.AQUA_ADULT_AGE_VERIFICATION_ENABLED === '1' ||
      (isProd && env.AQUA_ADULT_AGE_VERIFICATION_ENABLED !== '0'),
    logLevel: env.AQUA_LOG_LEVEL ?? (aquaEnv === 'test' ? 'silent' : 'info'),
    trustProxy: env.AQUA_TRUST_PROXY === '1',
    superadminDids: (env.AQUA_SUPERADMIN_DIDS ?? '')
      .split(',')
      .map(d => d.trim())
      .filter(d => /^did:(plc|web):/.test(d)),
    ...overrides,
  }

  if (isProd) {
    if (config.mockPayments)
      throw new InsecureConfigError('Mock payments cannot run in production.')
    if (config.devAuth)
      throw new InsecureConfigError('Dev auth cannot run in production.')
    if (!env.AQUA_MEDIA_SIGNING_SECRET)
      throw new InsecureConfigError('AQUA_MEDIA_SIGNING_SECRET is required.')
    if (!config.databaseUrl)
      throw new InsecureConfigError('DATABASE_URL is required.')
    if (!env.AQUA_SERVICE_DID)
      throw new InsecureConfigError('AQUA_SERVICE_DID is required.')
  }
  if (
    !Number.isInteger(config.playbackTtlSeconds) ||
    config.playbackTtlSeconds < 30
  )
    throw new InsecureConfigError('Playback TTL must be >= 30 seconds.')
  return config
}
