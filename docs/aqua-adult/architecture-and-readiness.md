# AQUA +18 — Arquitetura e prontidão

Estado em 2026-09-28. Documento de trabalho: substitui a suposição de que as
Fases 0–10 estavam concluídas e serve de plano para as Fases 8–15.

> **NÃO É PRODUCTION READY.** Nada aqui deve ser habilitado para usuários
> reais. Ver "Dependências de compliance" no fim.

---

## 1. Resumo

- O que existe é **só o app** (cliente React Native / web). O AQUA +18 ainda
  **não tem backend**.
- As Fases 2–7 estão implementadas no cliente e testadas (52 testes).
- As Fases 8–10 **não foram implementadas**: pedidos/pagamentos,
  histórico/progresso de visualização, Views +18, Studios, Media Engine.
- Consequência: **nenhuma** decisão de acesso é hoje uma fronteira de
  segurança. O motor de Entitlements roda no navegador, com grants em
  memória. Qualquer pessoa pode alterá-lo no próprio navegador.
- A mídia publicada no AT Protocol é **pública** no servidor de contas (PDS).
  Conteúdo pago não pode ser guardado ali.
- Por isso a execução das Fases 11–15 foi **parada no checkpoint**: o próprio
  plano proíbe avançar com bypass de autorização conhecido ou exposição de
  mídia protegida.

## 2. Estado por fase

| Fase | Tema | Estado | Onde |
|---|---|---|---|
| 0–1 | Levantamento / planejamento | Sem artefatos no repositório | — |
| 2 | Namespace `/adult`, shell, rotas | IMPLEMENTED | `src/screens/Adult/*`, `src/routes.ts` |
| 3 | Identidade e portão de idade | IMPLEMENTED (corrigido, ver §5.1) | `src/state/adult/context.tsx`, `gate.ts`, `entered.ts`, `AdultGate.tsx` |
| 4 | Isolamento Social ↔ Adult (cliente) | PARTIAL | `src/lib/adult/isolation.ts`, `analytics.ts`, `actionHistory.ts` |
| 5 | Modelo de conteúdo adulto | PARTIAL | `src/lib/adult/content.ts` |
| 6 | Creators + relações adultas | PARTIAL (memória) | `src/lib/adult/creator.ts`, `src/state/adult/relationships.ts`, `AdultCreator(s).tsx` |
| 7 | Entitlements (contratos + motor) | MOCKED como fronteira (motor real, store em memória) | `src/lib/adult/entitlements/*` |
| 7 | Feed +18 | PARTIAL | `AdultFeed.tsx`, `src/components/adult/AdultPostCard.tsx` |
| 8 | Pedidos, pagamentos, ledger | NOT IMPLEMENTED | — |
| 9 | Views +18, progresso, histórico | NOT IMPLEMENTED | rota `/adult/views` é placeholder |
| 10 | Studios +18 | NOT IMPLEMENTED | rota `/adult/studios` é placeholder |
| 11 | Library | BLOCKED (depende de 8, 9 e backend) | rota `/adult/library` é placeholder |
| 12 | Live +18 | BLOCKED (backend, mídia privada, entitlements) | rota `/adult/live` é placeholder |
| 13 | Creator/Studio Dashboard | BLOCKED (backend, ledger, RBAC) | rota `/adult/creator/dashboard` é placeholder |
| 14 | Trust & Safety | BLOCKED (backend, auditoria, RBAC admin) | — |
| 15 | Hardening final | BLOCKED (não há sistema completo para testar) | — |

### O que as peças existentes fazem bem

- **Portão fail-closed**: sem sessão, sem estado ou com status desconhecido,
  nega. Entrada exige ação deliberada na sessão (`entered.ts`, não
  persistido).
- **Motor de Entitlements fail-closed**: erro, política desconhecida,
  contexto ausente ou request malformado negam. Cache de decisão por
  usuário, TTL de 60 s, invalidável. Conteúdo removido só abre com grant
  administrativo. Revogação preserva o registro.
