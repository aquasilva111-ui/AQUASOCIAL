# Login social da AQUA

Google, Apple, GitHub e e-mail entram pelo `aqua-identity-service`. Bluesky e os outros PDS continuam no OAuth público do AT Protocol que o PR #51 já colocou em `src/lib/aqua-identity`. Este documento não substitui `docs/aqua-identity.md`.

Nada disto está implantado. O site publicado na Hostinger continua estático, a partir da branch `1.111.0-ota-5`. Este trabalho não altera DNS, compose, workflow de publicação nem faz merge.

## O que já existia

- Sessão herdada do fork (`src/state/session`): senha só no pedido ao PDS, JWT no aparelho. A AQUA Identity não lê essa senha.
- Cliente público `@atproto/oauth-client-browser`: handle ou DID, PKCE, state de uso único, DPoP, conta guardada pelo DID.
- Telas `/login`, `/register`, `/onboarding`, `/oauth/callback` e `/settings/identity`.
- Cadastro nativo `com.atproto.server.createAccount`, desligado sem `EXPO_PUBLIC_AQUA_PDS_URL` e `EXPO_PUBLIC_AQUA_PDS_SIGNUP_ENABLED=true`.
- Handle AQUA `<nome>.<EXPO_PUBLIC_AQUA_HANDLE_DOMAIN>` e verificação de domínio por HTTPS `/.well-known/atproto-did` ou DNS TXT `_atproto`.
- BFF confidencial em `aqua-identity-service/`, com cookie `aqua_session` opaco. Não escuta porta sem `AQUA_IDENTITY_ENABLE_SERVER=true`.

O login social estende esse BFF. Não cria um segundo app, não copia o cliente AT Protocol e não mexe em `web/ui-ai` nem no design system.

## Por que estas bibliotecas

O serviço é um processo Node (`node:http`), separado do Expo. Auth.js fica de fora: ele assume um framework (Next.js ou adaptador) e uma sessão própria, em cima do cookie que o BFF já tem.

`openid-client` 6 faz o que o pedido pede para Google e Apple:

- authorization code
- PKCE S256
- `state` de uso único, guardado no servidor
- `nonce` no ID token
- conferência de `iss`, `aud`, `exp` e da assinatura pela JWKS do provedor (`enableNonRepudiationChecks`)

O segredo do cliente não vai para o bundle. O navegador só recebe o redirect.

GitHub não emite ID token nesse fluxo. O mesmo código de autorização e o PKCE valem; o assunto estável é o id numérico de `GET /user`. O `login` do GitHub não é chave. O access token é usado nessa leitura e não é gravado.

Apple assina um client secret JWT ES256 de cinco minutos (`iss` = Team ID, `sub` = Services ID, `aud` = `https://appleid.apple.com`). A chave `.p8` fica só na variável de ambiente.

E-mail é um código de uso único, com hash HMAC, expiração de 15 minutos e limite de tentativas. Não é um link com o código na URL, para o código não vazar em `Referer` nem em log de acesso. A mensagem diz à pessoa para digitar o código em `/login`.

Senha local, se existir, usa argon2id (19 MiB, 2 iterações, paralelismo 1) via `hash-wasm`. Senha de Google, Apple, GitHub ou Bluesky não é aceita nem hasheada.

## Banco

O serviço não tinha ORM nem banco. SQLite pelo `node:sqlite` (Node 22, já exigido pelo app) guarda as tabelas sem um processo a mais. O arquivo padrão é `aqua-identity-service/data/identity.sqlite` (`AQUA_IDENTITY_DATABASE_PATH`). Testes usam `:memory:`. Postgres pode substituir isso no dia em que o serviço tiver mais de um processo; o SQL é o de sempre (`users`, `identities`, `UNIQUE(provider, subject)`). Não há Postgres neste repositório para reaproveitar.

Tabelas da migração 1:

- `users`: id interno, `did` único e opcional, `handle` só de exibição, `password_hash` opcional.
- `identities`: `UNIQUE(provider, subject)`. O assunto do AT Protocol é o DID. O do e-mail é o e-mail normalizado. O do GitHub é o id numérico.
- `sessions`: hash HMAC do id do cookie, segredo CSRF, `auth_at`.
- `oauth_transactions`: `state`, verificador PKCE, nonce, intenção (`login` ou `link`), expiração. Some no primeiro uso.
- `email_codes`: só o hash do código.

