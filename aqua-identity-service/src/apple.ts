import {createPrivateKey, sign} from 'node:crypto'

const APPLE_AUDIENCE = 'https://appleid.apple.com'
const FIVE_MINUTES = 5 * 60

function base64url(value: string): string {
  return Buffer.from(value).toString('base64url')
}

/**
 * Apple client secret is a short-lived ES256 JWT. It is signed here and sent
 * only to Apple's token endpoint. The private key never leaves the server.
 */
export function appleClientSecret(input: {
  teamId: string
  clientId: string
  keyId: string
  privateKeyPem: string
  now?: number
}): string {
  const issuedAt = input.now ?? Math.floor(Date.now() / 1000)
  const header = base64url(
    JSON.stringify({alg: 'ES256', kid: input.keyId, typ: 'JWT'}),
  )
  const payload = base64url(
    JSON.stringify({
      iss: input.teamId,
      iat: issuedAt,
      exp: issuedAt + FIVE_MINUTES,
      aud: APPLE_AUDIENCE,
      sub: input.clientId,
    }),
  )
  const data = `${header}.${payload}`
  const signature = sign('sha256', Buffer.from(data), {
    key: createPrivateKey(input.privateKeyPem),
    dsaEncoding: 'ieee-p1363',
  })
  return `${data}.${signature.toString('base64url')}`
}
