# AQUA +18 — Fase 13: Creator & Studio Dashboard

Status: **TECHNICALLY IMPLEMENTED (dev)**. Não é "production ready".

## Rotas

- App: `/adult/creator/dashboard`. Uma tela só, com seletor **Creator / Studio**:
  - cada studio do qual o usuário é membro aparece como opção;
  - o conceito de `/adult/studio/dashboard` fica coberto sem uma rota separada.
- API (`aqua-adult-api/src/dashboard`):
  - `/dashboard/creator{path}` e `/dashboard/studios/:studioId{path}`, com os mesmos handlers;
  - `GET /dashboard/studios` lista os studios do usuário;
  - `POST /dashboard/creator/videos` cria vídeo com preço;
  - `PATCH /dashboard/offers/:id` desativa ou muda o preço de uma oferta.

| Path | Permissão (studio) | Conteúdo |
|---|---|---|
| `` (home) | qualquer membro | seções visíveis conforme a função |
| `/content?section=` | viewContent | posts, vídeos, títulos, coleções, rascunhos, agendados, arquivados |
| `/media` | viewContent | estados do Media Engine (enviando/processando/pronto/falhou/quarentena/removido) |
| `/subscriptions`, `PATCH /settings` | sell | níveis, assinantes por nível, liga/desliga assinaturas |
| `/offers` | sell | ofertas PPV/compra/aluguel com vendas |
| `/analytics?days=` | viewAnalytics | views, espectadores únicos, tempo assistido, assinaturas, conversão, PPV, reembolsos, chargebacks, receita do período |
| `/revenue` | viewRevenue | saldos do ledger + lançamentos (sem compradores) |
| `/payouts`, `/payout-account`, `/payout-requests` | viewRevenue / managePayouts | arquitetura de payouts |
| `/live` | viewContent | lives do vendedor |
| `/safety` | viewSafety | conteúdo em moderação, denúncias por motivo (sem denunciante) |
| `/team` (só studio) | viewTeam | membros e funções |

## Regras implementadas

- **Sem métricas falsas.** Tudo vem do banco. Sem dados, o resultado é zero ou lista vazia. A conversão fica `null` quando não há espectadores.
- **Nunca FREE por erro.**
  - No dashboard, política paga (`ppv/purchase/rental_required`) sem oferta é recusada com `offer_required`.
  - Vídeo e oferta são criados na mesma transação: se a oferta falha, o vídeo não é criado.
- **Oferta elegível.** O tipo da oferta precisa liberar a política do item (`offer_kind_mismatch`). Itens em moderação não recebem ofertas.
- **Valores validados no backend.**
  - Moeda da lista ISO aceita.
  - Inteiro em unidades menores, maior que 0 e até 100.000 unidades maiores.
- **`tier_required` exige tier do próprio vendedor.** Vale para creator (vídeos) e studio (filmes, séries, episódios), na criação e na edição.
- **Mudança de preço preserva o histórico.** Uma oferta ou tier com preço novo cria uma oferta nova e aposenta a antiga. Pedidos antigos continuam apontando para o que foi pago.
- **Desligar assinaturas não apaga nada.**
  - O checkout passa a recusar novas assinaturas (`subscriptions_disabled`).
  - Assinaturas existentes continuam.
  - Para religar é preciso ter um nível ativo.
  - O primeiro tier criado liga as assinaturas do creator.
- **Agendamento.**
  - Vídeo `scheduled` exige `publishAt` no futuro.
  - Ele aparece quando a hora passa: a regra é avaliada na leitura (`VIDEO_IS_LIVE` e `effectiveStatus`), sem precisar de worker.
  - Antes disso, só o dono acessa.
- **Arquivamento.** `archived` sai do feed e do playback. Estados de moderação não podem ser alterados pelo creator.
- **Receita pelo ledger.**
  - Bruto, taxas, reembolsos, chargebacks, reserva, líquido, pendente e disponível vêm de `ledgerSummary`.
  - `requestable` = disponível − payouts em aberto.
- **Payouts: só arquitetura.**
  - Tabelas `payout_accounts`, `payout_requests` e `payouts`.
  - Nenhum provedor configurado: solicitações ficam `REQUESTED` e nenhum dinheiro se move. Não há lançamento `PAYOUT` no ledger.
  - Nenhum dado bancário é aceito ou armazenado.
  - A verificação da conta é simulada só em dev.
  - Solicitações são serializadas por lock e limitadas ao saldo disponível.
- **RBAC com menor privilégio.**
  - OWNER: tudo.
  - ADMIN: tudo menos payouts e nomear admins.
  - EDITOR: conteúdo e mídia.
  - ANALYST: analytics e receita, só leitura.
  - MODERATOR: conteúdo (leitura) e safety.
  - Quem não é membro recebe 404.
  - Negações ficam registradas em `audit_events`.
- **Segurança do creator.** Toda ação é autorizada no servidor. Botões escondidos no app são só conveniência.
- **Analytics agregado.** Nenhuma linha por usuário sai da API. Os testes verificam que DIDs de compradores nunca aparecem nas respostas.

## Migração

`006_dashboard.sql` é aditiva. Ela:

- troca o check de status de `videos`;
- adiciona `scheduled_at` e `archived_at`;
- adiciona `studios.subscriptions_enabled`;
- cria as tabelas de payout.

Nenhum dado é apagado.

## Testes (checkpoint 13.14)

`test/phase13-dashboard.test.ts`, com 17 testes, cobre:

- viewer, não verificado e anônimo tentando abrir o dashboard;
- creator: estado vazio sem números inventados;
- criação de conteúdo: preço obrigatório, atomicidade, validação de moeda e valor, tier próprio, agendamento, arquivamento;
- mídia: estados e nenhuma chave de storage na resposta;
- alteração de preço com histórico preservado;
- interruptor de assinaturas;
- analytics e receita a partir do ledger, sem compradores;
- payouts;
- matriz RBAC do studio (OWNER, ADMIN, EDITOR, ANALYST, MODERATOR e não membro) em todas as rotas;
- tentativas diretas na API: rival mudando preço, editor vendendo, cancelar payout alheio.

Suíte completa: **108/108**, rodada duas vezes.

## Pendências e limites

- Ainda não existem, no app, telas para upload e para criar filmes, séries, episódios, créditos ou coleções do studio. As rotas de API da Fase 10 existem. O dashboard lista, publica e arquiva.
- Posts AT com política ficam só listados. A criação continua no fluxo de posts.
- Payout real depende da escolha de provedor (não autorizado).
- Verificação real de creator e studio fica para a Fase 14.
- Sem verificação visual no navegador: o app web não compila no momento por causa do AQUA DOCS (trabalho paralelo não commitado: falta `@mantine/core/styles/ScrollArea.css`).
