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

function read(env: Record<string, string | undefined>, key: string): string {
  return (env[key] ?? '').trim()
}

function flag(value: string): boolean {
  return value === 'true' || value === '1'
}

/**
 * Outside a production build, signup stays off until the URL and the flag
 * are set. A production build (EXPO_PUBLIC_ENV=production) defaults to the
 * live AQUA PDS. An explicit false still turns signup off.
 */
export function readAquaIdentityConfig(
  env: Record<string, string | undefined> = typeof process === 'undefined'
    ? {}
    : process.env,
): AquaIdentityConfig {
  const pdsUrl =
    read(env, 'EXPO_PUBLIC_AQUA_PDS_URL').replace(/\/$/, '') ||
    configuredAquaPdsUrl(env)
  const signupFlag = read(env, 'EXPO_PUBLIC_AQUA_PDS_SIGNUP_ENABLED')
    ? flag(read(env, 'EXPO_PUBLIC_AQUA_PDS_SIGNUP_ENABLED'))
    : configuredSignupEnabled(env)
  const handleFromEnv = read(env, 'EXPO_PUBLIC_AQUA_HANDLE_DOMAIN')
    .replace(/^\.+/, '')
    .toLowerCase()
  return {
    origin: read(env, 'EXPO_PUBLIC_AQUA_IDENTITY_ORIGIN').replace(/\/$/, ''),
    handleDomain: handleFromEnv || configuredHandleDomain(env),
    pdsUrl,
    pdsSignupEnabled: signupFlag && pdsUrl.length > 0,
    inviteRequired: flag(
      read(env, 'EXPO_PUBLIC_AQUA_IDENTITY_INVITE_REQUIRED'),
    ),
    captchaEnabled: flag(
      read(env, 'EXPO_PUBLIC_AQUA_IDENTITY_CAPTCHA_ENABLED'),
    ),
    captchaSiteKey: read(env, 'EXPO_PUBLIC_AQUA_IDENTITY_CAPTCHA_SITE_KEY'),
    handleResolver:
      read(env, 'EXPO_PUBLIC_AQUA_IDENTITY_HANDLE_RESOLVER').replace(
        /\/$/,
        '',
      ) || 'https://bsky.social',
    plcDirectoryUrl:
      read(env, 'EXPO_PUBLIC_AQUA_IDENTITY_PLC_URL').replace(/\/$/, '') ||
      'https://plc.directory',
    dohUrl:
      read(env, 'EXPO_PUBLIC_AQUA_IDENTITY_DOH_URL') ||
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
