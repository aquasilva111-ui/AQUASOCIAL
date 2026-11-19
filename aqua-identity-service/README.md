# AQUA Identity

Serviço separado da identidade AQUA. Não faz parte do site estático, não é publicado na Hostinger e não sobe sozinho.

O Bluesky no site usa o cliente público (`@atproto/oauth-client-browser`). Este processo guarda o token AT Protocol no servidor e emite o cookie `aqua_session` (`HttpOnly`, `Secure`, `SameSite=Lax`). Google, Apple, GitHub, código de e-mail e a senha AQUA também ficam aqui. A descrição, as URLs de retorno e as variáveis estão em `docs/social-login.md`. O cliente público continua em `docs/aqua-identity.md`.

## Subir

Não rode isto em produção até existir uma máquina própria, os segredos e uma revisão.

```sh
cd aqua-identity-service
npm install
npm test
```

Sem `AQUA_IDENTITY_ENABLE_SERVER=true` o processo termina. Sem `AQUA_IDENTITY_SESSION_SECRET` de pelo menos 32 caracteres, também. Um provedor só entra em `GET /providers` quando todas as credenciais dele existem. Segredo não volta nessa resposta.

O banco é SQLite (`AQUA_IDENTITY_DATABASE_PATH`, padrão `data/identity.sqlite`). A conta interna é o id da tabela `users`. O AT Protocol entra como DID em `identities`, com `UNIQUE(provider, subject)`. O handle não autoriza.

A identidade não lê a 616. Senha de Google ou de Bluesky não é aceita.
