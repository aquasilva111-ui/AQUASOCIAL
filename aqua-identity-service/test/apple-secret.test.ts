import assert from 'node:assert/strict'
import {generateKeyPairSync, verify} from 'node:crypto'
import {describe, it} from 'node:test'

import {appleClientSecret} from '../src/apple.ts'

describe('Apple client secret', () => {
  it('is a short-lived ES256 JWT for Apple, not a stored password', () => {
    const {privateKey, publicKey} = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    })
    const token = appleClientSecret({
      teamId: 'TEAM123456',
      clientId: 'com.aqua.web',
      keyId: 'KEY123456',
      privateKeyPem: privateKey
        .export({type: 'pkcs8', format: 'pem'})
        .toString(),
      now: 1_700_000_000,
    })
    const [header, payload, signature] = token.split('.')
    const decodedHeader = JSON.parse(
      Buffer.from(header, 'base64url').toString(),
    )
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString())
    assert.equal(decodedHeader.alg, 'ES256')
    assert.equal(decodedHeader.kid, 'KEY123456')
    assert.equal(decoded.iss, 'TEAM123456')
    assert.equal(decoded.sub, 'com.aqua.web')
    assert.equal(decoded.aud, 'https://appleid.apple.com')
    assert.equal(decoded.exp, decoded.iat + 300)
    assert.equal(
      verify(
        'sha256',
        Buffer.from(`${header}.${payload}`),
        {
          key: publicKey,
          dsaEncoding: 'ieee-p1363',
        },
        Buffer.from(signature, 'base64url'),
      ),
      true,
    )
    assert.equal(token.includes('password'), false)
  })
})
