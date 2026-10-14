import { IdResolver } from '@atproto/identity';
import { verifyJwt } from '@atproto/xrpc-server';
import type { Did } from '../../../../src/lib/ecosystem/types.ts';
import { EcosystemError } from './store.ts';

/** No caller-controlled DID header, cookies, access-token decoding or alternate identity. */
export function createEcosystemAuthenticator(
  serviceDid: string,
  signingKeyResolver?: (did: string, force: boolean) => Promise<string>,
) {
  const resolver = new IdResolver();
  return async (authorization: string | undefined): Promise<Did> => {
    if (!authorization?.startsWith('Bearer '))
      throw new EcosystemError(401, 'Conecte sua conta AQUA');
    try {
      const jwt = await verifyJwt(
        authorization.slice(7),
        serviceDid,
        null,
        signingKeyResolver ??
          ((did, force) => resolver.did.resolveAtprotoKey(did, force)),
      );
      if (
        !/^did:(plc|web):[a-zA-Z0-9._:%-]+$/.test(jwt.iss) ||
        jwt.exp > Math.floor(Date.now() / 1000) + 360
      )
        throw new Error('Token inválido');
      return jwt.iss as Did;
    } catch {
      throw new EcosystemError(401, 'Autenticação AT inválida ou expirada');
    }
  };
}
