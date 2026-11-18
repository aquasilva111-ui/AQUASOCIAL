# AQUA Identity

Autenticação da AQUA com AT Protocol. A conta interna é o DID. O handle pode mudar. Senha de Bluesky não entra no frontend nem num backend da AQUA.

Este documento descreve o que já existia, o que este módulo faz, o que continua desligado e como ligar cada peça sem publicar nada na Hostinger.

## O que já existia

O app é o fork do Bluesky (React Native / Expo). A sessão herdada fica em `src/state/session`.

- A entrada antiga não é uma rota. É um painel por cima do shell (`src/screens/Login`, `src/view/com/auth/LoggedOut.tsx`).
- `createAgentAndLogin` chama `BskyAgent.login({identifier, password})`, que é `com.atproto.server.createSession` no PDS (hoje `https://bsky.social`, constante `BSKY_SERVICE`).
- A senha segue só nesse pedido. O que fica gravado em `src/state/persisted/schema.ts` é o DID, o handle e os JWT (`accessJwt`, `refreshJwt`). Não há campo de senha nesse schema.
- `createAgentAndCreateAccount` cria conta no mesmo serviço, também com senha só no pedido.
- O roteador (`src/routes.ts`) não tinha `/login`, `/register` nem `/onboarding`. A home é `/`.
- O site publicado é export estático (`yarn build-web`) com `web/.htaccess` na Hostinger. Arquivo que existe é servido; `.json` ausente não vira o SPA.
- `infra/pds/` é a configuração atual do PDS oficial (compose, env de exemplo e Caddyfile). `deploy/pds/` é um esboço anterior. Nenhum dos dois é o PDS em produção. As contas atuais continuam em bsky.social. O passo a passo está em `docs/aqua-pds.md`.

A mudança nova não substitui essa sessão. As rotas `/login`, `/register`, `/onboarding`, `/oauth/callback` e `/settings/identity` ficam ao lado. A aba Mailssage e a rota `/ui-ai` não foram alteradas.

## 616 Network

Não há cliente, carteira nem sessão da 616 neste repositório. O único rastro é o marcador `AQUA-055` em `src/lib/conventions/future.ts` e uma linha em `docs/reality-conventions.md`: proveniência 616 não está implementada e grafos pessoais não vão para uma chain.

`src/lib/aqua-identity/boundary-616.ts` não importa OAuth, PDS nem sessão. A identidade AT Protocol não consulta a 616. No futuro, `resourceRefForDid` pode apontar um recurso para um DID autorizado. Esse objeto só tem `did` e `resourceId`. Token, e-mail e senha não atravessam essa linha.

## Como a entrada funciona

Cliente público, no site estático, com `@atproto/oauth-client-browser` (0.5.14):

1. A pessoa informa handle ou DID.
2. `resolveIdentity` acha o DID e o PDS (`com.atproto.identity.resolveHandle`, depois o documento em `plc.directory` ou `did:web`).
3. A AQUA gera `state` de uso único e um PKCE S256 próprios e guarda isso em `sessionStorage`.
4. O SDK recebe o DID (não o handle) e faz o redirect com o PKCE e o DPoP dele. O `state` enviado é o nosso.
5. `/oauth/callback` chama `initCallback`. Só associamos a conta se o `state`, o PKCE guardado e o DID da sessão (`session.sub`) baterem com o pedido. Se não baterem, a sessão do SDK é revogada.
6. O registro durável (`localStorage`, chave `aqua-identity.accounts.v1`) guarda DID, handle, PDS e o método. Não guarda senha, `accessJwt` nem `refresh_token`. Os tokens OAuth ficam no IndexedDB do SDK.

A chave da conta é sempre o DID. Trocar o handle atualiza o mesmo registro.

### Trade-off do cliente público

Não há backend no site estático, então não há cookie `HttpOnly`. Quem conseguir script na origem (XSS) consegue usar a sessão que o SDK guarda no IndexedDB. O `state` e o verificador PKCE da nossa checagem também passam por `sessionStorage` durante o redirect.

O cliente confidencial fica em `aqua-identity-service/`. Ele usa `@atproto/oauth-client-node`, guarda o token no servidor e manda ao navegador só um id opaco no cookie `aqua_session` (`HttpOnly`, `Secure`, `SameSite=Lax`). Esse serviço não sobe com o site, não entra no compose da Hostinger e recusa iniciar sem `AQUA_IDENTITY_ENABLE_SERVER=true`. Tokens de cliente confidencial duram mais; por isso ele é o caminho quando o Samu quiser sessão longa.

Em `http://127.0.0.1` o SDK usa o cliente de loopback (`clientMetadata` vazio). `localhost` não serve: o protocolo exige `127.0.0.1`.

