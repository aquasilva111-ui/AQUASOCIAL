# AQUA +18 — Arquitetura final e readiness (Fases 0–15)

> **NÃO ESTÁ PRONTO PARA PRODUÇÃO.**
> O que existe está **TECHNICALLY IMPLEMENTED** em ambiente de desenvolvimento, com testes. **PRODUCTION READY** exige as validações externas listadas em "Compliance dependencies". Nada foi publicado, nenhum pagamento real foi conectado, o DNS não foi alterado e o storage privado não foi exposto.

Relatórios por fase:

- `phases-8-10-report.md`
- `phase-13-report.md`
- `phase-14-report.md`
- `entry-gate.md`
- visão geral: `architecture-and-readiness.md`

## Mapa

```
AQUA
│
├── Identity ─────────── conta AT (PDS). Uma identidade só; sem "AdultUser".
│                         O +18 recebe apenas {did, handle}.
├── Social ───────────── AppView/feeds AT públicos (nada +18 escreve aqui)
├── Views ────────────── vídeos sociais (públicos)
├── Video+Stream ─────── Streamplace (social, externo)
│
└── AQUA +18 ─────────── AdultShell → AdultGate (entrada por autodeclaração;
    │                     verificação real atrás da flag adult_age_verification)
    ├── Feed             posts AT com self-labels adultos (sem backend)
    ├── Creators         páginas de creator, follow/block privados
    ├── Views +18        /views/*  (vídeos de creators)
    ├── Live +18         /live/*   (ingest HLS privado, chat isolado)
    ├── Studios +18      /studios/*, /studio-titles/* (filmes, séries, episódios)
    ├── Library          /me/library (relações, nunca cópias de mídia)
    ├── Messages         (placeholder — não implementado)
    └── Creator/Studio Dashboard  /dashboard/*
│
├── Media Engine ─────── upload com token único, sniff, ffmpeg → HLS 720p/360p,
│                         storage privado, URLs assinadas curtas (/stream)
├── Entitlements ─────── motor único de decisão (fail closed), scopes,
│                         restrições de T&S, bloqueios, banimentos
├── Creator Economy ──── tiers, offers, orders, PaymentProvider (MOCK),
│                         ledger só de inserção, payouts (só arquitetura)
└── Trust & Safety ───── denúncias, casos, ações, decisões, recursos,
                          takedown, remoção emergencial, RBAC da equipe, auditoria
```

Backend: `aqua-adult-api/` (Node + TypeScript + Fastify; PGlite em dev/test, Postgres em produção; migrações 001–009, todas aditivas).

App: `src/screens/Adult/*`, `src/components/adult/*`, `src/lib/adult/*`, `src/state/adult/*`.

## Fluxos entre módulos

1. **Entrada:**
   1. Sessão AQUA → `AdultGate`.
   2. "Tenho 18 anos ou mais" registra `self_declared`: em memória, no storage da conta e em `POST /me/adult/self-declaration`.
   3. O conteúdo aparece.
   4. A API decide com `adultAccessStatus()` → `verified` | `self_declared` | `null`, com banimento por cima.
2. **Acesso a conteúdo:** rota → `checkAccess()` → resolver do recurso (vídeo, post, filme, episódio, live, coleção) → restrições de T&S → bloqueio pelo dono → grants → decisão. Uma negação nunca vira permissão, e erros negam.
3. **Compra:**
   1. `POST /checkout` (com idempotência) cria a Order PENDING e chama `PaymentProvider.createCheckout`.
   2. O webhook assinado passa por `applyPaymentEvent` (dedupe por evento) → Order PAID → Entitlement → Ledger (SALE, taxas).
   3. Reembolso e chargeback revogam o grant e lançam no ledger.
4. **Playback:**
   1. A decisão permite → `media.authorize()` gera o token HMAC (asset, variante, entitlement, exp).
   2. `/stream/:token/*` confere de novo o asset (READY) e, na playlist, o entitlement.
