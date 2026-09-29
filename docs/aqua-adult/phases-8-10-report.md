# AQUA +18 — Relatório das Fases 8, 9 e 10

Estado em 2026-09-29. **Ambiente de desenvolvimento apenas.** Nada foi
implantado, nenhum pagamento real foi conectado, nenhum DNS foi alterado.

> TECHNICALLY IMPLEMENTED (dev) ≠ PRODUCTION READY.

## Commits (checkpoints)

| Fase | Commit | Testes da API |
|---|---|---|
| 8 — Creator Economy | `9b95cd54f` | 30 |
| 9 — Media Engine + Views +18 | `4656a2f97` | +15 (45) |
| 10 — Studios +18 | `7ee9b2639` | +16 (61) |

Build: `tsc --noEmit` limpo na API; `npm run typecheck` do app sem erros
nos arquivos destas fases (ver "Problemas encontrados" para 5 erros
pré-existentes de dependências do app). `vitest`: 61/61 passando.
Smoke test com o servidor real: `/health` ok, anônimo → 401, sem
verificação de idade → 403, CORS só para a origem do app.

## Arquitetura

Novo serviço **`aqua-adult-api/`** (projeto separado, próprio
`package.json`): Node.js + TypeScript + Fastify. PostgreSQL em produção
(`pg`), **PGlite** (Postgres embutido) em desenvolvimento/testes — mesmas
migrations SQL. O app nunca decide acesso: pede ao servidor.

```
App (contexto +18)
  └─ token de serviço assinado pelo PDS do usuário (sem segundo login)
       └─ aqua-adult-api
            ├─ Auth (service JWT: aud = DID do serviço)
            ├─ Entitlements (autoridade única de acesso, fail closed)
            ├─ Creator Economy (ofertas, pedidos, pagamento abstrato, ledger)
            ├─ Media Engine (upload, processamento, autorização temporária)
            ├─ Views +18 (vídeos de creators)
            └─ Studios +18 (filmes, séries, temporadas, episódios, coleções)
```

Fluxo econômico: `Creator/Studio → Offer → Order → PaymentProvider →
webhook assinado → Order PAID → Entitlement → Media Engine → conteúdo`.
O frontend nunca libera conteúdo por "pagamento ok".

## Migrations

- `001_economy.sql` — adult_accounts (só resultado da verificação de
  idade), creators, fee_config (bps configuráveis), subscription_tiers,
  adult_resources (política no servidor), offers, orders, payment_events,
  subscriptions, entitlements, ledger_entries, audit_events. Triggers
  append-only em ledger, auditoria e eventos de pagamento; `ON DELETE
  RESTRICT` em pedidos/ofertas.
- `002_media_views.sql` — media_assets, media_variants, upload_sessions
  (só hash do token), videos, adult_watch_progress, adult_watch_history,
  view_events.
- `003_studios.sql` — studios, studio_members, movies, series, seasons,
  episodes, collections, collection_items, production_credits.

## Modelos (resumo)

Order (9 status), CreatorSubscription (8 status, `target_type`
creator|studio), SubscriptionTier (nome livre do creator), Offer
(ppv/purchase/rental/subscription, preço em unidade mínima), Entitlement
(tipos distintos: purchase permanente, ppv/rental com janela, subscription
por período, collection, administrative; revogação preserva registro),
RevenueEntry (SALE, PLATFORM_FEE, PROCESSING_FEE, REFUND, CHARGEBACK,
ADJUSTMENT, PAYOUT, RESERVE, RESERVE_RELEASE), MediaAsset (8 estados),
MediaVariant (hls/thumbnail/original…), Video, Studio, StudioMember,
Movie, Series, Season, Episode, Collection, ProductionCredit.

"Production" não virou tabela: Movie/Series já cobrem o caso sem uma
abstração extra (plano 10.8 pedia evitar abstrações desnecessárias).

## APIs