## Cadastro nativo

`createNativeAccount` chama `com.atproto.server.createAccount` no PDS de `EXPO_PUBLIC_AQUA_PDS_URL`.

O pedido só sai se as duas coisas forem verdade:

- a URL do PDS está preenchida
- `EXPO_PUBLIC_AQUA_PDS_SIGNUP_ENABLED=true`

O padrão é desligado. Com a flag apagada, `fetch` não é chamado. A senha, quando o cadastro existir, vai no corpo desse único pedido e não volta no objeto da conta. Erro do PDS que ecoe `password=` é redatado.

O handle nativo é `<nome>.<EXPO_PUBLIC_AQUA_HANDLE_DOMAIN>`. O domínio não tem valor padrão. Vazio significa "ainda não escolhido".

## Handle próprio

No onboarding e em `/settings/identity` a pessoa vê:

- DNS TXT `_atproto.<handle>` = `did=<DID>`
- `https://<handle>/.well-known/atproto-did` com o DID em texto

`verifyHandleDid` aceita o well-known ou o TXT via DNS-over-HTTPS. `planHandleChange` devolve o mesmo DID. A troca real é `com.atproto.identity.updateHandle` na sessão. Voltar ao handle AQUA é a mesma operação, para `<nome>.<domínio configurado>`.

Sem sessão de PDS, a tela mostra o plano e o motivo, e não finge que o handle mudou.

## E-mail, recuperação e abuso

- Confirmação: `com.atproto.server.requestEmailConfirmation` e `confirmEmail`, com a sessão OAuth ou com o JWT do PDS próprio guardado só em `sessionStorage`.
- Recuperação de senha: só no PDS da AQUA (`requestPasswordReset` / `resetPassword`), na tela `/login`. Conta Bluesky recupera a senha no PDS dela. A AQUA não pede essa senha.
- Limite local: 5 entradas em 15 minutos, 3 cadastros e 3 recuperações por hora, por identificador. Isso mora na memória da aba. Não substitui o limite do PDS (`PDS_RATE_LIMITS_ENABLED` em `infra/pds/pds.env.example`) nem o do BFF.
- Convite (`EXPO_PUBLIC_AQUA_IDENTITY_INVITE_REQUIRED`) e captcha (`EXPO_PUBLIC_AQUA_IDENTITY_CAPTCHA_ENABLED` mais a site key) travam o cadastro quando ligados. Token sem site key não passa. A checagem no navegador não prova que o captcha é válido; o BFF ou o PDS precisa verificar.

## Variáveis

| Variável | Padrão | Efeito |
| --- | --- | --- |
| `EXPO_PUBLIC_AQUA_IDENTITY_ORIGIN` | vazio | Origem HTTPS do `client_id`. Sem ela, OAuth público só no loopback. |
| `EXPO_PUBLIC_AQUA_HANDLE_DOMAIN` | vazio | Sufixo do handle nativo. Não assumir um domínio. |
| `EXPO_PUBLIC_AQUA_PDS_URL` | vazio | PDS próprio. |
| `EXPO_PUBLIC_AQUA_PDS_SIGNUP_ENABLED` | `false` | Liga `createAccount`. Exige também a URL. |
| `EXPO_PUBLIC_AQUA_IDENTITY_INVITE_REQUIRED` | `false` | Exige código de convite no cadastro. |
| `EXPO_PUBLIC_AQUA_IDENTITY_CAPTCHA_ENABLED` | `false` | Exige token de captcha. |
| `EXPO_PUBLIC_AQUA_IDENTITY_CAPTCHA_SITE_KEY` | vazio | Sem a key, captcha ligado continua fechado. |
| `EXPO_PUBLIC_AQUA_IDENTITY_HANDLE_RESOLVER` | `https://bsky.social` | `resolveHandle`. Vaza IP e handle para quem opera esse host. |
| `EXPO_PUBLIC_AQUA_IDENTITY_PLC_URL` | `https://plc.directory` | Diretório PLC. |
| `EXPO_PUBLIC_AQUA_IDENTITY_DOH_URL` | Cloudflare DNS JSON | Consulta TXT na verificação de domínio. |

O BFF, separado, lê `AQUA_IDENTITY_ENABLE_SERVER`, `AQUA_IDENTITY_ORIGIN`, `AQUA_IDENTITY_HANDLE_RESOLVER` e `AQUA_IDENTITY_PRIVATE_KEYS` (JWK em JSON, uma ou mais, separadas por linha). Não há chave real no repositório.

## Client metadata

`public/oauth/client-metadata.json` é um modelo com `https://example.invalid`. Não autentica ninguém.

