# AQUA +18 — Auditoria V2 (antes das Fases 16–25)

Data: 2026-10-02. Nenhuma fase 16–25 foi implementada. A Fase 16 só começa com autorização explícita.

## O que foi verificado
- **API do +18:** 150 testes passaram, typecheck sem erro.
- **App:** 7 arquivos de teste do +18 passaram (106 testes).
- **Não verificado:** `npm audit`, lint, build web (docs dizem bloqueado), execução real do app.
- Quase todos os testes são da API. Praticamente nenhuma tela do app tem teste (Dashboard, Live, Studios).

## Estado real das Fases 0–15
| Módulo | Estado |
|---|---|
| Identity (login validado no servidor) | Completo |
| Entrada +18 | Limitado: autodeclaração, não verificação de idade |
| Entitlements | Completo em dev; o cliente tem um motor duplicado |
| Economy | Mock no pagamento; payout só no desenho |
| Media Engine | Storage em disco local; processamento sem fila durável |
| Views, Library, Live, Studios, Dashboard | Limitados: API completa, app parcial |
| Trust & Safety | Lógica real; sem provedor de hash e sem console no app |
| Feed | Parcial: sem backend, é o feed social filtrado por label |
| Creators | Parcial: follow e mute só existem na memória do app |
| Messages e Settings | Placeholder |
| Notifications, Recommendation, Charts | Não existem |
| Search | Só `/studios/search` (ILIKE) |

Nenhum módulo está pronto para produção. `AdultRecommendationProfile` não existe no repositório, apesar de o briefing tratá-lo como existente.

## Bloqueadores e dívida
- **B1 (BLOCKER):** o site publicado usa autodeclaração. Em produção, `AQUA_ADULT_AGE_VERIFICATION_ENABLED=0` desliga a exigência de verificação.
- **B2 (BLOCKER):** nenhum provedor real de hash-matching registrado. Uploads passam sem scan.
- **H1 (HIGH):** rate limit em memória, por instância.
- **H2 (HIGH):** a URL de playback copiada funciona para outra pessoa até expirar.
- **H3 (HIGH):** nenhum workflow de CI cobre a `aqua-adult-api`.
- **H4 (HIGH):** o Feed +18 lê os feeds `following` e Discover do social, contrariando "não copiar o grafo público".
- **H5 (HIGH):** follow e mute adultos somem ao recarregar; só o block é salvo no servidor.
- **H8 (HIGH):** sem retry para mídia presa em processamento.
- **Dev:** o servidor bloqueia `/dev/*` em produção, mas o app chama `/dev/mock-checkout` em `AdultVideo`, `AdultLive` e `AdultStudios`, e só um dos cinco usos vistos está dentro de `__DEV__`. Falta conferir.

## Os 5 ZIPs
Apenas listados e licenças lidas; nada extraído nem executado. Todos **REFERENCE ONLY** por enquanto. Análise de manutenção, segurança e dependências pendente.

| Repositório | Licença |
|---|---|
| ppv_stream_rust | Apache-2.0 |
| pavilion | Apache-2.0 |
| milkie | MIT |
| stratala | ISC (só em `package.json` e README, sem arquivo LICENSE) |
| not-only-fans | **GPL-2.0** — não pode ter código copiado |

## Proposta para as Fases 16–25
Fundação nova (F0) antes de tudo:
- persistir follow e mute no servidor;
- tirar o Feed do grafo social;
- criar log de sinais adultos próprio;
- rate limit compartilhado;
- CI da API;
- scanner real (B2).

| Fase | Estado | Motivo |
|---|---|---|
| 16 Search | NEEDS FOUNDATION WORK | só existe busca de studios; faltam índice, histórico isolado, rate limit compartilhado |
| 17 Charts | NEEDS FOUNDATION WORK | há sinais para Trending, New Releases e Live Now; Top/Rising Creators e Most Discussed dependem de follows duráveis e comentários |
| 17b Drops, Visionboard e Reads +18 | NEEDS FOUNDATION WORK | ver "Fase 17b" abaixo; depende de F0, B2 e H4 |
| 18 Recommendations | BLOCKED | faltam perfil, log de sinais, follows duráveis e controles da Fase 24 |
| 19 Messages | BLOCKED | sem base; B2, H1 e H2 impedem mídia paga |
| 20 Monetization V2 | READY (em partes) | estende offers, orders, ledger, entitlements; Paid Messages esperam a Fase 19 |
| 21 Social Layer | NEEDS FOUNDATION WORK | sem comentários no servidor; depende de H4 e H5 |
| 22 Pro Tools | READY (em partes) | estende o Dashboard; retenção e conversão precisam do log de sinais |
| 23 Notifications | NEEDS FOUNDATION WORK | começar só no app, sem push externo |
| 24 Privacy Center | NEEDS FOUNDATION WORK | antecipar, junto com 16, 18 e 23 |
| 25 Production | BLOCKED | depende de provedores externos e do jurídico |

Ordem sugerida: F0, 24 (modelo), 16, 17, 17b, 20, 22, 23 (só app), 18, 19, 21, 25.

## Fase 17b — Drops, Visionboard e Reads +18
Mockups: `mockups.html` (PT) e `mockups.en.html` (EN), telas Drops, Visionboard, Reads e Reads · Leitor. Estado: só mockup. Nada disso existe no app +18 nem na API +18 hoje.

