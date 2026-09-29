import {IdResolver} from '@atproto/identity'
import {verifyJwt} from '@atproto/xrpc-server'

import {type Config} from '../config.js'
import {unauthorized} from '../lib/errors.js'

export type SigningKeyResolver = (
  did: string,
  forceRefresh: boolean,
) => Promise<string>

/** Production resolver: the DID document's atproto signing key. */
export function createSigningKeyResolver(): SigningKeyResolver {
  const resolver = new IdResolver()
  return (did, forceRefresh) =>
    resolver.did.resolveAtprotoKey(did, forceRefresh)
}

const DID_RE = /^did:(plc|web):[a-zA-Z0-9._:%-]+$/

/**
 * Identifies the caller. The ONLY identity source is a service-auth JWT the
 * user's PDS signed for this service (aud = serviceDid), or — outside
 * production — an explicit dev header. Ids in bodies/paths are never trusted
 * as identity.
 */
export async function authenticate(
  headers: Record<string, string | string[] | undefined>,
  config: Config,
  getSigningKey: SigningKeyResolver,
): Promise<string> {
  const auth = headers.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    try {
      const payload = await verifyJwt(
        auth.slice('Bearer '.length),
        config.serviceDid,
        null,
        (iss, force) => getSigningKey(iss.split('#')[0], force),
      )
      const did = payload.iss.split('#')[0]
      if (!DID_RE.test(did)) throw unauthorized()
      return did
    } catch {
      throw unauthorized()
    }
  }
  const dev = headers['x-aqua-dev-did']
  if (
    config.devAuth &&
    config.env !== 'production' &&
    typeof dev === 'string'
  ) {
    if (!DID_RE.test(dev)) throw unauthorized()
    return dev
  }
  throw unauthorized()
}