O handle não é único e não autoriza nada. `authorization` na sessão tem `userId` e `did`.

Contas com o mesmo e-mail em provedores diferentes não se fundem. Ligar um `(provider, subject)` que já é de outra pessoa responde `account-conflict`.

## Sessão, CSRF e redirect

- Cookie `aqua_session`: id opaco de 32 bytes, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` quando a origem é HTTPS. Não é senha, DID document nem access token.
- Ações que mudam estado exigem `Origin` na lista `AQUA_IDENTITY_APP_ORIGINS` e o cabeçalho `x-aqua-client: aqua-identity`. Vincular, desvincular, senha e logout também exigem `x-aqua-csrf`, devolvido por `GET /session`.
- Vincular por navegação (`intent=link`) leva o CSRF na query porque o redirect ao provedor não manda cabeçalho. O `state` fica no servidor, amarrado ao usuário.
- Redirect de volta é só `/onboarding`, `/login` ou `/settings/identity` na primeira origem da lista. `redirect_uri` vindo do navegador é ignorado.
- Callback social fixo: `{AQUA_IDENTITY_ORIGIN}/oauth/social/callback` (GET e POST; a Apple usa `form_post`).
- Callback AT Protocol confidencial, o que já existia: `{AQUA_IDENTITY_ORIGIN}/oauth/callback`.
- Callback do cliente público, no site estático: `/oauth/callback`.

Vincular e desvincular exigem `auth_at` nos últimos 10 minutos (`AQUA_IDENTITY_REAUTH_WINDOW_SECONDS`). Não dá para remover o último método. Não dá para desvincular o e-mail enquanto houver senha AQUA, porque a senha entra por esse e-mail.

O limite de tentativas mora na memória do processo (5 inícios OAuth em 15 minutos por IP, 3 códigos de e-mail por hora, 8 confirmações em 15 minutos, 5 senhas em 15 minutos). Com mais de uma instância, o limite deixa de ser global. Está documentado de propósito: o serviço ainda é um processo só.

## Bluesky

Sem `EXPO_PUBLIC_AQUA_IDENTITY_SERVICE_URL`, `/login` mostra Bluesky como hoje: handle ou DID, cliente público, PKCE no navegador.

Com a URL do serviço e com `AQUA_IDENTITY_PRIVATE_KEYS` (o diretório público marca `atproto: true`), o mesmo botão manda o handle para `GET /login` do serviço. O token fica no processo, o navegador fica com o cookie. Sem a chave, Bluesky continua no cliente público mesmo que Google esteja ligado.

O cadastro nativo não muda. Sem PDS, `createAccount` não é chamado. O DID só entra na tabela quando o OAuth do AT Protocol prova o `session.sub`. O cliente não pode informar um DID e tê-lo aceito.

O handle próprio continua verificado por HTTPS ou DNS TXT, agora também em `POST /handle` no serviço, e só grava a coluna de exibição se o domínio publicar o DID da sessão. O id e o DID não mudam.

## 616

`src/lib/aqua-identity/boundary-616.ts` continua sem importar OAuth. `aqua-identity-service/src/boundary.ts` declara que o serviço não lê sessão nem token da 616. A resposta de sessão não leva access token, refresh token nem hash de senha. Uma integração futura pode receber `userId` ou DID. E-mail, cookie e segredo não atravessam.

## Variáveis

Segredos não têm valor de exemplo real. Vazio significa desligado.

### Site estático (públicas, entram no build)

| Variável | Efeito |
| --- | --- |
| `EXPO_PUBLIC_AQUA_IDENTITY_SERVICE_URL` | Origem do serviço, sem caminho. Vazio: nenhum botão de Google, Apple, GitHub, e-mail ou senha. O build do site lê esse nome direto em `process.env`, porque o Expo só grava no bundle o acesso estático. |
| `EXPO_PUBLIC_AQUA_IDENTITY_ORIGIN` | Continua sendo a origem do cliente público AT Protocol. |
| `EXPO_PUBLIC_AQUA_HANDLE_DOMAIN` | Sufixo do handle nativo. Continua sem padrão. |
| `EXPO_PUBLIC_AQUA_PDS_URL` | PDS próprio. |
| `EXPO_PUBLIC_AQUA_PDS_SIGNUP_ENABLED` | Continua `false` até haver PDS. |

### Serviço (só no processo)

| Variável | Efeito |
| --- | --- |
| `AQUA_IDENTITY_ENABLE_SERVER` | Tem de ser `true`. Sem isso o processo termina. |
| `AQUA_IDENTITY_ORIGIN` | HTTPS do serviço. Também é a base dos callbacks. |
| `AQUA_IDENTITY_APP_ORIGINS` | Origens HTTPS do site, separadas por vírgula. A primeira recebe o redirect. |
| `AQUA_IDENTITY_SESSION_SECRET` | Pelo menos 32 caracteres. HMAC do cookie e dos códigos. |
| `AQUA_IDENTITY_DATABASE_PATH` | Arquivo SQLite. |
| `AQUA_IDENTITY_HOST` | Padrão `127.0.0.1`. |
| `AQUA_IDENTITY_PORT` | Padrão `8787`. |
| `AQUA_IDENTITY_REAUTH_WINDOW_SECONDS` | Padrão `600`. |
| `AQUA_IDENTITY_COOKIE_SAMESITE` | `lax` (padrão) ou `strict`. `none` é recusado. |
| `AQUA_IDENTITY_TRUST_PROXY` | `true` só atrás de um proxy que reescreve `X-Forwarded-For`. |
| `AQUA_IDENTITY_OAUTH_ALLOW_INSECURE` | Só teste local. Recusado com `NODE_ENV=production`. |
| `AQUA_IDENTITY_PRIVATE_KEYS` | JWK do cliente confidencial AT Protocol, uma por linha. |
| `AQUA_IDENTITY_HANDLE_RESOLVER` | Resolver de handle do cliente confidencial. |
| `AQUA_IDENTITY_DOH_URL` | DNS-over-HTTPS da verificação de domínio. |
| `AQUA_IDENTITY_GOOGLE_CLIENT_ID` | Cliente OAuth Web do Google. |
| `AQUA_IDENTITY_GOOGLE_CLIENT_SECRET` | Segredo. Os dois juntos ligam o Google. |
| `AQUA_IDENTITY_APPLE_CLIENT_ID` | Services ID. |
| `AQUA_IDENTITY_APPLE_TEAM_ID` | Team ID. |
| `AQUA_IDENTITY_APPLE_KEY_ID` | Key ID da chave Sign in with Apple. |
| `AQUA_IDENTITY_APPLE_PRIVATE_KEY` | PEM da chave `.p8`. Quebras de linha podem ir como `\n`. |
| `AQUA_IDENTITY_GITHUB_CLIENT_ID` | OAuth App. |
| `AQUA_IDENTITY_GITHUB_CLIENT_SECRET` | Segredo. |
| `AQUA_IDENTITY_EMAIL_FROM` | Remetente. |
| `AQUA_IDENTITY_EMAIL_TRANSPORT` | `smtp` em produção. `capture` só fora de produção, para teste. |
| `AQUA_IDENTITY_SMTP_URL` | URL SMTP quando o transporte é `smtp`. |
| `AQUA_IDENTITY_PASSWORD_LOGIN` | `true` liga a senha AQUA. Padrão desligado. |

`GET /providers` devolve só os nomes ligados. Não devolve segredo, client secret nem chave.

## URLs para cadastrar em cada provedor

Substitua `identity.example` pela origem real de `AQUA_IDENTITY_ORIGIN`.

| Provedor | Tipo | URL de retorno |
| --- | --- | --- |
| Google | Cliente OAuth de aplicativo da Web. Escopos `openid`, `email`, `profile`. | `https://identity.example/oauth/social/callback` |
| Apple | Services ID, Sign in with Apple. Escopos `openid`, `email`, `name`. Response mode form post. Domínio e return URL no identificador. | `https://identity.example/oauth/social/callback` |
| GitHub | OAuth App. Escopos `read:user` e `user:email`. Sem permissão de repositório. | `https://identity.example/oauth/social/callback` |
| AT Protocol confidencial | `redirect_uris` do metadata em `{origem}/client-metadata.json`. | `https://identity.example/oauth/callback` |
| AT Protocol público | Já descrito em `docs/aqua-identity.md`, no site estático. | `https://<site>/oauth/callback` |
| E-mail | Não há URL de provedor. O código é digitado em `/login`. | — |