Economia: `POST /creator/resources`, `/creator/tiers` (+ `PATCH`),
`/creator/offers`, `GET /sellers/:type/:id/tiers`, `/offers/:id`,
`POST /checkout` (Idempotency key), `GET /me/orders`, `/orders/:id`,
`/me/subscriptions`, `POST /subscriptions/:id/cancel`,
`POST /webhooks/payments/:provider`, `GET /creator/ledger`,
`POST /access/check`, `GET /me/entitlements`.

Mídia: `POST /media/uploads`, `PUT /media/upload/:token`,
`GET /media/assets/:id`, `GET /stream/:token/*`.

Views +18: `POST /creator/videos` (+ `PATCH`), `GET /views/feed`,
`GET /views/videos/:id` (+ `/related`), `POST .../playback`,
`.../preview`, `.../progress`, `GET/DELETE /me/adult/history`.

Studios: `POST /studios`, `/studios/:id/members` (+ `DELETE`),
`/studios/:id/movies`, `/studios/:id/series`, `/series/:id/seasons`,
`/seasons/:id/episodes`, `PATCH /studio-titles/:type/:id`,
`/studios/:id/collections`, `/studio-credits`, `GET /studios/:id/revenue`,
`GET /studios`, `/studios/search`, `/studios/by-handle/:handle`,
`/studio-titles/movie/:id`, `/studio-titles/series/:id`,
`POST /studio-titles/:type/:id/playback|preview|progress`.

Somente DEV (retornam 404 em produção): `/dev/age-verification`,
`/dev/creator-approval`, `/dev/studios/:id/verify`,
`/dev/mock-checkout/:ref/complete`.

## Media Engine e player

- Upload: autorização de uso único (15 min), `Content-Length`
  obrigatório, limite de tamanho, validação pelo conteúdo real (magic
  bytes), armazenamento privado por interface (adaptador local em dev;
  bucket S3/R2 privado em produção).
- Processamento: ffmpeg → HLS adaptativo 720p/360p, miniaturas,
  metadados; ganchos de verificação (quarentena) para a Fase 14.
- Entrega: URL assinada por HMAC com TTL curto (padrão 5 min) por
  variante; cada playlist revalida o asset e o entitlement usado.
  Nenhuma URL de bucket ou chave de storage sai da API.
- Prévia é asset próprio; o vídeo completo nunca é "limitado no JS".
- Player: `hls.js` na web (renova a autorização ao expirar e retoma do
  mesmo ponto); `expo-video` no nativo. Studios reutiliza o mesmo player.

## Rotas do app

`/adult/views`, `/adult/views/:videoId`, `/adult/studios`,
`/adult/studios/:handle`, `/adult/title/:type/:id` — todas dentro do
`AdultShell` (portão de idade) e com `requireAuth`.

## Testes (61)

Autenticação (token forjado, audiência errada, header dev desligado),
travas de produção, PPV/compra/aluguel e expiração, idempotência de
checkout e de webhook, webhook sem assinatura/adulterado/antigo, valor
divergente, pagamento falho, precisão monetária, tiers e troca de preço,
assinaturas (renovação, past due, cancelamento, expiração), reembolso
parcial/total, disputa ganha, chargeback, IDOR, ledger imutável; upload
real, arquivo falso, tamanho, token reutilizado, mídia corrompida,
quarentena por gancho, HLS reproduzível, prévia sem acesso ao completo,
token forjado/trocado/expirado, revogação durante reprodução, quarentena
e remoção, catálogo negado sem verificação, histórico/continuar
assistindo/views, isolamento por usuário; studio (handle, página,
verificação), RBAC completo, mídia alheia, assinatura de studio, PPV,
compra, remoção, janelas e região, temporada cobre episódios, série
removida derruba episódios, coleção, créditos, busca e histórico
isolados. E2E do plano: PPV de vídeo de creator e aluguel de filme de
studio até a negação após expirar.

