# AQUA Identity BFF

Serviço separado para o cliente confidencial OAuth. Não faz parte do site estático, não é publicado na Hostinger e não sobe sozinho.

O site usa o cliente público (`@atproto/oauth-client-browser`). Este processo existe para quando a sessão precisar de cookie `HttpOnly` e de token que o navegador não lê. A descrição completa está em `docs/aqua-identity.md`.

## O que ele guarda

- Cookie `aqua_session`: id opaco, `HttpOnly`, `Secure`, `SameSite=Lax`. Não é senha, DID document nem access token.
- Tokens OAuth: no `sessionStore` do processo, chaveados pelo DID, via `@atproto/oauth-client-node`.
- A identidade AT Protocol continua independente da 616. Este serviço não fala com chain nenhuma.

## Subir

Não rode isto em produção até existir uma máquina própria, uma chave e uma revisão. Instalação local, fora do build do app:

```sh
cd aqua-identity-service
npm install
```

Variáveis (nada disto está preenchido com segredo real):

```
AQUA_IDENTITY_ENABLE_SERVER=true
AQUA_IDENTITY_ORIGIN=https://identity.example.invalid
AQUA_IDENTITY_HANDLE_RESOLVER=https://bsky.social
AQUA_IDENTITY_PRIVATE_KEYS={"kty":"EC","crv":"P-256","x":"...","y":"...","d":"..."}
AQUA_IDENTITY_PORT=8787
```

`AQUA_IDENTITY_PRIVATE_KEYS` é um JWK por linha. Sem `AQUA_IDENTITY_ENABLE_SERVER=true` o processo termina na hora. Sem chave importável, também.

Rotas, quando ligado:

- `GET /client-metadata.json` — metadata com `private_key_jwt` e `dpop_bound_access_tokens`
- `GET /jwks.json`
- `GET /login?handle=` — redirect OAuth, com limite de 5 tentativas por 15 minutos por IP
- `GET /oauth/callback` — troca o código, grava a sessão no servidor, seta o cookie
- `POST /logout` — apaga o cookie e pede o revoke do DID

A senha do Bluesky não aparece em nenhuma dessas rotas.