A origem do site (`AQUA_IDENTITY_APP_ORIGINS`) é para onde a pessoa volta (`/onboarding`, `/login`, `/settings/identity`). Ela não é o redirect do provedor.

## Credenciais que o Samu precisa criar

Nenhuma está no git.

- Google Cloud: tela de consentimento, cliente Web, o redirect acima. Client id e client secret no serviço.
- Apple Developer: App ID com Sign in with Apple, Services ID, chave com Sign in with Apple, domínio verificado. Team ID, Key ID, Services ID e o PEM no serviço.
- GitHub: OAuth App da organização, callback acima. Client id e client secret no serviço.
- E-mail: caixa e SMTP. `AQUA_IDENTITY_EMAIL_FROM` e `AQUA_IDENTITY_SMTP_URL`.
- Segredo de sessão: 32 bytes aleatórios em `AQUA_IDENTITY_SESSION_SECRET`.
- Chave do cliente AT Protocol, se a sessão Bluesky for ficar no servidor: a mesma JWK que `docs/aqua-identity.md` já descreve.

## Rotas do serviço

- `GET /providers`
- `GET /session`
- `POST /logout`
- `GET /oauth/social/start?provider=google|apple|github&intent=login|link`
- `GET|POST /oauth/social/callback`
- `POST /login/email/start` e `POST /login/email/finish`
- `POST /login/password` e `POST /password` (só com a flag)
- `POST /identities/unlink`
- `POST /handle`
- `GET /login`, `GET /oauth/callback`, `GET /client-metadata.json`, `GET /jwks.json` quando há chave AT Protocol