- **Classificação de dados**: domínios `adult.*` registrados; chaves de
  React Query sob o namespace `adult` com asserção; chaves de storage
  `adult.*`; analytics adultos com allowlist, fora do pipeline genérico;
  histórico de ações adulto em memória, limpo ao sair.
- **Relações adultas** (follow/block/mute) nunca são gravadas no repo AT
  público — um `app.bsky.graph.follow` exporia exatamente o que o ambiente
  deve esconder.

### Limitações das peças existentes

- Grants, relações adultas e histórico somem ao recarregar a página.
- O conteúdo "adulto" é derivado de self-labels de posts AT públicos
  (`porn`, `sexual`, `nudity`, `graphic-media`). Qualquer pessoa na rede já
  pode ver essa mídia pelo PDS; a `AccessPolicy` do cliente só esconde na UI.

## 3. Mapa de módulos (alvo)

```
AQUA
│
├── Identity            (conta AT existente; sessão do app)
├── Social              (AppView Bluesky / feeds AT — público)
├── Views               (Aqua Views, vídeo público)
├── Video+Stream        (Streamplace, público)
│
└── AQUA +18            (cliente: src/*/adult; servidor: aqua-adult-api — A CRIAR)
    ├── Feed
    ├── Creators
    ├── Views +18
    ├── Live +18
    ├── Studios +18
    ├── Library
    ├── Messages
    └── Creator/Studio Dashboard
│
├── Media Engine        (A CRIAR: storage privado + processamento + URLs assinadas)
├── Entitlements        (contratos prontos; autoridade precisa ir para o servidor)
├── Creator Economy     (A CRIAR: ofertas, pedidos, ledger, payouts)
└── Trust & Safety      (A CRIAR: denúncias, casos, ações, auditoria, RBAC)
```

## 4. Arquitetura alvo do backend (`aqua-adult-api`)

Serviço **separado** do app e do PDS. O app nunca decide acesso; só mostra
o que o servidor decidiu.

### 4.1 Componentes

| Componente | Proposta (a confirmar) | Motivo |
|---|---|---|
| API | Node.js + TypeScript (Fastify ou Hono) | Mesma linguagem do app; reaproveita os contratos de `src/lib/adult/entitlements/types.ts` |
| Banco | PostgreSQL | Transações para pedidos/ledger; constraints; RLS opcional |
| Mídia privada | Bucket S3-compatível **privado** (ex.: Cloudflare R2) | Nunca no PDS público; acesso só por URL assinada curta |
| Processamento | Worker + fila (ex.: BullMQ/Redis ou pg-boss) | Transcode HLS, thumbnails, hash-matching hooks, quarentena |
| Live | Ingest RTMP/WHIP → HLS privado (avaliar reuso do Streamplace) | Playback também atrás de autorização |
| Pagamentos | Provedor **DEV/fake** até escolha de um provedor que aceite a categoria (ex.: CCBill, Segpay, Epoch) | Stripe/PayPal não aceitam conteúdo adulto |
| Idade | Provedor externo de age assurance; guardar só resultado | Não armazenar documentos |
| Hospedagem | VPS (ex.: o mesmo da Hostinger planejado para o PDS) | Decisão do dono |

### 4.2 Autenticação app → API

O app já tem sessão AT. O servidor deve verificar a identidade sem criar um
segundo login:

1. App pede um token de serviço ao PDS
   (`com.atproto.server.getServiceAuth`, `aud = did:web:<api>`).
2. API valida a assinatura contra o DID do usuário e o `exp` curto.
3. A API usa **somente** o DID do token como `userId`. Nenhum id vindo do
   corpo/URL é tratado como identidade (anti-IDOR).

### 4.3 Modelo de dados (resumo)