5. **Library:** junção de entitlements, subscriptions, saved/watch-later, progresso e histórico. Nunca copia mídia.
6. **Live:**
   1. A chave do stream (só o hash é guardado) permite PUT HLS no storage privado.
   2. O playback tem token por espectador (`sub`, para bans).
   3. O chat é isolado, com bloqueios e denúncias que viram casos.
7. **Dashboard:** ledger → saldos; analytics agregados; ofertas e tiers mudam sem reescrever o histórico; RBAC do studio.
8. **Trust & Safety:**
   1. Denúncia, takedown, disputa, revogação de consentimento ou match externo → caso.
   2. Ação: status + mídia + auditoria.
   3. Decisão.
   4. Recurso, que abre um caso novo, com possível reversão.
   5. Remoção emergencial → caso P1.
9. **Firewall Social ↔ Adult:**
   - Queries no namespace `adult`, limpas ao sair, no logout e na troca de conta.
   - Nenhuma escrita no grafo AT público.
   - Dados +18 só no banco do `aqua-adult-api`.
   - Teste estático em `__tests__/lib/adult-firewall.test.ts`.

## Readiness

### IMPLEMENTED (dev, com testes)

- **Identidade e acesso:** identidade única com service-auth JWT (aud = serviço). Entry gate por autodeclaração separada de verificação, com testes de refresh e logout.
- **Entitlements:** motor com scopes, restrições, bloqueios e banimento; fail closed.
- **Economia:**
  - tiers, ofertas PPV/compra/aluguel com teto de preço e elegibilidade;
  - checkout idempotente e webhooks assinados com dedupe;
  - reembolso parcial/total, disputa e chargeback;
  - ledger só de inserção e saldos pelo ledger.
- **Media Engine:** upload com token único, sniff de conteúdo, limites de tamanho, HLS, URLs assinadas curtas e hook de quarentena.
- **Superfícies de conteúdo:**
  - Views +18 (feed, detalhe, relacionados, playback, preview, progresso, histórico com contagem anti-inflação);
  - Studios +18 (filmes, séries, temporadas, episódios, coleções, créditos, janelas e regiões, RBAC);
  - Library;
  - Live +18 (ingest, playback, chat, moderadores, bans, slow mode, denúncias).
- **Creator/Studio Dashboard:** conteúdo, mídia, assinaturas, PPV, analytics agregado, receita, payouts (arquitetura), live, safety e equipe.
- **Trust & Safety completo em código:** denúncias, casos, ações, decisões, recursos, takedown, emergência, auditoria, RBAC da equipe, verificação de creator, consentimento/direitos e bloqueios no servidor.
- **Hardening:**
  - rate limiting;
  - logs estruturados com tokens mascarados;
  - `/health` com teste do banco e `/admin/health` operacional;
  - índices (migração 009);
  - FKs sem cascade;
  - triggers de só inserção (ledger, auditoria, payment/verification events, ações/decisões de moderação).

### PARTIAL

- **Messages +18:** só placeholder.
- **Console de moderação no app:** a equipe usa só a API `/admin/*`.
- **Upload/criação de títulos de studio no app:** a API existe, mas o dashboard só lista, publica e arquiva.
- **Posts AT com política:** só registro e listagem. A criação continua no fluxo de posts.
- **Rate limiting:** em memória, para uma instância. Precisa de store compartilhado com várias instâncias.
- **Acessibilidade e responsivo:** revisão estática (rótulos, controles nativos do player, ordem lógica). **Sem verificação visual:** o build web está bloqueado (ver BLOCKED).
- **`GET /me/moderation`:** varredura N+1 de até 200 casos.

### MOCKED

- **Pagamentos:** `MockPaymentProvider`, que não sobe em produção.
- **Verificação de idade/identidade:** `MockVerificationProvider` e `/dev/age-verification`, só em dev.
- **Aprovação de creator e verificação de studio em dev:** `/dev/creator-approval`, `/dev/studios/:id/verify`.
- **Onboarding de conta de recebimento:** `/dev/payout-account/verify`.

### NOT IMPLEMENTED

