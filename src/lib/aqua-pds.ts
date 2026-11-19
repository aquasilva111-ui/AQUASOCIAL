/**
 * Live AQUA PDS. These are public hostnames, not secrets.
 * Production builds use them when the Expo env vars are left unset.
 * Any other build stays on Bluesky until the vars are set.
 */

export const AQUA_PDS_URL = 'https://pds.aquaapp.online'
export const AQUA_PDS_DID = 'did:web:pds.aquaapp.online'
export const AQUA_HANDLE_DOMAIN = 'aquaapp.online'
export const BSKY_SERVICE_URL = 'https://bsky.social'

type Env = Record<string, string | undefined>

export function isProductionAppEnv(env: Env = process.env): boolean {
  return (env.EXPO_PUBLIC_ENV ?? '').trim() === 'production'
}

export function configuredAquaPdsUrl(env: Env = process.env): string {
  const explicit = (env.EXPO_PUBLIC_AQUA_PDS_URL ?? '')
    .trim()
    .replace(/\/$/, '')
  if (explicit) return explicit
  if (isProductionAppEnv(env)) return AQUA_PDS_URL
  return ''
}

export function configuredHandleDomain(env: Env = process.env): string {
  const explicit = (env.EXPO_PUBLIC_AQUA_HANDLE_DOMAIN ?? '')
    .trim()
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .toLowerCase()
  if (explicit) return explicit
  if (isProductionAppEnv(env)) return AQUA_HANDLE_DOMAIN
  return ''
}

/**
 * Missing flag: on in a production build, off everywhere else.
 * An explicit false stays off, including in production.
 */
export function configuredSignupEnabled(env: Env = process.env): boolean {
  const raw = (env.EXPO_PUBLIC_AQUA_PDS_SIGNUP_ENABLED ?? '').trim()
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  return isProductionAppEnv(env)
}

export function defaultServiceUrl(env: Env = process.env): string {
  return configuredAquaPdsUrl(env) || BSKY_SERVICE_URL
}

export function serviceHost(url: string): string {
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return ''
  }
}

export function isAquaPdsService(
  serviceUrl: string,
  env: Env = process.env,
): boolean {
  const host = serviceHost(serviceUrl)
  if (!host) return false
  const known = [AQUA_PDS_URL, configuredAquaPdsUrl(env)]
    .map(serviceHost)
    .filter(Boolean)
  return known.includes(host)
}

export function isBskyService(serviceUrl: string): boolean {
  return serviceHost(serviceUrl) === 'bsky.social'
}

/**
 * Bluesky's signup gate is `/gate/signup` and is signaled by
 * `phoneVerificationRequired` on describeServer. The AQUA PDS has no gate,
 * so that step must not open even if the field is present.
 */
export function signupNeedsCaptcha(
  serviceUrl: string,
  serviceDescription?: {phoneVerificationRequired?: boolean},
  env: Env = process.env,
): boolean {
  if (isAquaPdsService(serviceUrl, env)) return false
  return serviceDescription?.phoneVerificationRequired === true
}

export function providerChoice(
  serviceUrl: string,
  env: Env = process.env,
): 'aqua' | 'bsky' | 'custom' {
  if (isAquaPdsService(serviceUrl, env)) return 'aqua'
  if (isBskyService(serviceUrl)) return 'bsky'
  return 'custom'
}