Escopo por superfície:
| Superfície | Formato | Dependências |
|---|---|---|
| Drops +18 | feed vertical de clipes curtos, com prévia gratuita e botão de desbloquear o vídeo completo; stories; denunciar sempre visível | Media Engine e Views (clipe curto como prévia), Entitlements e Economy (desbloqueio), B2, H1, H2 |
| Visionboard +18 | mural em colunas com pastas e filtro por tom de cor; imagens abrem borradas; boards privados por padrão fora do social | pipeline de imagem no Media Engine (hoje o foco é vídeo), scanner de imagem (B2), follows e boards duráveis no servidor (H5) |
| Reads +18 | livros em partes com capa, tags, personagens e aviso de conteúdo | modelo de texto no servidor (não existe), moderação de texto, regra obrigatória: todos os personagens têm 18 anos ou mais, com campo de idade por personagem e denúncia |

Regras da fase:
- Nada é copiado do grafo social. Cada superfície tem armazenamento e feed próprios no +18 (H4).
- Nada entra sem passar por B2. Sem scanner, a 17b não vai para produção.
- Não verificado: como Drops, Visionboard e Reads do app social armazenam dados (os commits indicam feed e PDS). O reaproveitamento de código vem depois de ler esse código; não foi auditado.
- Ordem interna sugerida: Drops (reaproveita vídeo e desbloqueio), depois Visionboard, depois Reads (precisa de modelo novo).

## Fora do escopo por enquanto: vídeos +18 vindos do Bluesky
Pedido de puxar vídeos +18 do Bluesky para o feed. Não implementado: sem B2 não há checagem de abuso infantil ou imagem íntima sem consentimento; não há como confirmar idade e consentimento de quem aparece; há risco de direitos autorais; e contraria H4.
Alternativa a decidir depois da F0 e do B2: apenas embed ou link, só contas aprovadas, só posts com rótulo adulto do Bluesky, com denúncia e remoção quando o autor apagar.

## Decisões pendentes (do dono do produto)
1. O V2 em produção segue com autodeclaração, ou as Fases 16, 18 e 19 esperam verificação de idade real (B1)?
2. O Feed +18 continua lendo os feeds sociais ou passa a ser alimentado só pelo backend +18 (H4)?
3. Há provedor de hash-matching escolhido (B2)? Sem ele, as Fases 19 e 21 ficam congeladas.
4. Algum dos 5 repositórios deve ser estudado a fundo? Para qual capacidade?
5. A regra "todos os personagens têm 18 anos ou mais" no Reads +18 fica como está? E o Visionboard +18 abre sempre borrado?
6. Os vídeos do Bluesky seguem o caminho de embed com contas aprovadas, ou ficam fora do +18?

## Implementado em código (2026-10-02)
API (`aqua-adult-api`, migrations 010 e 011, 22 testes novos em `test/phase16-foundation.test.ts`):
- **H5 resolvido:** follow e mute duráveis no servidor (`/me/adult/follows`, `/me/adult/mutes`), por DID, privados ao dono.
- **H1 resolvido:** rate limit compartilhado no banco (`SharedRateLimiter`), usado nas rotas limitadas e nos limites de bloqueio e takedown.
- **Log de sinais +18 próprio** (`/me/adult/signals`) e **chaves de privacidade** (`/me/adult/privacy`): o usuário vê, apaga e desliga a coleta; desligar também apaga o que já foi coletado. Base da Fase 24.
- **Drops +18** (`GET /drops`): vídeos publicados que têm clipe de prévia; aba Seguindo usa follows do +18; mutados e bloqueados somem.
- **Visionboard +18** (`/me/adult/boards`, `/adult/boards/:id`): boards privados por padrão, só imagens do próprio dono e já processadas, imagens marcadas como sensíveis.
- **Reads +18** (`/creator/books`, `/reads/books`): personagem menor de 18 é recusado na API e por uma restrição do banco; publicar exige personagem e parte.

App: telas Drops, Visionboard, Reads e leitor ligadas ao servidor, atalhos na home do +18, follow espelhado no servidor e follows, mutes e blocks carregados do servidor ao entrar no +18 (`hydrateAdultRelationships`). Lint e typecheck sem erro. 110 testes do +18 no app passam.

CI: `.github/workflows/aqua-adult-api.yml` roda typecheck e testes da API (H3 resolvido). Não foi executado no GitHub.

**Continua pendente:**
- **B1:** verificação de idade real. **B2:** provedor de hash-matching. Sem eles, a 17b não vai para produção.
- **H4:** o Feed +18 (`AdultFeed`, `AdultHome`) ainda lê os feeds sociais; não mexi nele.
- **H2** (URL de playback copiável), **H8** (retry de mídia presa) e o uso de `/dev/mock-checkout` fora de `__DEV__`.
- Só criadores aprovados e equipe de studio podem subir mídia (`media/routes.ts`), então usuário comum não consegue colocar imagem no Visionboard. Decisão de produto e de risco (B2).
- Reads +18 ainda não tem tela de escrita no app (a API existe), nem moderação de texto nem denúncia dedicada.
- As novas telas do app não têm testes próprios, e não abri o app para ver o resultado.

## Mudanças de design e código desde o relatório
- Mockups refeitos em estilo iOS, azul e laranja, com a logo AQUA +18 (`aqua-18-logo.svg`).
- O vermelho `#d6336c` virou laranja `#c2570c` (texto) e `#ff8a1f` (ponto) nos arquivos do +18: `AdultShell`, `AdultDashboard`, `AdultLive` e `AdultReportButton`. O typecheck não acusou erro nesses arquivos. Não foi testado no app. O botão "Limpar histórico" ainda usa o vermelho do tema.
