# Implementação incremental do ecossistema AQUA

## Resultado e limites

Foram implementados contratos, persistência, endpoints, permissões e interfaces para
as dez áreas solicitadas, reutilizando a identidade AT e o backend Shops. **Os dez
módulos continuam PARTIAL como produtos completos.** Não há declaração de produção
pronta: algumas integrações precisam de configuração externa e outras ainda exigem
código. A tabela abaixo distingue essas duas situações.

| Módulo | Entrega funcional desta mudança | Ainda falta |
| --- | --- | --- |
| UI & AI | Workspace privado, conversa, contexto em camadas, decisões do usuário, tarefas, referências, repos/serviços e activity. Gateways OpenAI/Kimi/Anthropic/Gemini/local no servidor, modelo explicitamente configurado, autorização para compartilhar camadas. Shell web do olho preservado. | Credenciais/modelos para chamadas reais; streaming; ferramentas Build/Research/Review/Compare; integração profunda com aqua-project; extensões de Sínteses/Convenções/Sinapses só têm contratos. |
| Autômatos | Inspeção determinística executável; estados, território, capacidades, read/write/execute/denied, limites, condição de sucesso, logs e bloqueios. A execução é reivindicada antes de começar e não sobrescreve outras edições do workspace ao terminar. | Ferramentas de implementação/deploy, execução em processos isolados, recuperação de RUNNING após queda do servidor e desintegração operacional. Não há execução de shell ou código arbitrário. |
| Creators | Busca de perfis reais, amostra de posts criativos, tipos visual/vídeo, obras recentes e links para Profile/Post. Usa moderateProfile/moderatePost e preferências existentes. Não cria CreatorUser. | Índice transversal de Books/Music/Store/etc.; filtros país/idioma/following/live; conexão ao coletor Charts. Até 8 perfis e 20 posts por perfil, limite informado na UI. |
| Communities | Criação, canais text/forum/media/announcements, entrar/sair em recurso público, convites/papéis, ban, pins/remover referências, membros, busca e audit. Composer/Post/threads/Saved/reports continuam nas superfícies sociais existentes. | Adapter real de moderação pública/referências **ainda não conectado no startup**; notificações/mentions; busca dentro de canais; voz/stage. Sem o adapter, recursos de outros donos e novas referências falham fechados. |
| Portals | Criação, membros/papéis, seções de referências, fontes HTTPS, dados de país com fonte/data informadas, acesso a Docs existente e audit. | Adapter de moderação; edição colaborativa do próprio portal (não apenas link para Docs); indexação de entidades/organizações; Convenções dependem das definições de produto. Nenhum dado de país é fabricado. |
| Charts/Pulse | Rota/subrotas, Trending real existente como fonte identificada, contratos de sinais, clustering determinístico extensível, deduplicação, diversidade, penalidades e ranking explicável. | Ingestão/armazenamento contínuo de sinais, resolução de entidades e integração do ranking local à UI. Charts sem fonte mostram indisponibilidade; não recebem métricas inventadas. |
| Request Verification | Solicitação privada, rascunho/enviar, fila separada para DIDs revisores, under_review/needs_information/rejected, notas e audit; nenhum documento privado fica público. | Vault/upload privado; edição de evidências após pedido de informação; issuer AT + outbox/conciliador para approve/revoke alimentar o badge existente. Aprovar/revogar respondem 503 e ficam desabilitados. |
| Analytics | Consentimento inicialmente desligado, ingestão validada/idempotente de eventos de recursos acessíveis, contexto restrito, agregação por proprietário em 30 dias e barras reutilizáveis. Não guarda DID do visitante nos eventos. | Instrumentação automática e ingestão dos módulos antigos; Content/Audience/Revenue e demais visões; proteção adicional contra inflação de eventos. Compra/subscribe do cliente são recusados. |
| Wallet/Monetization | Ledger privado no esquema aqua, valores inteiros, invariantes SQL, separação por DID/moeda/status, resumo/leitura; estado “Pagamento não configurado”. | Conciliação de Orders/webhooks com DIDs de vendedores, adapter econômico transversal, reembolsos contábeis e payout. O PaymentProvider/Asaas existente foi preservado; saldo não significa custódia. |
| Games & Apps | Manifesto, criação restrita a origens aprovadas, resolução por DID/slug, ticket de execução descartável de 60s, iframe web de origem separada, sandbox/CSP, permissões negadas, indicação honesta no nativo. | Origem HTTPS separada e bundles publicados; pipeline de build/deploy via Project/Launch; permissões/bridge, conteúdo HTML independente, gestão de versões; auditoria de isolamento em múltiplos navegadores antes de liberar conteúdo público. Runner exige bundles JS autocontidos; connect/frame/worker ficam negados. |
| Broadcast | Canal vídeo/rádio, grade validada (fuso explícito, sem sobreposição), now/next/archive, seguir/deixar de seguir e fontes reais. | Player contínuo, embed, ingest Streamplace e notificações/EPG operacional. Lib/broadcast (mensagens entre abas) não foi substituída. |

