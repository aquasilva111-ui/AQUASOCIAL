// Quem está pedindo? O AppView (getFeedSkeleton) e o app (endpoints da Aqua,
// via com.atproto.server.getServiceAuth) mandam um JWT de serviço assinado com
// a chave da conta: iss = DID do usuário, aud = DID deste serviço, lxm = método.
import {IdResolver} from '@atproto/identity'
import {verifyJwt} from '@atproto/xrpc-server'

import type {Config} from './config.ts'

/** Devolve o DID do usuário, ou undefined (sem cabeçalho). Lança AuthError se inválido. */
export type ViewerAuth = (
  headers: {authorization?: string; devViewer?: string},
  lxm: string,
) => Promise<string | undefined>

export class AuthError extends Error {}

export function createAuth(
  cfg: Pick<Config, 'serviceDid' | 'env' | 'authDevViewerHeader'>,
  getSigningKey?: (did: string, forceRefresh: boolean) => Promise<string>,
): ViewerAuth {
  const resolver = getSigningKey ? undefined : new IdResolver()
  const keyOf =
    getSigningKey ??
    ((did: string, force: boolean) => resolver!.did.resolveAtprotoKey(did, force))
  return async (headers, lxm) => {
    // Só em desenvolvimento/teste, e só se ligado: X-Aqua-Viewer: did:…
    if (
      cfg.authDevViewerHeader &&
      cfg.env !== 'production' &&
      headers.devViewer?.startsWith('did:')
    )
      return headers.devViewer
    const h = headers.authorization ?? ''
    if (!h) return undefined
    if (!h.startsWith('Bearer ')) throw new AuthError('use Bearer')
    try {
      const payload = await verifyJwt(
        h.slice(7).trim(),
        cfg.serviceDid,
        lxm,
        (iss, force) => keyOf(iss.split('#')[0]!, force),
      )
      return payload.iss.split('#')[0]
    } catch (e) {
      throw new AuthError(e instanceof Error ? e.message : 'token inválido')
    }
  }
}
