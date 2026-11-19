# Auditoria somente leitura — AQUASOCIAL

Data da leitura: 14 de outubro de 2026.
Nenhum código de produto foi alterado. Esta auditoria descreve o que o repositório contém, o que os testes fizeram nesta máquina e o que o site publicado realmente entrega.

Legenda de estado. **Nada que seja só tela recebe COMPLETE.**

| Estado | Significado |
| --- | --- |
| PRODUCTION READY | Pode ir a público, com segurança, persistência e operação reais |
| COMPLETE | O fluxo existe de ponta a ponta, com dados reais e testes, e não é só interface |
| FUNCTIONAL BUT LIMITED | Funciona num ambiente estreito (local, uma conta, sem rede, sem pagamento) |
| PARTIAL | Há modelo, tela ou API, mas o fluxo que o usuário espera não fecha |
| MOCKED | A integração decisiva é simulada |
| PLACEHOLDER | Item de menu ou rota sem produto atrás |
| BROKEN | O código que deveria ligar o produto está inválido ou o build publicado não o monta |
| NOT IMPLEMENTED | Não há módulo |

Nada neste repositório está PRODUCTION READY.

---

## 1. Branch e commit

O branch padrão do remoto `origin` é `1.111.0-ota-5`.

| | |
| --- | --- |
| Commit | `a884c57e2699dccb1eab434c6e0c128d664d1ab5` |
| Data | 2026-10-13 20:14:13 -0600 (2026-10-14 02:14 UTC) |
| Mensagem | `docs: mark Vercel guide as unused (deploy is Hostinger)` |
| Versão do app | `1.111.0` (`package.json`, nome interno ainda `bsky.app`) |
| Node deste ambiente | 22.14.0 |
| Node que o CI lê | `.nvmrc` = **20** |
| Gerenciador da raiz | Yarn 1.22.22 (`yarn.lock` e também um `package-lock.json`) |

O checkout local estava um pouco atrás. O remoto foi atualizado antes da leitura. Os três commits à frente do snapshot inicial só mudam documentação e `vercel.json` (o deploy automático da Vercel fica desligado; o guia passa a apontar para a Hostinger).

## 2. O que este repositório é