## 1–6. Auditoria, arquitetura e arquivos

O estado inicial e o mapa de reutilização estão em [AUDIT.md](AUDIT.md). O defeito
preexistente mais grave era `src/Navigation.tsx` truncado, sem exports. O arquivo
completo foi recuperado de `cf9490e42` e o lazy loading de Docs/Creative Hub foi
preservado. Também foram corrigidos os argumentos de Toast de Reads/Books e o
narrowing de itens da seção Books do perfil, que impediam o typecheck. A checagem
no navegador encontrou assets relativos que quebravam todas as rotas diretas com
dois segmentos; HtmlWebpackPlugin agora injeta paths absolutos, preservando chunks
CDN com publicPath automático. O servidor de validação também deixou de tratar
handles com pontos como arquivos inexistentes. A consola legada permanece em
/ui-ai/ e /ui-ai/index.html.

Arquivos novos:

- `src/lib/ecosystem/`: tipos, cliente autenticado, Charts, ledger, Broadcast e U.I./Autômatos.
- `src/lib/ecosystem/__tests__/routes.test.ts`: rotas novas e compatibilidade legada.
- `src/state/queries/ecosystem.ts`: consultas por DID e mutations com invalidação.
- `src/screens/Ecosystem/`: diretórios, detalhes, creators, charts, verificação/review, analytics/wallet, apps/iframe e explorer secundário.
- `aqua-shops-backend/api/src/ecosystem/`: auth, validação, store, routes, providers, sandbox e runner de migration.
- `aqua-shops-backend/api/migrations/001_ecosystem.sql` e quatro arquivos de testes `test/ecosystem*.test.ts`.
- `aqua-shops-backend/api/vitest.config.ts` e esta documentação.

Arquivos existentes alterados: Navigation, routes, lib/routes/types, UIAI web/nativo,
LeftNav, Drawer, Settings, BooksHome/ReadsFeed/Profile Books, web/.htaccess, webpack.config.js e server.js; app/server/orders
e manifest/lock da API; lock npm da raiz. O lock raiz recebeu somente a entrada
expo-glass-effect que já constava no manifesto. O Yarn lock não foi alterado.

Rotas adicionadas: `/creators`, `/communities`, `/communities/:id`, `/portals`,
`/portals/:id`, `/charts`, `/charts/:chart`, `/apps`, `/apps/:creator/:slug`,
`/broadcast`, `/broadcast/:id`, `/wallet`, `/analytics`, `/verification/request`,
`/verification/review`, `/ui-ai/workspaces`, `/ui-ai/workspaces/:id`, `/explore/ecosystem`.

Charts/Portals/Communities/Wallet deixaram de ser placeholders inativos. Creators,
Apps, Broadcast, Analytics e Music receberam entradas. View substitui a label
Streams; News & Conventions usa `/noticias` sem item duplicado. No mobile, o explorer
secundário reúne novas experiências. Shop/Fund não receberam implementações falsas.
O dock, HubButtons e redirects `/videos`, `/images`, `/books` foram preservados.

