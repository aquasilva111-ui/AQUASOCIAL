# AQUA Project (AQUA-041, Repository)

Camada compartilhada por todas as ferramentas do Creative Hub: um projeto guarda itens
(doc, design, apresentação, planilha, vídeo, áudio, música, gráfico), os arquivos deles
como assets e o histórico de versões. Sem UI e sem dependências de runtime.

```
cd aqua-project && npm install && npm run typecheck && npm test
```

- `types.ts`: Project, ProjectItem, Version, AssetRef, ItemLink.
- `store.ts`: `AssetStore` (interface) e `MemoryAssetStore`. Assets são endereçados pelo
  sha-256 do conteúdo: o mesmo arquivo é um asset só. Adaptadores IndexedDB (web) e blob no
  PDS vêm depois.
- `repo.ts`: operações puras (não mutam): criar/renomear/remover item, `saveItem` (grava e cria
  versão; salvar o mesmo conteúdo não cria versão), `restoreVersion` (mantém o histórico),
  `linkItem`/`usedBy` (o que usa o quê) e `liveHashes` (base para limpar assets órfãos).
- `publish.ts`: o que cada ferramenta entrega ao Launch Hub (`capability` do
  `src/lib/launch-hub/types.ts`) e `launchableFor`.

## Versões e git

Dois níveis: `repo.ts` guarda versões por snapshot (linear, sempre disponível) e
`git.ts` (`ProjectGit`, isomorphic-git, MIT) é a camada opcional com git de verdade:
um repositório por projeto, um arquivo por item (`items/<id>`), um commit por save,
histórico por item, ler um commit antigo, e **branches** para testar variações.
`fs` é injetado: `@isomorphic-git/lightning-fs` (IndexedDB) no navegador, memfs nos testes.
Ainda não ligado ao `CreativeRuntime` (hoje o runtime usa o snapshot) nem a um remoto.

## Ainda não feito

Persistência (IndexedDB/PDS), sincronização Yjs entre itens, ligação com a tela Projetos do
Creative Hub (hoje só lista docs) e geração real dos exports.