- Provedor real de pagamento, de payout, de age assurance ou de hash-matching.
- Transferências de payout.
- Captions/legendas no player.
- Notificações +18 (push/e-mail): não existem, por isso não há payload a vazar.
- Storage de produção (R2) e CDN com URLs assinadas por espectador.

### BLOCKED

- **Build web do site.**
  - O commit do AQUA DOCS (`848805b4e`, outra ferramenta) usa `@blocknote/mantine`, que exige `@mantine/core`, e esse pacote não está no `package.json`.
  - `npm run build` falha (`Can't resolve '@mantine/core/styles/ScrollArea.css'`).
  - Isso bloqueia o deploy do site e a verificação visual.
  - A correção mexe em `package.json`/lockfile, o que só pode ser feito com autorização.
- **Deploy do `aqua-adult-api`:** não autorizado.

### SECURITY ISSUE (riscos residuais conhecidos)

1. **URL de playback copiada** funciona para outra pessoa até expirar (TTL ≤ 300 s; a playlist confere o entitlement de quem comprou).
   - Mitigação para produção: TTL menor, ou cookie/assinatura de CDN presos ao espectador.
2. **Dependências do app:** `npm audit --omit=dev` aponta 88 vulnerabilidades (2 críticas: `shell-quote`, `tar`; 40 altas), quase todas em ferramentas de build transitivas.
   - Não atualizei automaticamente, por risco de quebrar o app e pela regra de não mexer no lockfile.
   - Recomendação: tratar numa tarefa própria.
   - A API +18 tem 0 vulnerabilidades.
3. **Entrada por autodeclaração está ativa no site publicado** (decisão de produto, commit `3ad17bb30`).
   - Não é verificação de idade.
   - No servidor, produção exige verificação real, a não ser que `AQUA_ADULT_AGE_VERIFICATION_ENABLED=0` seja definido.
4. **Atrás de CDN/proxy é preciso `AQUA_TRUST_PROXY=1`.** Sem isso, o rate limit agrupa todos os clientes pelo IP do proxy.
5. **Restaurar um asset** que foi moderado enquanto estava em PROCESSING devolve o estado PROCESSING. Ele precisa ser reenviado; não há vazamento, só inconveniência.
6. **Modo de acesso adulto** (`configureAdultAccess`) é global por processo: uma instância de API = uma configuração.

### COMPLIANCE DEPENDENCY (antes de qualquer produção)

- Legislação aplicável e requisitos territoriais para conteúdo adulto (BR e onde houver usuários).
- Age assurance real (provedor, método, retenção). A autodeclaração não basta onde a lei exige.
- Pagamentos compatíveis com a categoria (provedor que aceite conteúdo adulto), com política de chargeback.
- Políticas de app stores e distribuição. O +18 no app nativo provavelmente conflita com as regras das lojas.
- Privacidade: LGPD/GDPR, base legal, retenção (histórico, auditoria, denúncias) e direitos do titular.
- Direitos e consentimento: processo real de coleta e verificação de consentimento de performers e custódia dos documentos no provedor.
- Operação de Trust & Safety: equipe, SLAs, canais com autoridades para CSAM e conteúdo ilegal, e integração com hash lists da indústria.
- Infraestrutura real: Postgres gerenciado, storage privado (R2), CDN, segredos, backups, monitoramento e alertas.
- **Licença do ffmpeg:** `ffmpeg-static` é GPL-3.0. Em produção, use o ffmpeg do sistema (`FFMPEG_BIN`) e cumpra as obrigações da GPL se distribuir o binário.

## Fase 15 — resultados

