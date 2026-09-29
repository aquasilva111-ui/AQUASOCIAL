# AQUA +18 — Fase 14: Trust & Safety

Status: **TECHNICALLY IMPLEMENTED (dev)**.

A operação real de Trust & Safety ainda depende de fatores externos: equipe, procedimentos, provedores de verificação e de detecção, e jurídico.

Código:

- API: `aqua-adult-api/src/safety/` (`index.ts`, `moderation.ts`, `staff.ts`, `verification.ts`, `matching.ts`) e a migração `008_trust_safety.sql`.
- App: `src/components/adult/AdultReportButton.tsx`, com bloqueio sincronizado em `AdultCreator`.

## Implementado

| Item | Como |
|---|---|
| 14.2 Age access | Webhook assinado `POST /webhooks/verification/:provider`. Guarda só o resultado (`age_verified_at`, referência do provedor, validade). Nenhum documento. Mock apenas em dev. |
| 14.3 Creator verification | `creator_applications`: IDENTITY_PENDING → AGE_PENDING → AGREEMENT_PENDING → IN_REVIEW → APPROVED/REJECTED. Identidade e idade chegam só por webhook do provedor. O acordo tem versão. A revisão é da equipe (T&S ou senior), que confere tudo de novo no servidor. SUSPENDED fica em `creators.status`, via ação de moderação. |
| 14.4 Consent / rights | `consent_records` (performer_consent, content_rights, production_authorization) com referências opacas. URL pública é recusada. O dono vê só tipo e status; T&S vê as referências. Revogar o consentimento restringe o item na hora e abre um caso P1. Disputas de titularidade usam `POST /disputes` (takedown com base `ownership`, caso `dispute`). |
| 14.5/14.6 Reporting | `POST /reports` com alvos content, creator, user, message, live, studio e production. Os motivos são configuráveis em `report_reasons` (código, alvos, prioridade, detalhes obrigatórios); texto livre é só contexto. Há limite de 1 denúncia por item a cada 24h e 20 por hora. As denúncias de live entram no mesmo sistema. |
| 14.7/14.8 Moderation case | `moderation_cases` com source, resource, reason, status (OPEN, REVIEWING, ACTION_REQUIRED, RESOLVED, DISMISSED, ESCALATED), priority, assigned_to, datas e ações. Denúncias do mesmo item se juntam num caso só. |
| 14.9 Actions | restrict, quarantine, remove, suspend, ban, restore, age_restrict, region_restrict, revoke_creator e lift_restriction. Cada ação grava o estado anterior, vai para `moderation_actions` (só inserção, trigger no banco) e para `audit_events`. |
| 14.10 Blocking | `adult_blocks` no servidor. Aplicado em feed, relacionados, conteúdo do creator (quem foi bloqueado pelo dono não acessa), listagem de lives e chat. Mensagens diretas ainda não existem no +18. |
| 14.11 Takedown | Request → Review → Restrição temporária → Decisão → Ação (remove) → Appeal. Pedidos sem conta AQUA exigem contato e têm limite por IP. |
| 14.12 Appeals | `POST /appeals` só para quem responde pelo item, e só contra decisões de violação. Abre um caso novo ligado ao original, que não é sobrescrito. Quem tomou a decisão original não pode julgar o recurso. Se o recurso for aceito, as ações do caso original são revertidas como ações novas. |
| 14.13 Hash/matching | `registerMatchingProvider()` é um ponto de encaixe para provedores externos. Um "match" coloca o asset em quarentena e abre um caso P1; erro do provedor também põe em quarentena (fail closed). Sem provedor, nada é marcado. Não há detector caseiro. |
| 14.14 Quarantine | O item em quarentena sai de feed, Views, Studios, busca e lives e não recebe novas autorizações de playback. As mídias vão para QUARANTINED, então **URLs assinadas antigas param na hora**. |
| 14.15 Emergency removal | `POST /admin/emergency-removal`, só para TRUST_SAFETY, ADMIN ou SUPERADMIN, com motivo obrigatório. Remove o item, derruba a mídia, encerra o live e abre caso P1 com dois eventos de auditoria. |
| 14.16 Audit | `audit_events` guarda ator, ação, recurso, data, motivo/referência (id do caso) e resultado. A tabela só aceita inserção (trigger). Leitura em `GET /admin/audit`, só para T&S, ADMIN ou SUPERADMIN. Negações de permissão também são auditadas. |
| 14.17 Admin RBAC | SUPPORT, MODERATOR, SENIOR_MODERATOR, TRUST_SAFETY, FINANCE, ADMIN e SUPERADMIN, com capacidades separadas em `STAFF_PERMISSIONS`. O ADMIN não modera, o FINANCE só mexe com dinheiro e só o SUPERADMIN cria ADMINs. O primeiro SUPERADMIN vem de `AQUA_SUPERADMIN_DIDS`. |

A conta banida perde o acesso ao +18 (`account_banned`), e uma nova autodeclaração não desfaz o banimento. `age_restrict` exige verificação real: autodeclaração não basta.

## Testes (`test/phase14-safety.test.ts`, 17)

Cobrem denúncia, bloqueio, quarentena, remoção, restauração, suspensão de creator, banimento, recurso, ação de moderador sem permissão, trilha de auditoria (incluindo tentativas de UPDATE/DELETE, que falham), acesso à mídia depois do takedown (URL antiga dá 403), busca e feed depois do takedown, cabeçalhos `no-store`, fluxo de takedown, remoção emergencial, RBAC da equipe, finanças, verificação de creator, consentimento e hooks de matching.

Suíte total: **130/130**.

## Pendências e dependências externas

- Nenhum provedor real de verificação de idade/identidade ou de hash-matching foi escolhido nem conectado.
- Não há console de moderação no app: a equipe usa a API `/admin/*`.
- O limite de taxa fica em memória, para uma instância só. Com várias instâncias, precisa de um store compartilhado.
- `GET /me/moderation` varre até 200 casos (N+1). Para escala real, precisa de índice e consulta dedicada.
- Procedimentos operacionais, SLAs, treinamento e atendimento jurídico são dependências de compliance, fora do código.
