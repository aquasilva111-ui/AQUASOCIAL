/**
 * The identity service does not read or write the 616 network.
 * Session cookies, OAuth tokens, e-mail addresses, and password hashes stay here.
 * A later 616 integration may receive an internal user id or a DID. Nothing else.
 */
export const SERVICE_616_BOUNDARY = {
  reads616Session: false,
  stores616Tokens: false,
  sharesBrowserSession: false,
  identityKey: 'did-or-internal-id',
} as const