| Item | Resultado |
|---|---|
| 15.2 Autenticação | Anônimo, token forjado, audiência errada, token expirado e lixo dão 401. O header de dev é ignorado sem dev auth, e as rotas de dev somem (404). A identidade nunca vem do corpo nem da query. Session fixation não se aplica (sem sessão no servidor). Logout, várias abas, voltar e deep link: a entrada é presa ao DID e limpa em qualquer mudança de sessão; o gate cobre deep links (testes do app). |
| 15.3/15.4 IDOR | B não alcança order, entitlement, library, asset ou playback de A. Um token adulterado quebra a assinatura. IDs de creator, studio, oferta e payout vindos do cliente não dão nada. |
| 15.5 Mídia | Token expirado, aluguel expirado, assinatura encerrada, entitlement revogado, mídia removida ou em quarentena, path traversal e storage indisponível: tudo negado. A URL copiada é risco residual (item 1). |
| 15.6 Cache | Respostas personalizadas vêm como `private, no-store`. Mídia vem `private`, max-age ≤ 300. O cache do app fica no namespace `adult` e é limpo. Sem SSR nem service worker no +18. |
| 15.7–15.9 Firewall | Teste estático: só a navegação e a teardown da sessão importam código +18, e o código +18 não escreve no grafo social. Atividade +18 fica no banco próprio e não passa por buscas nem recomendações sociais. |
| 15.10 Notificações | Não existem notificações +18. A descrição de cobrança é neutra ("AQUA purchase"). |
| 15.11/15.12 Finanças e corridas | Checkout repetido ou concorrente com a mesma chave gera uma order. O mesmo evento concorrente é aplicado uma vez. Falha do provedor não gera grant. Remoção durante o processamento não é desfeita pelo worker (bug corrigido nesta fase). |
| 15.13 Rate limiting | Checkout, playback/preview, chat, uploads, denúncias, busca, autodeclaração, candidatura de creator, payouts e `/admin/*`: flood → 429, uso normal passa. |
| 15.14/15.15 Entrada e upload | Zod em todas as rotas. JSON com `nosniff`. Marcação guardada como texto inerte. JSON inválido e campos grandes são recusados. Upload: token único, tamanho, sniff pelo conteúdo, processamento isolado (ffmpeg em processo separado), hooks de scan e quarentena. |
| 15.16 Segredos | Nenhum segredo em 2.401 arquivos versionados. `code-signing/certificate.pem` é só o certificado público. `.env.example` vem sem valores. `.data/` da API é ignorado. |
| 15.17 Dependências | API: 0 vulnerabilidades. App: ver SECURITY ISSUE 2. |
| 15.18 Licenças | Nenhum código de not-only-fans, Stratala, Milkie, Hovod, Pavilion ou PPV Stream Rust. Streamplace (MIT) é usado só pelo social, como serviço. Dependências da API: MIT/Apache-2.0, exceto `ffmpeg-static` (GPL-3.0, ver compliance). |
| 15.19 Banco | Nenhum `on delete cascade`: todas as FKs são `restrict`. Orders, ledger e auditoria não podem ser apagados em cascata. Tabelas de dinheiro e auditoria só aceitam inserção. Migração 009 com índices para as consultas reais. |
| 15.20 Observabilidade | Logs pino em JSON com tokens e chaves de stream mascarados, sem corpo nem headers de auth. `/health` testa o banco. `/admin/health` mostra a fila de mídia (incluindo presas há 30 min), eventos de pagamento/verificação e fila de moderação, só com contagens. |
| 15.21 Modos de falha | Banco ou Entitlements fora do ar → negação (`unknown`). Storage fora → 404. Sem provedor → 503. Falha do provedor → order PENDING sem grant. Erro de processamento → FAILED sem sobrescrever moderação. |
| 15.24 Desempenho | `scripts/bench.ts` com 500 vídeos, p50 / p95 no PGlite em processo: feed 3,4 / 6,7 ms, detalhe 2,3 / 4,1 ms, playback 2,5 / 4,6 ms, dashboard 4,0 / 6,8 ms, conteúdo do dashboard 7,9 / 9,3 ms. |
| 15.25–15.27 E2E | Os três fluxos (viewer, creator, studio) passam ponta a ponta com checagem de isolamento. |

## Testes

- **API:** 9 arquivos, **150 testes**, todos passando (rodados em sequência completa).
- **App (jest, +18):** gate, entrada, isolamento, rotas e firewall.
- **Typecheck:** app e API sem erros.
- **Lint:** sem erros nos arquivos alterados.