- `adult_accounts` (did, age_verified_at, age_verification_ref, expires_at, state)
- `creators` (did, status: applied/verifying/approved/rejected/suspended, verified_at)
- `studios`, `studio_members` (role: owner/admin/editor/analyst/moderator)
- `content` (id, creator_id|studio_id, type, status: draft/scheduled/published/archived/quarantined/removed, access_policy, required_tier_id, price_offer_id)
- `media_assets` (id, owner, storage_key **privado**, status: uploading/processing/ready/failed/quarantined/removed, mime, size, sha256)
- `tiers`, `offers` (preço em **inteiro de menor unidade** + moeda)
- `orders` (id, buyer, offer, amount, currency, status, provider_ref, idempotency_key **único**)
- `payment_events` (provider_event_id **único**, assinatura verificada, payload mínimo)
- `subscriptions` (buyer, creator|studio, tier, status, current_period_end)
- `entitlements` (mesmo contrato do cliente; `revoked_at`, `expires_at`; nunca apagados)
- `ledger_entries` (append-only: gross, fee, refund, chargeback, reserve, payout)
- `payout_accounts`, `payout_requests`, `payouts` (sem transferência real até haver provedor)
- `watch_progress`, `watch_history` (privados; apagáveis pelo usuário)
- `library_saved`, `library_watch_later`, `collections`
- `live_streams` (estado, access_policy, stream_key **hash**), `live_chat_messages` (retenção curta)
- `reports`, `moderation_cases`, `moderation_actions`, `appeals`
- `audit_events` (append-only; sem UPDATE/DELETE para papéis comuns)
- `admin_roles` (support, moderator, senior_moderator, trust_safety, finance, admin, superadmin)

Regras: `ON DELETE RESTRICT` para orders, ledger, audit, entitlements;
soft delete para conteúdo; FK + índices em todas as colunas de busca por
usuário/recurso.

### 4.4 Fluxos principais

**Acesso a conteúdo**
```
App (contexto +18 ativo) → GET /content/:id/access (service auth)
  → API: conta adulta verificada? creator ativo? conteúdo publicado e não quarentenado?
  → Entitlements (servidor) → AccessDecision
  → se allowed: POST /media/:assetId/authorize → URL assinada (TTL curto, vinculada ao DID)
  → playback
```
Falha em qualquer etapa (banco fora, entitlements fora, erro) → **negado**.

**Compra / PPV / aluguel**
```
App → POST /orders {offerId} (Idempotency-Key)
  → API cria order pending → provedor (DEV) → checkout
  → webhook assinado → payment_events (dedupe por provider_event_id)
  → transação: order paid + entitlement + ledger entries
  → app consulta access de novo (nunca confia no redirect do checkout)
```
Aluguel = entitlement com `expires_at`; PPV live = entitlement do evento.
Refund/chargeback → revoga entitlement + lançamentos no ledger.

**Library** (Fase 11) — relações, não cópias:
```
Purchased/PPV/Rentals ← entitlements ativos/expirados do usuário
Subscriptions        ← subscriptions (creator vs studio)
Saved / Watch Later  ← tabelas próprias; ainda sujeitas à AccessPolicy atual
Continue Watching    ← watch_progress (Fase 9)
History              ← watch_history (limpar não apaga orders/ledger/audit)
```

**Live +18** (Fase 12)
```
Creator (verificado) → cria live (policy) → stream key gerada 1x, guardada como hash, rotacionável
→ ingest → HLS privado → viewers: access → URL assinada curta
→ viewer count = sessões autenticadas únicas com heartbeat (não requests de segmento)
→ fim: gravação → media_asset (sem reprocessar se possível)
```

**Moderação** (Fase 14)
```
report → moderation_case (OPEN) → REVIEWING → ação (restrict/quarantine/remove/…)
→ audit_event → invalidação: entitlements/decisões, URLs assinadas, busca, feeds, CDN
→ appeal → nova decisão vinculada (histórico preservado)
```
Quarentena: some de Feed/Views/Studios/Search e não gera novas autorizações
de playback; URLs antigas expiram pelo TTL curto.

### 4.5 Firewall Social ↔ Adult (servidor)

- Nenhum dado `adult_private` é escrito no repo AT público (likes, follows,
  compras, histórico).
- Eventos +18 não alimentam feeds/recomendações/autocomplete sociais.
- Notificações +18 com payload neutro (sem título explícito no lock screen).
- Respostas personalizadas com `Cache-Control: private, no-store`; nunca
  cacheadas por CDN.

