const VERIFIER_BYTES = 32

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  const cryptoApi = globalThis.crypto
  if (!cryptoApi?.getRandomValues) {
    throw new Error('WebCrypto getRandomValues is required')
  }
  cryptoApi.getRandomValues(bytes)
  return bytes
}

export function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/[=]+$/g, '')
}

export async function digestSha256(data: Uint8Array): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('WebCrypto SHA-256 is required for PKCE')
  const digest = await subtle.digest('SHA-256', data as BufferSource)
  return new Uint8Array(digest)
}

export function createCodeVerifier(): string {
  return base64url(randomBytes(VERIFIER_BYTES))
}

export async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await digestSha256(new TextEncoder().encode(verifier))
  return base64url(digest)
}

export function createOAuthState(): string {
  return base64url(randomBytes(16))
}