## Dependências (aqua-adult-api)

| Pacote | Licença | Uso |
|---|---|---|
| fastify, @fastify/cors | MIT | HTTP |
| zod | MIT | validação |
| pg | MIT | Postgres (produção) |
| @electric-sql/pglite | Apache-2.0 | Postgres embutido (dev/test) |
| @atproto/xrpc-server, identity, crypto | MIT | service auth AT |
| ffmpeg-static (binário ffmpeg 6) | **GPL-3.0-or-later** | processamento |
| typescript, tsx, vitest, @types/* | MIT/Apache | dev |

`npm audit --omit=dev`: 0 vulnerabilidades.

**ffmpeg / GPL:** executado como processo separado (não é linkado). Uso
somente no servidor, sem distribuir o binário, não gera obrigação de
publicar código. Se imagens/binários forem distribuídos a terceiros, as
obrigações da GPL se aplicam. Em produção, preferir o ffmpeg do sistema
ou um serviço gerenciado de transcodificação.

## Reutilização dos repositórios de referência

**Nenhum código** de not-only-fans, Stratala, Milkie, Hovod, Pavilion,
PPV Stream Rust ou Streamplace foi copiado ou adaptado. Esses
repositórios não estão neste projeto; a implementação foi escrita do zero
a partir das especificações das fases. Nenhuma interface visual foi
copiada.

## Problemas encontrados

1. `npm install` do app falha com Node 26/24 no módulo nativo
   `better-sqlite3` (usado só pelo `@atproto/dev-env`); resolvido antes
   com `--ignore-scripts`.
2. O `node_modules` do app voltou a ter duas cópias de
   `@tanstack/query-core`, causando 5 erros de tipo pré-existentes
   (`src/ageAssurance/*`, `src/lib/react-query.tsx`,
   `src/state/queries/preferences/const.ts`). Não vêm destas fases.
3. Outra ferramenta commitou em paralelo no repositório
   (`90922853b feat: add view event telemetry`). Nada foi misturado.
4. Bugs corrigidos durante o trabalho: referência de assinatura no
   provedor simulado; 414 por parâmetro de URL longo; conexão derrubada
   em upload grande demais; transação aguardando a si mesma no PGlite;
   pasta de dados não criada no primeiro start.

## Riscos de segurança (abertos)

- **URL assinada copiada** funciona até expirar (TTL 5 min; playlist
  revalida entitlement). Aceitável para dev; em produção considerar TTL
  menor e/ou vínculo ao usuário via header.
- **Verificação de idade no servidor é simulada** (`/dev/age-verification`).
  Sem provedor real, ninguém passa em produção (fail closed).
- **Região do espectador** não é conhecida pelo servidor; conteúdo com
  restrição regional fica negado para todos até existir geolocalização
  confiável.
- **Uploads passam pela API** em dev; em produção devem ir direto ao
  bucket privado com URL pré-assinada.
- Sem **rate limiting** ainda (Fase 15).
- Relações adultas (seguir/bloquear) continuam só no app, em memória;
  "Seguidores"/follower_only ainda não têm fonte no servidor.

## Dívida técnica

- Fila de processamento em memória (um processo). Produção: fila
  persistente (pg-boss/BullMQ) e workers isolados.
- Adaptador de storage S3/R2 não implementado (só a interface).
- Job periódico de `expireSubscriptions` não agendado (função pronta).
- Legendas (captions) aceitas no upload mas não expostas no player.
- Descoberta simples (recentes/categoria/mesmo creator); sem ranking.
- Telas do app não verificadas no navegador logado (sem conta de teste).

## Ainda simulado

- Pagamentos: somente `MockPaymentProvider` (bloqueado em produção).
- Verificação de idade, aprovação de creator e verificação de studio:
  endpoints DEV.
- Armazenamento: pasta local privada.

## Não iniciado (conforme instrução)

Fase 11 (Library) em diante.