## 7–13. Backend, configuração e permissões

Nenhum dos dez produtos está totalmente concluído; os fluxos específicos entregues
estão descritos na tabela. Não foi criado novo serviço ou banco. A migration é
aditiva e versionada no mesmo `DATABASE_URL`/esquema `aqua` de Shops:
resources, audit, consent, events, ledger e registro de migration. Reexecução não
remove dados. Writes de recursos usam transação, row lock e revisão otimista; falha
de permissão/conflito não grava documento nem audit parcial.

API integrada em `/ecosystem`: capabilities; resources/list/detail/actions/audit;
search compartilhada; apps/resolve/run-ticket/run; verification/review;
workspaces/ask/run; me/privacy, me/analytics, me/wallet; events.

Autorização usa exclusivamente service-auth JWT assinado pelo PDS, com audiência,
expiração e assinatura verificadas. ownerDid não vem do corpo. As permissões incluem
owner/admin/editor/researcher/contributor/moderator/viewer, papéis de canal,
revisores explícitos e limites de Autômatos. Não existe mock auth no startup;
memória é usada exclusivamente em testes. CORS é explícito, cookies não autenticam
estas APIs, corpo é limitado e requests são limitados por DID.

Configuração externa necessária:

- API real: `DATABASE_URL`, `AQUA_SERVICE_DID`; cliente: `EXPO_PUBLIC_AQUA_ECOSYSTEM_API_URL` (HTTPS, base terminada em /ecosystem) e `EXPO_PUBLIC_AQUA_ECOSYSTEM_API_DID`.
- Revisão: `AQUA_REVIEWER_DIDS`; aprovar/revogar também precisa do código de issuer/outbox ainda pendente.
- IA opcional: pares `AQUA_<PROVIDER>_API_KEY` + `AQUA_<PROVIDER>_MODEL` para OPENAI/KIMI/ANTHROPIC/GEMINI. Modelos não são escolhidos silenciosamente. Local usa `AQUA_LOCAL_MODEL_URL`/`AQUA_LOCAL_MODEL`.
- Apps: `AQUA_RUNNER_ORIGIN` separado do app e `AQUA_APP_ALLOWED_ORIGINS`, bundles JS publicados e CORS para o carregamento do bundle.
- Shops continua usando Mercur/Asaas e suas variáveis existentes. Provider fake foi explicitamente recusado em NODE_ENV=production.

Segredos permanecem no servidor e devem ser fornecidos em configurações seguras,
nunca no chat ou EXPO_PUBLIC. Aprovar o rascunho não equivale a publicar o ambiente
ou o site. O destino web continua Hostinger; nenhuma integração Vercel foi criada.

## 14–22. Integrações transversais

AT: mesma session/agent/DID, getServiceAuth, Profile, Post, referências AT, busca
de actors, feed do autor e trending. Não foram criados profiles/contas separados.
Os objetos novos ainda não são publicados em lexicons públicos próprios no PDS;
a persistência desta etapa fica no backend existente.

Streamplace: integração existente de View preservada; ingest Broadcast novo ainda
não conectado. Project/Creative/Launch: referências e links preservados; pipeline
de apps ainda não criado. Shops: mesma API/DB e provider existentes; conciliação do
ledger não foi implementada. Search: uma consulta compartilhada dos novos objetos
e explorer ligados à navegação/Settings; a aba da Search principal ainda não agrega
esses resultados automaticamente. Saved/Notifications: os recursos sociais
referenciados usam as superfícies existentes; suporte dos novos tipos a Saved e
notificações de convites/programação/verificação ainda está pendente.

