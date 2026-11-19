import {
  configuredAquaPdsUrl,
  configuredHandleDomain,
  configuredSignupEnabled,
} from '#/lib/aqua-pds'
import {type AquaIdentityConfig} from './types'

export const AQUA_OAUTH_SCOPE = 'atproto transition:generic'
export const OAUTH_CALLBACK_PATH = '/oauth/callback'
export const OAUTH_METADATA_PATH = '/oauth/client-metadata.json'

const FIFTEEN_MINUTES = 15 * 60 * 1000
const ONE_HOUR = 60 * 60 * 1000

/**
 * Expo inlines EXPO_PUBLIC_* only on a direct `process.env.NAME` read.
 * `env[key]` stays for tests that pass their own map.
 */
const BUILD_ENV: Record<string, string | undefined> = {
  EXPO_PUBLIC_AQUA_IDENTITY_ORIGIN:
    process.env.EXPO_PUBLIC_AQUA_IDENTITY_ORIGIN,
  EXPO_PUBLIC_AQUA_IDENTITY_SERVICE_URL:
    process.env.EXPO_PUBLIC_AQUA_IDENTITY_SERVICE_URL,
  EXPO_PUBLIC_AQUA_HANDLE_DOMAIN: process.env.EXPO_PUBLIC_AQUA_HANDLE_DOMAIN,
  EXPO_PUBLIC_AQUA_PDS_URL: process.env.EXPO_PUBLIC_AQUA_PDS_URL,
  EXPO_PUBLIC_AQUA_PDS_SIGNUP_ENABLED:
    process.env.EXPO_PUBLIC_AQUA_PDS_SIGNUP_ENABLED,
  EXPO_PUBLIC_AQUA_IDENTITY_INVITE_REQUIRED:
    process.env.EXPO_PUBLIC_AQUA_IDENTITY_INVITE_REQUIRED,
  EXPO_PUBLIC_AQUA_IDENTITY_CAPTCHA_ENABLED:
    process.env.EXPO_PUBLIC_AQUA_IDENTITY_CAPTCHA_ENABLED,
  EXPO_PUBLIC_AQUA_IDENTITY_CAPTCHA_SITE_KEY:
    process.env.EXPO_PUBLIC_AQUA_IDENTITY_CAPTCHA_SITE_KEY,
  EXPO_PUBLIC_AQUA_IDENTITY_HANDLE_RESOLVER:
    process.env.EXPO_PUBLIC_AQUA_IDENTITY_HANDLE_RESOLVER,
  EXPO_PUBLIC_AQUA_IDENTITY_PLC_URL:
    process.env.EXPO_PUBLIC_AQUA_IDENTITY_PLC_URL,
  EXPO_PUBLIC_AQUA_IDENTITY_DOH_URL:
    process.env.EXPO_PUBLIC_AQUA_IDENTITY_DOH_URL,
  EXPO_PUBLIC_ENV: process.env.EXPO_PUBLIC_ENV,
}

function read(env: Record<string, string | undefined>, key: string): string {
  return (env[key] ?? '').trim()
}

function flag(value: string): boolean {
  return value === 'true' || value === '1'
}

function serviceOrigin(value: string): string {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    return url.origin
  } catch {
    return ''
  }
}

/**
 * Outside a production build, signup stays off until the URL and the flag
 * are set. A production build (EXPO_PUBLIC_ENV=production) defaults to the
 * live AQUA PDS. An explicit false still turns signup off.
 */
export function readAquaIdentityConfig(
  env?: Record<string, string | undefined>,
): AquaIdentityConfig {
  // Callers that omit env get the build-time map. Comparing to process.env
  // fails after the bundler replaces each process.env with a new object.
  const source = env ?? BUILD_ENV
  const pdsUrl =
    read(source, 'EXPO_PUBLIC_AQUA_PDS_URL').replace(/\/$/, '') ||
    configuredAquaPdsUrl(source)
  const signupRaw = read(source, 'EXPO_PUBLIC_AQUA_PDS_SIGNUP_ENABLED')
  const signupFlag = signupRaw
    ? flag(signupRaw)
    : configuredSignupEnabled(source)
  const handleFromEnv = read(source, 'EXPO_PUBLIC_AQUA_HANDLE_DOMAIN')
    .replace(/^\.+/, '')
    .toLowerCase()
  return {
    origin: read(source, 'EXPO_PUBLIC_AQUA_IDENTITY_ORIGIN').replace(/\/$/, ''),
    serviceUrl: serviceOrigin(
      read(source, 'EXPO_PUBLIC_AQUA_IDENTITY_SERVICE_URL'),
    ),
    handleDomain: handleFromEnv || configuredHandleDomain(source),
    pdsUrl,
    pdsSignupEnabled: signupFlag && pdsUrl.length > 0,
    inviteRequired: flag(
      read(source, 'EXPO_PUBLIC_AQUA_IDENTITY_INVITE_REQUIRED'),
    ),
    captchaEnabled: flag(
      read(source, 'EXPO_PUBLIC_AQUA_IDENTITY_CAPTCHA_ENABLED'),
    ),
    captchaSiteKey: read(source, 'EXPO_PUBLIC_AQUA_IDENTITY_CAPTCHA_SITE_KEY'),
    handleResolver:
      read(source, 'EXPO_PUBLIC_AQUA_IDENTITY_HANDLE_RESOLVER').replace(
        /\/$/,
        '',
      ) || 'https://bsky.social',
    plcDirectoryUrl:
      read(source, 'EXPO_PUBLIC_AQUA_IDENTITY_PLC_URL').replace(/\/$/, '') ||
      'https://plc.directory',
    dohUrl:
      read(source, 'EXPO_PUBLIC_AQUA_IDENTITY_DOH_URL') ||
      'https://cloudflare-dns.com/dns-query',
    stateTtlMs: 10 * 60 * 1000,
    limits: {
      login: {limit: 5, windowMs: FIFTEEN_MINUTES},
      register: {limit: 3, windowMs: ONE_HOUR},
      recovery: {limit: 3, windowMs: ONE_HOUR},
    },
  }
}

export function signupAvailability(
  config: AquaIdentityConfig,
):
  | {enabled: true; pdsUrl: string}
  | {enabled: false; reason: 'pds-unset' | 'pds-signup-disabled'} {
  if (!config.pdsUrl) return {enabled: false, reason: 'pds-unset'}
  if (!config.pdsSignupEnabled) {
    return {enabled: false, reason: 'pds-signup-disabled'}
  }
  return {enabled: true, pdsUrl: config.pdsUrl}
}
