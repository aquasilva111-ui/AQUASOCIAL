/**
 * DPoP proofs are signed by @atproto/oauth-client-browser (public client)
 * or @atproto/oauth-client-node (confidential BFF). The keys stay non-exportable
 * inside the SDK. This module only checks that a client demands DPoP and
 * describes the proof payload the signer must produce.
 */
export const DPOP_PROOF_TYP = 'dpop+jwt'
export const DPOP_ALG = 'ES256'

export type DpopProofClaims = {
  htm: string
  htu: string
  jti: string
  iat: number
  nonce?: string
  ath?: string
}

export function assertDpopBound(metadata: {
  dpop_bound_access_tokens?: boolean
  token_endpoint_auth_method?: string
}): void {
  if (metadata.dpop_bound_access_tokens !== true) {
    throw new Error('AQUA Identity requires DPoP-bound access tokens')
  }
}

export function buildDpopProofClaims(input: DpopProofClaims): DpopProofClaims {
  const htm = input.htm.toUpperCase()
  if (htm !== 'GET' && htm !== 'POST') {
    throw new Error('DPoP htm must be the HTTP method')
  }
  if (
    !input.htu.startsWith('https://') &&
    !input.htu.startsWith('http://127.0.0.1')
  ) {
    throw new Error(
      'DPoP htu must be the request URL without query or fragment',
    )
  }
  if (!input.jti || input.iat <= 0) {
    throw new Error('DPoP proof needs jti and iat')
  }
  const htu = input.htu.split('#')[0].split('?')[0]
  return {
    htm,
    htu,
    jti: input.jti,
    iat: input.iat,
    ...(input.nonce ? {nonce: input.nonce} : {}),
    ...(input.ath ? {ath: input.ath} : {}),
  }
}