Moderation: Creators/Trending reutilizam as preferências e decisões atuais. Os
endpoints novos possuem hooks canView/canReference, mas o startup ainda não os liga
a um adapter real; discovery de outros donos e anexação de referências são
recusadas até essa integração. Isto é uma pendência de implementação, não algo
resolvido apenas com credenciais. Adult mantém banco/rotas/contextos próprios;
conteúdo +18 não é agregado ao índice novo, e referências AT explicitamente adult
são recusadas.

## 23–28. Validação e plataformas

Validação com Node 20.20.2: typecheck da raiz e API passaram; 105 testes da API
passaram, 5 testes de PostgreSQL nativo foram pulados por falta de TEST_DATABASE_URL;
28 testes de routing passaram no Jest (133 testes aprovados no total). Lint dos
arquivos TypeScript alterados passou sem erros/avisos. Build web passou depois da correção de paths absolutos dos assets. Chromium
renderizou Home, Search, Charts, Communities, Apps, verification/request/review,
detalhe de comunidade, Profile com handle pontuado e UI & AI sem erros de JavaScript
ou assets estáticos ausentes; menu do olho abriu corretamente. As rotas privadas
foram verificadas pelo gate real de login, sem injetar sessão fake. As operações
autenticadas foram verificadas nos testes de API, não em uma sessão real de produção.
Servidor retornou 200 para rotas profundas e consola legada, e 404 para assets ausentes.
Testes de providers usam respostas de contrato explícitas, não provedores fake em
produção. Testes SQL usam PostgreSQL em WASM (PGlite); os testes nativos de pg exigem
TEST_DATABASE_URL. JWT foi exercitado com assinatura criptográfica real.

Web: interfaces e build implementados; produção continua parcial pelos motivos da
tabela. iOS/Android: interfaces React Native adicionadas e routing exercitado pelo
runner Jest iOS; isso não equivale a executar um app no aparelho. Runtime de apps
é explicitamente web-only. Builds nativos não foram executados.

## 29–30. Problemas conhecidos e próximos passos

- Patch nativo preexistente de paste-input 0.8.1 conflita com o artefato Git instalado 2.0.1. Não removemos o patch ou ocultamos essa falha. Web pode gerar warnings de requireNativeComponent em dependências nativas; precisam de auditoria própria antes de declarar native pronto.
- Recursos possuem limites explícitos (diretórios até 200, busca até 100, membros até 1000). Paginação/indexação de produção ainda precisa ser implementada.
- Rascunhos/solicitações precisam de edição adicional de evidências, retenção de dados privados e vault antes de liberar documentos oficiais.
- Ledger não está conciliado, não habilita checkout/payout e não representa custódia. Sandbox requer revisão em múltiplos browsers e política de navegação/rede antes de hospedar código público irrestrito.
- Implementar primeiro o adapter de moderação e a publicação/indexação dos objetos; depois issuer/outbox, ingestão Charts/analytics, ledger confiável e pipelines/player. Não substituir esses itens por dados demonstrativos.
- Definições de Convenções, Sinapses e demais Esferas permanecem abertas; não foram inventadas. Não houve deploy, push ou alteração manual de banco de produção.

## Ambiente e entrega

Node 20.20.2 foi instalado em /workspace/.tools, respeitando a linha 20 de .nvmrc.
Dependências da raiz/API, catálogos Lingui e web-build estão preparados nesta
instância. Scripts de instalação/startup e destinos de rede AT foram salvos no
rascunho de configuração; salvar o rascunho não publica o ambiente nem a Hostinger.
O acesso real a searchActors no AppView público retornou 200. API iniciou com
health 200 e capabilities verdadeiras (serviços privados ausentes); sem
DATABASE_URL/AQUA_SERVICE_DID, operações privadas permanecem 503.

As alterações foram separadas em commits locais por domínio; nenhuma alteração
foi enviada ao remoto ou implantada. A árvore final está limpa após os commits.
Persistência em um novo task/snapshot ainda não foi verificada; revisão/publicação
do ambiente e configuração da infraestrutura privada permanecem ações externas.
