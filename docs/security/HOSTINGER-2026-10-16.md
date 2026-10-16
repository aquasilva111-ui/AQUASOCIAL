# Correções de dependências — 16/10/2026

Escopo: projeto principal usado no build da Hostinger (`./`) e API em
`aqua-shops-backend/api`. Os demais projetos independentes do monorepositório
não foram auditados nesta rodada. Nenhuma alteração foi publicada na Hostinger.

## Resultado da auditoria npm

| Projeto | Antes | Depois | Críticas antes → depois |
| --- | ---: | ---: | ---: |
| Site | 156 | 95 | 9 → 0 |
| API | 6 | 0 | 2 → 0 |

O site ainda apresenta 29 alertas altos, 61 moderados e 5 baixos. Esses números
agrupam pacotes vulneráveis, incluindo alertas herdados de dependências.
Os 411 avisos do painel contam também múltiplos CVEs e versões do mesmo pacote;
não se deve subtrair diretamente esses dois tipos de contagem.

Os arquivos `root-before.json`, `root-after.json`, `api-before.json` e
`api-after.json` nesta pasta preservam contagens, versões afetadas e links dos
avisos, sem informações de ambiente ou credenciais.

## Alterações

- Atualizações dentro das faixas declaradas, sem `npm audit fix --force`.
- Handlebars 4.7.10, proxy-addr 2.0.8, protobufjs 7.6.6, form-data 4.0.6 e
  elliptic 6.6.1 corrigem os avisos críticos anteriores correspondentes.
  Elliptic ainda possui um aviso baixo sem correção disponível.
- `fast-xml-parser` e `react-server-dom-webpack` saíram da árvore após a
  atualização dos pacotes pais; não foram apenas ocultados da auditoria.
- Expo atualizado dentro do SDK 54; React Native permanece na versão 0.81.5.
- Overrides npm mantêm PostCSS 8, SemVer 7, Minimatch 3 e YAML 2 em versões
  corrigidas, inclusive quando dependências antigas fixavam versões vulneráveis.
- Vitest da API atualizado para 4.1.12, compatível com Node 20. Ajustada a
  tipagem dos mocks de checkout para preservar a verificação do contrato.
- Patches locais reaplicados às versões novas: Expo Modules Core mantém a
  exceção de inspeção do fluxo Bitdrift; Expo Updates mantém a conversão de
  timestamps no iOS; Expo Notifications mantém seu patch de notificações.
  A correção de cancelamento de coroutine e o lançamento do update fora do
  `try/catch` já estão presentes no Expo atualizado. O patch antigo de
  paste-input foi removido porque a versão 2.0.1 já transforma o mapa em mutável,
  incluindo tratamento de retorno nulo. Builds Android/iOS não foram executados.
- Paste-input fixado na distribuição npm 2.0.1, com os arquivos de tipos e
  JavaScript publicados, em vez de depender da preparação do checkout GitHub.

## Pendências

Não é uma declaração de ausência de vulnerabilidades. Permanecem alertas em
Expo/Webpack, Tiptap 2, ferramentas de tradução/testes, Statsig e no ambiente
de testes AT Protocol, entre outros; os detalhes estão em `root-after.json`.
Alguns exigem migração de API/SDK ou substituição de biblioteca; outros não têm
versão corrigida publicada. Não forçar versões de outro SDK nem fazer downgrade
para a versão sugerida automaticamente pelo npm sem validar a compatibilidade.

O servidor publicado (`server.js`) serve arquivos estáticos com módulos nativos
do Node. Isso não prova que todos os avisos sejam exploráveis nesse processo,
nem elimina os riscos das ferramentas de build ou das bibliotecas no navegador.

## Reprodução e publicação

Validações executadas com Node 20.20.2:

- Instalação limpa com `npm ci --ignore-scripts --no-audit`, seguida de
  `npm run postinstall`; todos os patches ativos aplicados sem erro.
- `npm rebuild postinstall-postinstall` passou após atualização dos patches.
- Typecheck do site e da API aprovados.
- Testes de rotas do site: 28 aprovados.
- Testes da API: 105 aprovados, 5 pulados por ausência de PostgreSQL externo.
- Auditoria final: site com 95 avisos, zero críticos; API com zero avisos.
- `npm run build` aprovado: traduções, exportação Webpack e pós-build do site.
  Persistem avisos de dependências nativas sobre `requireNativeComponent` no web,
  já observados antes desta atualização.
- Smoke test em Chromium: `/` e `/search` retornaram HTTP 200, com conteúdo
  no documento e sem exceções JavaScript capturadas. Não cobre fluxos autenticados.

Usar npm, conforme `HOSTINGER.md`; overrides npm não são aplicados pelo Yarn 1.

```sh
npm ci
npm audit
npm run typecheck
npm run build
cd aqua-shops-backend/api
npm ci
npm audit
npm run typecheck
npm test
```

Publicar o código e os lockfiles atualizados, executar um novo build na
Hostinger e repetir a análise no painel. Os resultados desta pasta são um
retrato da base de avisos em 16/10/2026; novas publicações podem alterar a contagem.
