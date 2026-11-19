/**
 * Boundary between AQUA Identity and the 616 Network.
 *
 * Login, registration, recovery, email verification, and session storage do
 * not read or write the 616 Network. AT Protocol identity stands alone.
 *
 * A later 616 integration may point a resource at an authorized DID. That
 * reference is the DID only. Tokens, email addresses, and passwords do not
 * cross this line. This file imports nothing from the OAuth or PDS modules.
 */

export const IDENTITY_616_BOUNDARY = {
  system: 'aqua-identity',
  protocol: 'atproto',
  identityDependsOn616: false,
  privateDataOnChain: false,
  externalLoginSharesSessionWith616: false,
  futureAssociation: 'authorized-did-only',
} as const

export type ChainResourceRef = {
  did: string
  resourceId: string
}

export function resourceRefForDid(
  did: string,
  resourceId: string,
): ChainResourceRef {
  if (!did.startsWith('did:')) {
    throw new Error('616 resources require a DID')
  }
  const id = resourceId.trim()
  if (!id) throw new Error('resource id required')
  return {did, resourceId: id}
}
