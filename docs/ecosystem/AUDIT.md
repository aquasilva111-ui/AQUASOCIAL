# Auditoria anterior à implementação

Referência: `1.111.0-ota-5`, HEAD inicial `a884c57e2`. Nenhum arquivo tinha alteração local.

| Área | Estado inicial / evidência | Reutilização | Lacuna real |
| --- | --- | --- | --- |
| Identidade/social | EXISTENTE: session, AT agent, Profile, Post, feed, moderation | AT DID, tokens de serviço, React Query, componentes e preferências | Não criar contas novas |
| Navegação | PARCIAL/DEFEITO: Navigation.tsx termina em comentário de arquivo truncado, sem exports | Versão completa de `cf9490e42`, router, commonScreens, dock e drawer | Restaurar navegadores; manter lazy loading e redirects |
| UI & AI | PARCIAL: index.web.tsx incorpora web/ui-ai; nativo encaminha ao site | Shell do olho, identidade, projeto e runtime | Workspace, missões, adapters e limites verificáveis |
| Charts | PLACEHOLDER: LeftNav e Drawer; trending vem de getTrendingTopics | useTrendingTopics preserva palavras silenciadas; Topic | Definições, ranking e explicações; coleta de novos sinais ainda necessária |
| Portals | PLACEHOLDER na navegação; sem modelo | Docs/Yjs/WebRTCTransport para documentos, refs existentes | Conhecimento referenciado, fontes e papéis |
| Communities | PLACEHOLDER na navegação; sem modelo | Post/threads, Profile, moderação, notificações | Membros, canais, permissões e referências sociais |
| Creators | AUSENTE como índice transversal; AdultCreators é específico +18 | Perfis e publicações reais do AT; obras existentes | Agregação sem inferir profissão ou criar CreatorUser |
| Games & Apps | AUSENTE; aqua-project gere arquivos/versões, não hospeda jogos | Creative Hub e Launch Hub | Manifesto, publicação e runner isolado; pipeline de build não existe |
| Broadcast | AUSENTE como produto; lib/broadcast é API de mensagens entre abas | View, Streamplace e referências de mídia | Canal contínuo/grade; não confundir com live nem renomear polyfill |
| Wallet | PLACEHOLDER; Shops já possui PaymentProvider/Asaas/split/orders | Mesmo Postgres/esquema aqua, dinheiro em centavos | Ledger privado, leitura autenticada; conciliação e payout não estão prontos |
| Analytics | PARCIAL: contadores View, runtime analytics/doc, adult dashboard | Eventos de recursos e adapters chart/ChartPanel | Consentimento, agregação por dono, sem conteúdo privado |
| Verification | PARCIAL: badge/ações AT existentes; adult verification é outra finalidade | components/verification e record app.bsky.graph.verification | Solicitação privada, revisão auditada e ponte ao emissor autorizado |
| View/Visionboard | EXISTENTE: Media, ViewWatch, ViewChannel, ViewLibrary, boards, listas | Manter `/videos`, `/images` e redirects | Label View; não duplicar imagens/vídeos |
| Reads/Music/Drops | EXISTENTE: Books/ReadsFeed, Music, Drops e módulo nativo drops/ | Manter rotas, publicação e bibliotecas | Descoberta transversal sem copiar conteúdo |
| Creative/Launch | EXISTENTE: screens, aqua-hub/runtime/project/studio/docs | Links para criar/distribuir e referências a projetos | Software executável não é export atual do aqua-project |
| News | PARCIAL: NewsAtlas e item duplicado News & Conventions | `/noticias` | Consolidar label sem inventar Convenções/7 Esferas |
| Shops | EXISTENTE: Nuxt storefront + Hono API + Mercur | Estender API Hono, pg, provedores | Autenticação social nos endpoints novos |
| Adult | EXISTENTE, isolado: aqua-adult-api com autenticação/entitlements/migrations | Padrão de service auth, não seus dados ou permissões | Nenhum conteúdo +18 no índice geral |

Inspeção incluiu manifests/READMEs dos pacotes aqua-runtime, aqua-project, aqua-hub,
aqua-docs, aqua-studio, aqua-shops, aqua-shops-backend, aqua-adult-api e drops;
src/routes, lib/routes, shell/LeftNav/Drawer/HubButtons; telas UIAI, Drops, Media,
ViewWatch, ViewChannel, ViewLibrary, Books, Music, CreativeHub, LaunchHub, NewsAtlas,
Adult; feeds, TrendingTopics, verification, Post, Layout, state e lib; docs e CI.

## Decisões de implementação

- Uma extensão `/ecosystem` da API Shops; mesmo DATABASE_URL e esquema `aqua`.
- Só service-auth JWT assinado pelo PDS; identidade nunca vem do corpo. Sem mock auth em produção.
- Conteúdo social permanece no PDS. Canais/portais guardam referências, não cópias de posts.
- Dados privados (workspace, solicitação, consentimento, ledger) nunca vão ao PDS público.
- Sem credenciais: estado não configurado. Memória só em testes explícitos.
- Nenhum provedor de IA, pagamento, issuer de verificação ou coleta de métricas é simulado.
- Primeiro corrigir navegação, depois recursos conforme a ordem pedida. Não criar worktree.
- Os endpoints podem estar implementados sem seus serviços externos; isso será relatado como PARTIAL.