## 5. Problemas de segurança encontrados

### 5.1 CORRIGIDO — portão aceitava idade autodeclarada de 13 anos

O portão tratava `AgeAssuranceAccess.Full` como "verificado". Em regiões sem
lei de verificação, a plataforma concede `Full` a partir da data de
nascimento **declarada** (`DEFAULT_MIN_AGE = 13`), e `Full` também é o
fallback quando não há dados. Uma conta declarando 13 anos entrava no +18.

Correção (`9158d1a0b`): só `status = Assured` **e** `access = Full` é
"verified"; `Full` sem verificação concluída → `required`. Teste de
regressão em `__tests__/lib/adult-gate.test.ts`.

Efeito colateral esperado: em regiões onde o fluxo de verificação da
plataforma não é oferecido, **ninguém** entra no +18 até existir um provedor
próprio de age assurance. Isso é o comportamento correto (fail-closed).

### 5.2 CORRIGIDO — rota do Dashboard capturada pelo perfil de creator

`/adult/creator/dashboard` casava com `/adult/creator/:name` (o roteador
usa o primeiro padrão que casa). Ordem corrigida + teste em
`__tests__/lib/adult-routes.test.ts`.

### 5.3 ABERTO — autorização só no cliente

Entitlements, relações e decisões rodam no navegador. **Não é fronteira de
segurança.** Resolve-se só com o backend (§4).

### 5.4 ABERTO — mídia "protegida" é pública

Posts/mídia do AT Protocol são públicos no PDS. Conteúdo pago precisa do
Media Engine com storage privado e URLs assinadas.

## 6. Auditoria de licenças

Busca no repositório por código de not-only-fans, Stratala, Milkie, Hovod,
Pavilion e PPV Stream Rust: **nenhum arquivo encontrado**. Streamplace é
usado apenas pelo Video+Stream público, via API do nó
(`src/state/queries/streamplace.ts`, `src/screens/Media/*`), não pelo +18.
Qualquer reuso futuro precisa registrar origem, licença, arquivos e
obrigações antes do merge.

## 7. Plano re-sequenciado (Fases 8 → 15)

Cada fase só avança com build verde, testes críticos verdes, sem bypass de
autorização conhecido, sem vazamento Adult ↔ Social e sem mídia protegida
exposta.

1. **8a — Backend base**: `aqua-adult-api` local, Postgres, service auth
   AT, `adult_accounts`, Entitlements no servidor (portar o motor e os
   testes), auditoria. App passa a consultar o servidor.
2. **8b — Economia (DEV)**: offers, orders, webhook fake assinado,
   idempotência, ledger append-only, refund/chargeback.
3. **9 — Media Engine + Views +18**: upload privado, processamento, HLS,
   URLs assinadas, progresso e histórico.
4. **10 — Studios**: filmes/séries/temporadas/episódios, RBAC de estúdio.
5. **11 — Library** sobre entitlements + progresso.
6. **12 — Live +18**.
7. **13 — Dashboards** (creator/studio) sobre o ledger.
8. **14 — Trust & Safety** completo + RBAC administrativo.
9. **15 — Hardening** (IDOR, cache, firewall, webhooks, corrida, rate
   limit, uploads, segredos, dependências, falhas, acessibilidade, E2E).

## 8. Decisões pendentes (do dono do produto)

1. Hospedagem do backend (ex.: VPS Hostinger).
2. Stack: Node.js + PostgreSQL (proposto).
3. Storage privado de mídia (ex.: Cloudflare R2).
4. Provedor de pagamento que aceite a categoria (até lá: só DEV/fake).
5. Provedor de age assurance.

## 9. Dependências de compliance (externas)

Antes de qualquer produção, validar com profissionais: legislação aplicável
e requisitos por território; age assurance; pagamentos compatíveis com a
categoria; políticas de app stores/distribuição; privacidade e retenção
(LGPD e equivalentes); direitos, consentimento e registros de performers;
procedimentos operacionais de Trust & Safety; infraestrutura de produção.

**TECHNICALLY IMPLEMENTED ≠ PRODUCTION READY.**