Fork do [Bluesky social-app](https://github.com/bluesky-social/social-app) (MIT), rebatizado como AQUA. O app principal é React Native + Expo 54 (web, iOS, Android). Em volta dele há pacotes web e backends que **não entram** no bundle da Hostinger.

Identidade em execução hoje:

- Serviço padrão do app: `https://bsky.social` (`src/lib/constants.ts`, `BSKY_SERVICE`).
- AppView público: `https://public.api.bsky.app`.
- Sessão web: `localStorage`. Sessão nativa: fila persistida do app (AsyncStorage / armazenamento seguro herdado do Bluesky).
- PDS próprio: só a receita `deploy/pds/docker-compose.yml` (imagem `ghcr.io/bluesky-social/pds:0.4` + Caddy). Não está no ar neste domínio.

Build e publicação:

| Peça | Papel |
| --- | --- |
| `npm run build` / `yarn build-web` | Compila catálogos Lingui, exporta o site com Webpack, roda `scripts/post-web-build.js` |
| Saída | `web-build` |
| `HOSTINGER.md` | React, raiz `./`, npm, Node 20.19+, fallback SPA via `web/.htaccess` |
| `vercel.json` | `deploymentEnabled: false`. Não é o caminho de produção |
| `eas.json`, `Dockerfile`, workflows de iOS/Android/EAS | Herança do app nativo Bluesky. Não são o site atual |
| `.github/workflows/lint.yml` | Em pull request e em push para `main` (o branch padrão **não** se chama `main`): `yarn --frozen-lockfile`, lint, lockfile-lint, Prettier, `intl:build`, `tsc`, Jest |
| `.github/workflows/aqua-adult-api.yml` | `npm ci`, typecheck e testes da API +18, só quando esse diretório muda |
| `.github/workflows/golang-test-lint.yml` | `bskyweb/` em Go 1.25. Não foi executado nesta auditoria |

O CI da base quebra no `yarn install --frozen-lockfile` antes de lint e testes. Reproduzido aqui, no Node 22.14.0:

```text
error Your lockfile needs to be updated, but yarn was run with `--frozen-lockfile`.
```

Há um segundo problema, já descrito no PR #10 e ainda verdadeiro neste commit: `yarn install` sem lock congelado chega a baixar `lib0`, que pede Node `>=22`, e o CI usa o Node 20 do `.nvmrc`. O `postinstall` também falha no patch `patches/@mattermost+react-native-paste-input+0.8.1.patch` porque o pacote instalado é `2.0.1`. Fora de CI o patch-package avisa e o Yarn ainda termina com código 0. Com `CI=true` esse aviso vira falha.

`yarn install` sem `--frozen-lockfile`, no Node 22, concluiu em ~93 s e foi o que permitiu typecheck, lint e Jest da raiz. O `yarn.lock` gerado por esse comando **não** foi commitado.

## 3. Mapa

```text
Conta AT (hoje bsky.social)
    sessão do app
        │
        ├─ Social (feed, posts, chat, notificações, moderação por labels)
        │     Drops (vídeo vertical do feed AT)
        │     Visionboard, Views/Streams, Stories, Wiki, Notícias
        │
        ├─ Create
        │     tela /creative-hub do app  → só Doc local
        │     aqua-docs, aqua-hub, aqua-studio, aqua-sheets,
        │     aqua-design-core, aqua-runtime, aqua-project, aqua-render
        │
        ├─ Launch Hub  → post AT real; outras redes sem backend
        ├─ Reads/Books → records place.aqua.book.* no PDS do autor
        ├─ Música      → Spotify/Apple no app; estúdio no aqua-hub e em PRs
        ├─ Shops       → menu placeholder; vitrine Nuxt + API/Mercur separados
        ├─ Games & Apps → não há produto
        └─ AQUA +18    → telas em src/screens/Adult + API aqua-adult-api
                         (não publicada; o navegador nem monta essas telas)

Fora deste checkout, de propósito não abertos:
    I.U-A.I     fonte da Consola copiada para web/ui-ai
    base-de-sinteses   não está neste repositório
```

`aqua-feeds` **não existe** como pacote. Feeds estão em `src/` (o feed do Bluesky) e, fora da base, no PR #7.

## 4. Pacotes de topo

### App (`/`, `src/`, `web/`)

React Native + Expo. Rotas em `src/routes.ts`. O shell web está em `src/view/shell/index.web.tsx` e importa `FlatNavigator` e `RoutesContainer` de `src/Navigation.tsx`.

Barra inferior: Home, Drops, Create, Mailssage (o rótulo está grafado assim), Notifications, Profile.

Menu lateral com destino: IU & AI, Visionboard, Streams, Reads, Notícias, +18 Content, Settings, Creative Hub, Launch.

Menu lateral sem destino (`PlaceholderNavItem`, não navega): Shop, Charts, News & Conventions, Portals, Communities, Fund, Wallet.

### `src/Navigation.tsx` — BROKEN

Em `dcdb62b71` (2026-10-13 19:51 -0600, “lazy-load Creative Hub and Docs”) o arquivo passou de 1547 linhas para 1. O commit seguinte, `86ff09f91`, colocou no lugar um stub de 273 linhas. O stub:

- importa dezenas de telas e não as usa;
- não exporta `FlatNavigator`, `RoutesContainer`, `TabsNavigator`, `navigate` nem `resetToTab`;
- em `commonScreens` registra só `NotFound`, `CreativeHub`, `CreativeHubTab`, `DocsHome` e `DocEditor`;
- o comentário no fim do arquivo diz que o arquivo completo teria sido deixado em `/tmp/Navigation.tsx` na máquina que fez o commit. Esse arquivo não está no Git.

O pai `dcdb62b71^` ainda registra 139 `Stack.Screen`, inclusive Home, Adult, Books, Launch, Music e Views. Os PRs #10 e #13 ainda carregam um `src/Navigation.tsx` de cerca de 51 KB. A base atual não.

Efeito: o typecheck da raiz falha nesses exports, e o bundle publicado (seção 7) não contém as telas do produto. O app social, o +18, Reads, Launch, Música e Views existem como arquivos, mas não estão montados.

### `aqua-docs`

Editor BlockNote + Yjs. Índice em `localStorage`, corpo em IndexedDB (`y-indexeddb`). Colaboração só com `?room=` via `y-webrtc` (sinalização pública padrão). Publicar no app é `postMessage` `aqua-docs:publish` para a origem `?host=`. Sem host, baixa Markdown. Sem conta e sem PDS.

`npm ci` e `tsc --noEmit`: ok.

O editor embutido no app (`src/components/docs/BlockNoteInner.web.tsx`) é o mesmo desenho, porém a colaboração em tempo real está marcada como fase 2 (ainda não ligada). Metadados do documento ficam na conta, chave `aquaDocs`.

### `aqua-hub`

SPA Vite (porta 5192) em cima do `aqua-runtime`. Ferramentas: design, apresentação, gráfico, música (piano roll + Melody Lab), mixagem, áudio, vídeo, planilha. Projeto no `localStorage`, assets no IndexedDB. Colaboração com `?room=`. Sem login, sem PDS, sem a tela Projetos do app e sem o Launch Hub. O README registra limites (osciladores em vez de instrumentos amostrados, sem EQ, vídeo dependente do `aqua-render`).

`npm ci` falha: o `package-lock.json` não contém `y-webrtc` e a árvore que o commit `946edc478` passou a exigir. `npm install` seguido de `tsc --noEmit` passou. O lockfile atualizado não foi commitado.

### `aqua-runtime`

Contrato `ToolAdapter` / `CreativeRuntime`: salvar versão, undo, colaboração em memória ou WebRTC, export para o Launch. Docs, design, música (WAV), áudio, planilha e o comando ffmpeg do vídeo estão modelados. O README ainda diz que o servidor de render e a persistência IndexedDB/PDS “não foram feitos”; o `aqua-render` já existe como processo separado, e o `aqua-project` já tem teste de IndexedDB. A UI do hub não usa um remoto.

`npm ci` falha pelo mesmo `y-webrtc` ausente do lock. Depois de `npm install`: **53 testes passaram**, `tsc` ok.

### `aqua-project`

Repositório de itens (doc, design, apresentação, planilha, vídeo, áudio, música, gráfico), assets por SHA-256 e versões. `git.ts` (isomorphic-git) é opcional e não está ligado ao runtime. **8 testes passaram**, `tsc` ok.

### `aqua-design-core`

Grafo de cena copiado do OpenPencil (MIT) + ponte Fabric.js, kit de marca, PPTX e reveal.js. Sem UI de produto. **7 testes passaram**, `tsc` ok. O README lista o que ainda não existe: boolean, imagens, auto-layout, ligação com o `aqua-studio`.

### `aqua-studio`

Editor visual baseado no react-design-editor (Layerhub, MIT). Uploads locais. Publicar envia PNG por `postMessage`. Não é o “Studios +18”. `npm ci` quebra em peer dependency do Base UI (`styletron-react`). Com `npm install --legacy-peer-deps` (o que o README pede) o `tsc` passou. Não há suíte de teste.

### `aqua-sheets`

Spike do Univer para medir bundle (README: ~6,8 MB, gzip ~1,8 MB). Não é um produto de planilha publicado. `npm ci` e `tsc`: ok.

### `aqua-render`

Servidor HTTP que recebe um `VideoProject` e roda ffmpeg à parte. Exige `AQUA_RENDER_TOKEN` (mínimo 16 caracteres). Assets na memória, um token compartilhado, sem usuário. **6 testes passaram, 4 ignorados** (ffmpeg real não estava no PATH). `tsc` ok. Licença: build com libx264 é GPL; o processo não embute o binário.

### `aqua-shops` e `aqua-shops-backend`

Vitrine Nuxt 4 (NuxtCommerce, MIT). Sem `AQUA_SHOPS_API`, usa catálogo fictício e checkout que não cobra.

Backend: API Hono (`aqua-shops-backend/api`, porta 9100) na frente do Mercur/Medusa (Postgres 16 + Redis 7). Pix via interface `PaymentProvider`: `asaas` e `fake`. O README diz que o fluxo foi testado com Asaas de mentira, não com o sandbox real. Pedidos no schema `aqua` do Postgres. O app AQUA não abre a loja: o item Shop do menu é placeholder. Não há login com DID.

API: **52 testes passaram, 5 ignorados** (`store.pg.test.ts`, precisa de Postgres). `tsc` ok.

### `aqua-adult-api`

Fastify + TypeScript. Dev/teste: PGlite em `.data/pglite` e mídia em `.data/media`. Produção: Postgres (`DATABASE_URL` obrigatório), segredo HMAC de mídia, `AQUA_SERVICE_DID`. O processo recusa subir em produção com pagamento simulado, sem segredo, sem banco ou sem DID de serviço.

Módulos: auth por service-auth do PDS, entitlements, economia, mídia (ffmpeg), views, live, library, studios, reads, drops, boards, dashboard, safety (denúncia, caso, RBAC, auditoria, gancho de hash-matching).

**187 testes passaram** (11 arquivos). `tsc` ok. `npm audit`: 1 vulnerabilidade alta. O README e `docs/aqua-adult/final-architecture.md` ainda falam em 150 testes; a suíte cresceu.

URL padrão do app: `http://127.0.0.1:4318` (`EXPO_PUBLIC_AQUA_ADULT_API_URL`). DID padrão: `did:web:adult-api.aqua.localhost`. Nada disso está publicado.

### O que mais está na raiz

| Caminho | O que é |
| --- | --- |
| `bskyweb`, `bskylink`, `bskyogcard`, `bskyembed` | Serviços Go/JS herdados do Bluesky (link proxy, card OG, embed). Não são o produto AQUA |
| `drops/` | Módulo nativo de mídia infinita. O README ainda manda trocar o mock de `example/data/media.ts` por um feed real. A tela do app (`src/screens/Drops`) já lê o feed de vídeo do AT Protocol, mas não está montada no navegador |
| `modules/` | Módulos Expo nativos herdados |
| `deploy/pds` | Compose de referência do PDS |
| `web/ui-ai` | Cópia estática da Consola. Ver seção 11 |
| `docs/aqua-adult`, `docs/aqua-*.md` | Planos. Vários trechos estão atrás do código (a API +18 existe; o doc de setembro ainda dizia que não) |

## 5. Mocks, placeholders e integrações simuladas

| Lugar | O que é simulado ou vazio |
| --- | --- |
| Menu Shop, Charts, News & Conventions, Portals, Communities, Fund, Wallet | `PlaceholderNavItem`: não navega |
| Creative Hub do app | Só o formato Doc abre editor. Post, story, vídeo, apresentação, banner e capa mostram “Em breve” e um toast de “próxima etapa” (`available: false` em `src/lib/creative-hub/model.ts`) |
| Launch Hub, redes externas | `integrationBackend` em `src/lib/launch-hub/backend.ts` responde que a API de integração não está configurada. OAuth, cofre e fila não existem. O post no AQUA/Bluesky usa a sessão AT de verdade |
| Música no app | Sem `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` e sem token da Apple, a tela diz “Ainda não configurado neste app”. Deezer e YouTube Music estão documentados como impossíveis |
| +18 pagamentos | `MockPaymentProvider` e `/dev/mock-checkout/:ref/complete`. Telas (`AdultVideo`, `AdultLive`, `AdultStudios`) completam esse checkout de teste sem exigir `__DEV__`. Produção da API recusa iniciar com mock ligado |
| +18 idade | Cliente: gate `adult_age_verification` do Statsig, **desligado por padrão**, então basta “Tenho 18 anos ou mais”. Servidor: em produção exige verificação, a menos que `AQUA_ADULT_AGE_VERIFICATION_ENABLED=0`. O provedor real não existe; `/dev/age-verification` é mock |
| +18 hash-matching | `registerMatchingProvider()` não tem provedor registrado. Sem provedor, o scan devolve ok e **não** quarentena (`aqua-adult-api/src/safety/matching.ts`) |
| +18 mensagens e configurações | `src/screens/Adult/placeholders.tsx`: “Em desenvolvimento” |
| +18 console de moderação | Só a API `/admin/*`. Não há tela de equipe |
| Shops | Catálogo demo na vitrine; provedor `fake`; Asaas real não exercitado; item de menu não abre a loja |
| `aqua-hub` / `aqua-docs` | Persistência local. Publicar fora do embed baixa arquivo |
| Drops (`drops/example`) | Dados de exemplo. A tela do app é outra coisa (feed AT), e não está montada |
| PDS, AppView, Relay, Ozone | Documentados, não implantados |
| Games & Apps | Não há código de loja, runtime ou catálogo. O Launch Hub só tem o rótulo “Lançamento de app/jogo” |

TODOs espalhados em `src/` são em grande parte herança do Bluesky (tipos, SDK, simulador). Os que mudam o produto AQUA estão nas linhas da tabela acima, não numa lista de comentários.

## 6. Auth, permissão e persistência

**Identidade.** Uma conta AT. Não existe “AdultUser”. O +18, quando a API responde, pede `com.atproto.server.getServiceAuth` com audiência no DID do serviço e usa só o DID do token. Header `x-aqua-dev-did` só vale com `AQUA_DEV_AUTH=1` e nunca em produção.

**Permissões.**

- Social: a moderação é a do Bluesky (labels, listas, bloqueio). Não há Ozone próprio.
- +18: papéis SUPPORT, MODERATOR, SENIOR_MODERATOR, TRUST_SAFETY, FINANCE, ADMIN, SUPERADMIN. O primeiro superadmin vem de `AQUA_SUPERADMIN_DIDS`. Ledger, auditoria e ações de moderação são tabelas só de inserção. Isso está testado na API e **não está no ar**.
- Shops: papéis do Mercur (admin/vendedor). O vendedor não tem DID até alguém preencher `seller.metadata.did`.
- Launch: o navegador não vê token de rede externa porque o backend que guardaria esses tokens não existe.
- Create: não há ACL. Quem tem o IndexedDB daquele navegador tem o arquivo.

**Onde os dados moram.**

| Dado | Onde | Barreira real? |
| --- | --- | --- |
| Posts, perfil, follows, chat | PDS da conta (hoje `bsky.social`) | Público no protocolo, salvo DMs do chat service |
| Sessão | `localStorage` na web | Some se limpar o site; não é conta própria |
| Docs do app | IndexedDB `aqua-doc-<id>` + metadados na conta | Só naquele navegador |
| Hub / runtime / projeto | `localStorage` + IndexedDB | Só naquele navegador. Git do projeto não tem remoto |
| Books/Reads | `place.aqua.book.book` e `place.aqua.book.chapter` no repo do autor | Record AT é público. “Privado” só esconde na UI |
| Views, stories, visionboard, canal | Records `place.aqua.*` no mesmo PDS | Mesma ressalva |
| Pedido e estoque Shops | Postgres do Mercur (não publicado) | Desenhado para não ir ao PDS |
| +18 (post, compra, histórico, mídia, denúncia) | Banco da `aqua-adult-api` (não publicado) | Desenhado para não ir ao grafo social. Mídia de produção (R2/CDN) não existe; no dev o arquivo fica em `.data/media` |
| Idade +18 | Cliente: autodeclaração na sessão. Servidor: resultado do provedor, se um dia existir | Autodeclaração não é verificação |

## 7. Testes, typecheck e lint

Comandos da raiz, Node 22.14.0, depois de `yarn install` (lock não congelado; patch do paste-input falhou e foi ignorado fora de CI).

| Comando | Resultado |
| --- | --- |
| `yarn install --frozen-lockfile` | Falha imediata: lockfile desatualizado |
| `yarn typecheck` | **15 erros.** Os que derrubam o app: `FlatNavigator`, `RoutesContainer`, `TabsNavigator`, `navigate` e `resetToTab` não são exportados por `Navigation.tsx`. Também: módulo `@mattermost/react-native-paste-input` sem tipos (o patch não aplicou), toasts em Reads, e um acesso a `.book` em `Profile/Sections/Books.tsx` |
| `yarn lint` | **191 erros, 122 avisos.** 190 erros são `@typescript-eslint/no-unused-vars` em `Navigation.tsx` (imports do stub). O resto é herança (sombra de variável, react-compiler) |
| `yarn test` (traz `--bail`) | Para no primeiro arquivo. Jest da raiz coleta `aqua-adult-api/test/phase13-dashboard.test.ts` (é Vitest; `./helpers.js` não resolve) e falha `__tests__/lib/string.test.ts`: esperava `"Bluesky Social"`, recebeu `"Aqua Social"` |
| Jest da app, sem `--bail`, ignorando `aqua-*`, `drops/` e `bsky*` | **50 suítes: 49 passaram, 1 falhou. 764 testes passaram, 1 falhou, 28 `todo`.** A única falha é o nome “Aqua Social” no teste de domínio |

Pacotes, no mesmo Node:

| Pacote | Instalação | Testes | Typecheck |
| --- | --- | --- | --- |
| `aqua-adult-api` | `npm ci` ok | 187 passaram | ok |
| `aqua-project` | `npm ci` ok | 8 passaram | ok |
| `aqua-design-core` | `npm ci` ok | 7 passaram | ok |
| `aqua-runtime` | `npm ci` falha (lock sem `y-webrtc`); `npm install` ok | 53 passaram | ok |
| `aqua-render` | `npm ci` ok | 6 passaram, 4 ignorados (ffmpeg) | ok |
| `aqua-shops-backend/api` | `npm ci` ok | 52 passaram, 5 ignorados (Postgres) | ok |
| `aqua-docs` | `npm ci` ok | sem suíte | ok |
| `aqua-hub` | `npm ci` falha (lock sem `y-webrtc`); `npm install` ok | sem suíte | ok |
| `aqua-sheets` | `npm ci` ok | sem suíte | ok |
| `aqua-studio` | `npm ci` falha (peer do Base UI); `--legacy-peer-deps` ok | sem suíte | ok |

Não rodei: Prettier, `yarn intl:build`, suíte Go de `bskyweb`, E2E Maestro, lint nativo (Swift/Kotlin), build Webpack de produção. O CI também não chega nesses passos enquanto o lockfile congelado falhar.

O PR #10 (`cursor/fix-ci-node22-lockfile-f4ad`, rascunho) e o PR #13 (`fix/lockfile-node22`) tratam Node 22, lockfile, patch e o fato de o Jest coletar suítes dos pacotes irmãos. Nenhum dos dois está mergeado. Os dois ainda contêm o `Navigation.tsx` grande; mergeá-los por cima do stub precisa de revisão humana, porque pode restaurar o navegador ou gerar conflito.

## 8. Site ao vivo contra este branch

Origem: `https://www.aquaapp.systems`, lido em 2026-10-14 por volta de 03:16 UTC.

- Cabeçalho `platform: hostinger`. Não é a Vercel.
- `index.html` título “Aqua”, splash com o olho azul `#002bef`, scripts `static/js/77.5e2cb01b.js` e `static/js/main.3b648608.js`.
- O manifesto embutido diz `version: 1.111.0`, `name: Aqua`, `slug: aqua`.
- O source map de `main.3b648608.js` está público. 687 arquivos `src/` mapeados são **byte a byte** iguais a este branch. Os 14 caminhos “só no mapa” são shims web de módulos nativos (`modules/`, `NotImplemented.ts`), não produto novo.
- `src/Navigation.tsx` no mapa é o stub de 273 linhas.
- No JavaScript executável não há `FlatNavigator:` como export. O shell chama `a.FlatNavigator`. Também não há `adultHomeScreen`, `HomeScreen` (o que aparece é `DocsHomeScreen`), `place.aqua.book` nem `127.0.0.1:4318`. Há módulos de Creative Hub e de AQUA DOCS, porque o stub faz `require()` deles. A tabela de rotas (`/adult`, `/books`, `/launch`, `/views`, …) está no bundle porque `routes.ts` está no bundle; a rota não monta a tela.
- Não abri o site num navegador gráfico. A conclusão vem do HTML, dos chunks (48) e do source map. O typecheck confirma que o fonte desse bundle não exporta o navegador que o shell importa. O esperado ao abrir o site é a splash e, em seguida, a falha de render do shell.

**No repositório e fora do ar**

Quase todo o produto AQUA está no Git e fora do grafo publicado: Home e o feed social, +18 (telas e API), Reads, Launch, Música, Views, Wiki, Notícias, Drops, Visionboard como telas, Shops, PDS, `aqua-hub`, `aqua-render`, `aqua-adult-api`. O código está no branch; o deploy deste commit não o executa.

**No ar e não como produto deste branch**

- `/ui-ai/` responde “Consola da U.I.”. É HTML estático copiado para o build (`web/ui-ai`), servido direto pelo Apache, sem passar pelo app. A página fala com `http://localhost:8765` na máquina de quem abre. A fonte declarada é o repositório I.U-A.I. Isso está neste branch; não é um servidor de IA no ar.
- Não há feature no bundle que não esteja neste commit. O `last-modified` do HTML (03:16 UTC) é posterior ao commit (02:14 UTC) porque houve um deploy, não porque o site esteja num branch mais novo. O source map bate com `a884c57e`.

PRs que acrescentariam comportamento ainda não publicado: #7 (feeds), #8 (Launch assistido), #9 e #16 (Views), #12 (Stories), #15 (portal +18), #18 (git semântico), #19–#23 (música, empilhados). Nenhum está mergeado.

## 9. Classificação

| Módulo | Estado | Por quê |
| --- | --- | --- |
| Navegador do app (`Navigation.tsx`) e site publicado | BROKEN | Stub não exporta o shell e não registra as telas. O bundle no ar é esse stub |
| Identidade / sessão AT | FUNCTIONAL BUT LIMITED | Login Bluesky funciona no código herdado, mas o shell que o mostraria não monta. Não há PDS AQUA |
| Social (feed, post, perfil, chat, notificação) | FUNCTIONAL BUT LIMITED | Código herdado do Bluesky, testado em parte, persistido no PDS público. Inalcançável enquanto o navegador estiver quebrado. Não é rede própria |
| Feeds “Em alta” / “Pra você” | NOT IMPLEMENTED na base | Estão no PR #7, não neste commit |
| Drops (tela do app) | PARTIAL | Lê vídeo vertical do feed AT e curte de verdade, mas a tela não está registrada |
| Drops (`drops/example`) | MOCKED | Pacote de exemplo ainda descrito com mídia fictícia |
| Create no app (`/creative-hub`) | PARTIAL | Doc local abre. Os outros formatos são “Em breve” |
| AQUA DOCS no app | FUNCTIONAL BUT LIMITED | BlockNote + IndexedDB neste navegador. Sem colaboração e sem publicação no PDS a partir do editor |
| `aqua-docs` / `aqua-hub` standalone | FUNCTIONAL BUT LIMITED | Editores reais, dados locais, publicar = mensagem ou download. Não estão no site |
| `aqua-runtime`, `aqua-project`, `aqua-design-core` | FUNCTIONAL BUT LIMITED | Bibliotecas com teste. Sem UI de produto ligada à conta |
| `aqua-sheets` | PARTIAL | Spike de bundle, não um editor entregue |
| `aqua-studio` | FUNCTIONAL BUT LIMITED | Editor de design local. Não entra no app |
| `aqua-render` | FUNCTIONAL BUT LIMITED | Servidor de ffmpeg com token compartilhado e disco nenhum. Não publicado |
| Projetos (tela) | PARTIAL | O hub do app lista docs da conta. O repositório `aqua-project` não é essa tela |
| Launch Hub | PARTIAL | Post AT é real. TikTok, Instagram, YouTube, Wattpad e o resto estão no catálogo e falham com “API de integração não configurada”. O PR #8 não está na base |
| Media / Views / Streams | PARTIAL | Records, player, canal e biblioteca existem em `src/` e não estão montados. Correções no PR #9 |
| Visionboard | PARTIAL | Records e telas no repo; o menu aponta para `/visionboard`, a tela não está no navegador |
| Stories | PARTIAL | Records `place.aqua.actor.story`. Visual mais próximo do Instagram está no PR #12 |
| Wiki e Notícias | PARTIAL | Telas no repo (`/wiki`, `/noticias`), fora do navegador. Wiki usa a Wikipedia e a chave DEMO da NASA se não houver `EXPO_PUBLIC_NASA_API_KEY` |
| Reads / Books | PARTIAL | Modelo, validação e telas (20 testes de modelo na suíte que passou). Sem indexador: a home só vê quem você segue. “Privado” não é barreira. Maturidade 18+ não está ligada ao gate |
| Música (ouvir) | PARTIAL | Adaptadores Spotify (Premium + PKCE) e Apple Music. Sem as variáveis de build, não conecta |
| Música (criar) | FUNCTIONAL BUT LIMITED no `aqua-hub`; NOT IMPLEMENTED na base como produto Tone.js | Piano roll e Melody Lab são locais. Fases 1–5 de Tone.js/MIDI/mixer são os PRs #19–#23, não este branch |
| Shops | PARTIAL + MOCKED | Contrato e API com teste; vitrine com demo; Pix Asaas não passou no sandbox; menu é placeholder |
| Studios (design, `aqua-studio`) | FUNCTIONAL BUT LIMITED | Ver acima. Não confundir com o estúdio +18 |
| Studios +18, Views +18, Live +18, Library | PARTIAL | API testada em dev, cliente chama `localhost:4318`, nada publicado, telas não montadas |
| Mensagens +18 e configurações +18 | PLACEHOLDER | Texto “Em desenvolvimento” atrás do gate |
| Pagamentos +18 | MOCKED | Mock que a produção da API se recusa a ligar. O cliente mesmo assim chama `/dev/mock-checkout` |
| Games & Apps | NOT IMPLEMENTED | Sem módulo. Só um tipo de lançamento no catálogo do Launch Hub |
| U.I. / página `/ui-ai` | FUNCTIONAL BUT LIMITED | HTML estático no ar. A inteligência roda na máquina local de quem pareou. Não foi auditada por dentro |
| PDS / AppView / Relay próprios | NOT IMPLEMENTED | Só documentação e compose |
| Aqua +18 como produto público | NOT IMPLEMENTED para lançamento | Ver seção 10. Código de desenvolvimento não é produção |

Nenhum item da tabela é COMPLETE nem PRODUCTION READY.

## 10. Dependências da cadeia pedida

Ordem real, não a ordem do menu.

1. **Identity.** Tudo que grava usa o DID da sessão AT. Sem sessão não há doc da conta, livro, canal, compra ou gate. Enquanto o serviço for `bsky.social`, a identidade não é da AQUA e o grafo é público.
2. **Social.** Feed, perfil, likes e respostas. Drops, comentário de capítulo (o capítulo publica um post e as respostas são os comentários) e card de loja dependem disso. O +18 não deve escrever follow, like nem histórico nesse grafo; o feed +18 atual já lê só a API própria.
3. **Create.** Docs e o hub produzem o arquivo. O app só consome o Doc local. Design, vídeo e música de criação não voltam para o perfil.
4. **Projects.** `aqua-project` é a camada que deveria guardar o que o Create produz, com versão. O runtime sabe exportar para o Launch; a tela Projetos do app não usa esse repositório.
5. **Launch Hub.** Devia receber o export do projeto e publicar. Hoje só o destino AQUA/Bluesky posta de verdade, e a partir do compositor, não do arquivo do hub.
6. **Media.** Views, Drops, Stories e o render de vídeo. O player e os records estão no app; o render está num servidor à parte; nenhum dos dois está no site.
7. **Shops.** Depende da identidade (DID do vendedor) e, no desenho, de um card no post/Drop. Os dois lados não estão ligados. O pagamento da loja (Asaas) é outra pilha, e não serve para +18.
8. **+18.** Depende da identidade, mas precisa de banco, mídia privada, idade, moderação e pagamento próprios. Não pode reutilizar o PDS público nem o PSP da loja. Isolar Social e Adult é pré-condição, não um ajuste de UI.
9. **Studios.** Três coisas diferentes: o editor `aqua-studio` (Create), o “studio” de canal em Views, e o estúdio de filme/série da API +18. Só o terceiro é catálogo adulto, e ele depende da economia e da mídia da API.
10. **Books / Write.** Reads grava no PDS do autor e anuncia no feed social. É Social + Create de texto. O campo de maturidade 18+ ainda não passa pelo gate. Não há PR aberto só de “Write feed”: o feed `/reads` (`ReadsFeedScreen`) já está neste branch.
11. **Music.** Ouvir não depende do Create: é OAuth do Spotify/Apple na sessão local. Criar depende do hub (ou dos PRs #19–#23) e, para sair do aparelho, do Launch ou de um record. As duas metades não se encontram.
12. **Games & Apps.** Não há runtime. O único gancho é um tipo de lançamento no Launch Hub, que por sua vez não tem a API de integração. Não bloqueia as fases anteriores e não deve ser prometido no menu.

## 11. O que não foi aberto

- **I.U-A.I / U.I.** O `.gitignore` ignora `/I.U-A.I/`. Esse diretório não está neste checkout. `web/ui-ai/README.md` diz que a Consola foi copiada de lá (`ui/web/consola.html` e `logo.svg`) e que a página no ar conversa com a U.I. em `localhost:8765`. Não li o repositório I.U-A.I nem o diretório ignorado. A cópia em `web/ui-ai` é o que o site serve.
- **base-de-sinteses.** Não há diretório, remote nem referência com esse nome neste repositório. Não foi aberto. O PR #7 menciona “Git pessoal no formato da Base”; isso é outro assunto (feeds e git semântico), e também não foi mergeado.

## 12. Segurança que impede um lançamento público

O site atual não chega a expor o +18, porque o navegador não monta as telas. Isso não é controle de segurança. Religar o `Navigation.tsx` sem o restante desta lista colocaria o gate de autodeclaração na frente de uma API que, no build, aponta para `127.0.0.1`.

**Idade.** O cliente trata “Tenho 18 anos ou mais” como entrada quando o gate `adult_age_verification` está desligado, e ele nasce desligado. O fluxo de age assurance herdado do Bluesky concede acesso “Full” a partir de data de nascimento declarada (mínimo 13) onde não há lei de verificação; o código do gate +18 já recusa usar isso como prova (`Assured` + `Full`). Sem um provedor externo, ninguém fica “verificado”, e a autodeclaração continua abrindo a porta no cliente. A API, em produção, faz o contrário: só verificação real, a menos que alguém defina `AQUA_ADULT_AGE_VERIFICATION_ENABLED=0`. Cliente e servidor discordam, e o servidor não está no ar.

**CSAM e NCII.** Não há detector caseiro, e isso é o certo. O ponto de encaixe (`registerMatchingProvider`) não tem provedor. Sem provedor, o upload segue. Erro de um provedor que exista quarentena (fail closed); a ausência de provedor não. Também não há canal com autoridade, lista de hashes da indústria, fila humana nem retenção de evidência. Isso sozinho impede qualquer upload de mídia adulta.

**Moderação.** A API tem denúncia, caso, apelação, takedown, remoção de emergência, RBAC e auditoria só de inserção, com testes. Não há console, equipe, SLA nem procedimento. O social continua na moderação do Bluesky. `docs/MODERACAO.md` é um rascunho de princípios, não uma política publicada.

**Isolamento Social / Adult.** O desenho atual do feed +18 lê a API, não o grafo público, e o teste estático `adult-firewall` passou na suíte do app. Records de livro, view e visionboard continuam no PDS público. Mídia “privada” de desenvolvimento está em pasta local da API. URL de playback assinada pode ser reenviada até o TTL (o próprio relatório de fase 15 aponta isso, teto de 300 s). Rate limit é memória de um processo. Nada disso foi implantado com Postgres, bucket privado e CDN.

**Pagamentos.** +18 só tem mock, e o cliente completa o mock. Stripe/PayPal não servem para essa categoria; não há CCBill, Segpay, Epoch nem equivalente ligado. Repasse de criador é modelo, sem transferência. Shops é outra trilha (Asaas, split, CNPJ) e também não está em sandbox real. CPF de comprador na loja precisa de política de LGPD antes de qualquer abertura.

**Outros bloqueios de lançamento, mesmo sem +18.**

- Source map de produção público (`main.3b648608.js.map`).
- App apontando para `bsky.social`, com termos e guidelines ainda linkados para `bsky.social`.
- `Navigation.tsx` quebrado: o site não é um produto utilizável.
- Lockfile e Node do CI impedem saber se o próximo PR está verde.
- Vulnerabilidade alta na API +18 (`npm audit`) e o patch de paste-input que não aplica.
- ffmpeg estático da API é GPL-3.0; o README manda usar o ffmpeg do sistema em produção.
- Credenciais de seed do Mercur (`supersecret`) são de desenvolvimento. Não podem ir para um VPS.

Nenhum item desta seção foi “corrigido” por esta auditoria.

## 13. Ordem sugerida

Porte é o tamanho da mudança (o que se mexe e o que depende do quê), não um prazo.

| Fase | O que fazer | Porte | Depende de |
| --- | --- | --- | --- |
| 0 | Restaurar `Navigation.tsx` a partir de `dcdb62b71^` (ou do arquivo de 51 KB nos PRs #10/#13) e registrar de novo as telas. Confirmar no browser que Home, uma rota direta e o menu abrem | Pequeno no diff, bloqueia todo o resto. Risco alto se o merge dos PRs de CI for feito no escuro | Nada |
| 1 | Deixar o CI instalar: Node 22 no `.nvmrc`, lockfile coerente, patch do paste-input, Jest sem engolir Vitest dos pacotes, teste `toNiceDomain` esperando “Aqua Social”, lint do navegador restaurado. Atualizar os locks de `aqua-hub` e `aqua-runtime` (`y-webrtc`) | Médio | Fase 0, para o lint não voltar a 190 erros de import morto |
| 2 | Identidade: PDS próprio no ar, app apontando para ele, convite e termos da AQUA. Até lá, não gravar nada que não possa ser público na rede Bluesky | Grande (infra, DNS, operação) | Fase 0 |
| 3 | Social utilizável em cima do navegador restaurado: postar, seguir, Drops com o feed AT, denúncia. Feeds “Em alta” / “Pra você” só com o PR #7, que é um algoritmo novo e grande (+13 mil linhas) e precisa de revisão própria | Médio para religar o que já existe; grande se incluir o #7 | Fases 0 e 2 se a rede for própria; senão segue em `bsky.social` |
| 4 | Create dentro do app: um editor (Doc já está) com dono, e só depois embutir o hub. Não tratar o Vite da porta 5192 como se fosse o produto | Grande | Identidade, para o arquivo não morar só no navegador |
| 5 | Ligar `aqua-project` à tela Projetos e ao export do runtime | Médio | Fase 4 |
| 6 | Launch Hub: primeiro o post AQUA a partir de um arquivo do projeto. Redes externas só quando existir a API de integração (cofre, OAuth, fila). O PR #8 é modo assistido em cima dessa ausência | Grande | Fases 3 e 5 |
| 7 | Views/Streams: merge criterioso dos PRs #9 e #16, records no PDS, player. Render de vídeo (`aqua-render`) fica interno, com token por usuário, não um segredo único | Médio | Fases 0 e 2 |
| 8 | Reads: manter descoberta por seguidos até existir indexador. Não usar “livro privado” como se fosse segredo. Não ligar maturidade 18+ ao social | Médio | Social e PDS |
| 9 | Música: ouvir, se as chaves Spotify/Apple existirem (pequeno). Criar no hub ou via PRs #19–#23 (grande, cinco PRs empilhados, fora da base) | Pequeno / grande | Create e, para publicar, Launch |
| 10 | Shops: Postgres, Mercur sem senha de seed, sandbox Asaas, DID do vendedor, aí sim trocar o placeholder do menu. Pagamento da loja não financia o +18 | Grande | Identidade |
| 11 | Games & Apps | Não começar. Não há base além de um rótulo | Launch e identidade, e uma decisão de produto que ainda não está no repo |
| 12 | +18, por último | Grande, e não é só código | Tudo abaixo |

A fase 12 só começa a ser discutida como lançamento quando, juntas, existirem:

1. Provedor de age assurance; a autodeclaração deixa de abrir o gate no cliente e no servidor.
2. Hash-matching externo de CSAM/NCII, com falha fechada também quando não há provedor, mais canal e procedimento jurídico. Sem isso, sem upload.
3. Moderação operada por gente, com console, fila e auditoria, não só rotas `/admin`.
4. Banco, bucket privado e CDN no ar; nenhum byte adulto no PDS público; Social e Adult sem escrita cruzada, revalidado fora do teste estático.
5. PSP que aceite a categoria, sem `/dev/mock-checkout` em build de produção, ledger e reembolso reais.
6. API com `AQUA_SERVICE_DID`, segredo de mídia e Postgres, CORS só do domínio do app, source map desligado, e o app deixando de apontar para `127.0.0.1`.

Até lá o +18 permanece o que os próprios relatórios em `docs/aqua-adult/` já dizem: implementado para desenvolvimento, não pronto para produção.

## 14. PRs abertos que esta leitura considerou

Contra `1.111.0-ota-5`, em 14 de outubro de 2026. Nenhum foi mergeado nem alterado.

| PR | Título | Nota para a auditoria |
| --- | --- | --- |
| #7 | Feeds “Em alta” e “Pra você” + git pessoal | Fora da base. Algoritmo de convenções. Não é o feed de Reads |
| #8 | Launch Hub modo assistido | Não cria a API de integração que o backend atual deixa desconfigurada |
| #9 | Correções de Views | Pequeno, em cima de telas que o navegador não monta |
| #10 | Node 22 e `yarn.lock` | Rascunho. É o conserto de install citado no pedido. Também mexe em `Navigation.tsx` (arquivo grande) |
| #11 | Olho da Aqua no lugar da borboleta | Rascunho visual |
| #13 | CI: lockfile, Node 22, patch, lint, testes, typecheck | Irmão do #10, não citado no pedido, mas é o outro conserto de CI aberto |
| #14 | Esconder linhas verticais das colunas | Rascunho de CSS, 2 arquivos |
| #12, #15, #16, #17, #18 | Stories, portal +18, redesign de Views, IU Chat, git semântico | Abertos; não entram na base auditada |
| #19–#23 | Música, fases 1 a 5, empilhados | Não estão em `1.111.0-ota-5` |

Não há PR aberto cujo título seja um feed de Write / escrita. O feed de leitura em partes já está na base: `src/screens/Books/ReadsFeedScreen.tsx`, rota `/reads`.

## 15. Limites desta auditoria

- Não houve sessão logada, nem celular, nem build nativo, nem ffmpeg no PATH, nem Postgres/Redis/Docker para Mercur ou PDS.
- O site foi lido por HTTP e pelo source map, sem clique numa sessão real.
- `yarn install` da raiz reescreveu `yarn.lock` na árvore de trabalho; esse arquivo foi restaurado antes do commit desta auditoria. O mesmo vale para os locks de `aqua-hub` e `aqua-runtime`.
- I.U-A.I e base-de-sinteses não foram abertos.