`scripts/aqua-oauth-metadata.js` e `buildPublicClientMetadata` geram o mesmo JSON. `scripts/post-web-build.js` grava `web-build/oauth/client-metadata.json` quando `EXPO_PUBLIC_AQUA_IDENTITY_ORIGIN` está definida no build. O `client_id` precisa ser exatamente essa URL, com `token_endpoint_auth_method=none` e `dpop_bound_access_tokens=true`. O escopo declarado é `atproto transition:generic`: `atproto` identifica; `transition:generic` é o escopo transitório que permite trocar handle e confirmar e-mail. Dá para estreitar quando o Samu escolher escopos granulares.

O `.htaccess` atual já entrega o arquivo se ele existir. Não foi preciso mudar a Hostinger.

## Riscos

- Cliente público: sessão no IndexedDB, curta, exposta a XSS. O BFF é a correção.
- O resolver padrão é o bsky.social. Quem entra vaza o handle e o IP para esse operador até a AQUA ter resolver próprio (o PDS, quando existir, serve).
- O limite de tentativas no navegador se apaga com a aba e não segura um cliente modificado. O PDS e o BFF são a trava.
- A sessão herdada (senha → JWT no armazenamento do app) continua. AQUA Identity não a alimenta e não lê a senha dela.
- `transition:generic` é amplo. É o que o PDS entende hoje para as ações de onboarding. Não é um escopo mínimo eterno.
- Publicar o modelo `example.invalid` não abre login. Publicar um `client_id` cujo JSON não bate com o bundle também não: o PDS compara os dois.

## Implantação

Nada disto está publicado. O branch não é a base `1.111.0-ota-5`, então o workflow da Hostinger não recebe este código.

Quando o Samu quiser ligar, nesta ordem:

1. Escolher o domínio dos handles e colocar em `EXPO_PUBLIC_AQUA_HANDLE_DOMAIN`.
2. Definir `EXPO_PUBLIC_AQUA_IDENTITY_ORIGIN` com a origem HTTPS real e gerar o metadata no build. Conferir `https://<origem>/oauth/client-metadata.json` no ar.
3. Entrar com uma conta bsky.social pela rota `/login` e ver o DID em `/onboarding`.
4. Subir o PDS numa máquina nova, com o passo a passo de `docs/aqua-pds.md` (`infra/pds/`). Preencher `EXPO_PUBLIC_AQUA_PDS_URL` com `https://<PDS_HOSTNAME>` e `EXPO_PUBLIC_AQUA_HANDLE_DOMAIN` com a zona escolhida, sem ponto. Deixar o cadastro desligado até o e-mail, o convite, o `/xrpc/_health` e o limite do PDS estarem revisados.
5. Só então `EXPO_PUBLIC_AQUA_PDS_SIGNUP_ENABLED=true`, num build novo. A tela de cadastro continua oculta enquanto `/xrpc/_health` não devolver uma versão.
6. Se a sessão precisar ser longa e o token não puder ficar no navegador, instalar e rodar `aqua-identity-service` à parte, com chave privada fora do git e cookie `HttpOnly`. Não apontar o DNS da Hostinger para esse processo até essa revisão.

## O que está pronto e o que depende de decisão

Pronto neste branch:

- Rotas e telas `/login`, `/register`, `/onboarding`, mais `/oauth/callback` e `/settings/identity`, com o layout de entrada e os campos que o app já usa.
- Resolução handle/DID → PDS, PKCE, state de uso único, exigência de DPoP, metadata do cliente público e integração com o SDK no web.
- Cadastro `createAccount` atrás da flag, desligado.
- Plano de handle AQUA e de domínio próprio (TXT e well-known), sempre no mesmo DID.
- Pedidos de e-mail e de reset para o PDS próprio, limite de tentativas, convite e captcha configuráveis.
- Módulo 616 isolado.
- Testes em `src/lib/aqua-identity/__tests__/identity.test.ts`.
- BFF documentado e implementado, sem processo escutando porta e sem deploy.

Depende do Samu, de um PDS ou do BFF:

- O domínio real dos handles.
- A origem pública definitiva, se não for a que já hospeda o site.
- Um PDS da AQUA de verdade, com SMTP, convite e limite no servidor.
- Ligar a flag de cadastro.
- Provedor de captcha e a verificação do token no BFF (o cliente só recusa token vazio).
- Rodar o serviço confidencial e trocar o cliente público por ele.
- Estreitar `transition:generic` para escopos granulares.
- Resolver de handle próprio, para deixar de consultar bsky.social.
- Decidir se a sessão herdada do shell deve, mais tarde, passar a usar o `Agent` OAuth. Hoje as duas sessões convivem e a antiga não recebe senha nova.