## Riscos

- O site estático não consegue esconder segredo. Por isso os botões dependem do serviço. Com a URL vazia, o fetch nem acontece.
- `SameSite=Lax` segura o callback de navegação e o fetch quando o serviço é do mesmo site (por exemplo `identity.aqua.example` e `aqua.example`). Outro registrável precisa de outro desenho de cookie; `SameSite=None` está recusado até essa revisão.
- O limite em memória zera no restart e não vale para várias instâncias.
- O token confidencial do AT Protocol continua na memória do processo, como no PR #51. O cookie e as identidades sociais estão no SQLite. Reiniciar o processo mantém a conta e esquece o refresh token do PDS.
- `transition:generic` continua amplo no cliente AT Protocol. Não foi estreito aqui.
- Argon2id torna a senha local cara de propósito. A flag vem desligada.
- Confiar em `X-Forwarded-For` sem proxy permite forjar o IP do limite.

## Testes

No serviço:

```sh
cd aqua-identity-service
npm install
npm test
```

Cobrem diretório público sem segredo, login Google, logout, state desconhecido, ID token com assinatura errada, audiência errada e expirado, provedor desligado, Apple em `form_post`, GitHub sem gravar o access token, e-mail repetido que não funde contas, vínculo, desvínculo, reautenticação vencida, último método, conflito de identidade, código de uso único, código expirado, limite de e-mail, senha argon2id, handle verificado sem trocar o DID, e a recusa de subir sem a flag.

No app: `src/lib/aqua-identity/__tests__/social.test.ts` cobre a lista vazia, o filtro de provedor e o POST sem colocar o CSRF na URL.

## Implantação

Não fazer isto como parte deste PR.

1. Deixar `EXPO_PUBLIC_AQUA_IDENTITY_SERVICE_URL` vazio no build da Hostinger. A tela fica no Bluesky.
2. Quando houver máquina própria, instalar `aqua-identity-service`, preencher só os provedores desejados e `AQUA_IDENTITY_ENABLE_SERVER=true`.
3. Cadastrar os redirects da tabela. Conferir `GET /providers` sem segredo.
4. Apontar um hostname HTTPS para o processo, atrás de proxy, sem trocar o document root estático da Hostinger.
5. Só então colocar a origem do serviço em `EXPO_PUBLIC_AQUA_IDENTITY_SERVICE_URL` e gerar outro build do site.
6. O PDS próprio e `EXPO_PUBLIC_AQUA_PDS_SIGNUP_ENABLED` continuam como em `docs/aqua-identity.md`: desligados até existirem.
