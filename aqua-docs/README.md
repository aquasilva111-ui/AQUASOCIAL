# AQUA Docs

Editor de documentos em blocos (estilo Notion) do Creative Hub do AQUA, com a identidade visual do AQUA (azul `#002bef`, laranja `#f04c24`, cantos arredondados, Inter) e toda a interface em pt-BR.

## Créditos e licenças

- **Motor do editor:** [BlockNote](https://github.com/TypeCellOS/BlockNote) (`@blocknote/core`, `@blocknote/react`, `@blocknote/mantine`), licença **MPL-2.0** (ver `blocknote/LICENSE.txt` no repositório). Nenhum arquivo-fonte do BlockNote foi modificado — o pacote é usado via npm.
- **Referência de arquitetura:** [TypeCell](https://github.com/TypeCellOS/TypeCell) (clone em `aqua-create/typecell`), projeto original do qual o BlockNote nasceu — usado apenas como referência de padrão (Yjs + persistência local + editor em blocos), sem código copiado.
- Padrões de identidade e de ponte de publicação espelham o pacote irmão `aqua-studio/`.
- **Doadores locais de referência** (cópias gitignored na raiz): `tiptap/` (core 3.30.3 — o Docs consome @tiptap/core 3.31.4 via BlockNote), `yjs/` (14.0.0-rc.28 — o Docs fixa **yjs 13.6.33** porque y-webrtc/y-indexeddb exigem ^13) e `blocksuite/` (só referência de leitura para Docs; doador reservado do Whiteboard). Detalhes em `docs/aqua-create.md`.

## Scripts

```sh
npm install
npm run dev        # servidor de desenvolvimento (porta 5174)
npm run build      # tsc --noEmit && vite build
npm run preview    # serve o build de produção
npm run typecheck  # só checagem de tipos
```

## Persistência e colaboração

- O índice de documentos (id, título, updatedAt) fica em `localStorage` (`aqua-docs:index`); o conteúdo de cada documento fica no IndexedDB via **y-indexeddb** (banco `aqua-docs:<id>`), como fragmento Yjs (`Y.Doc`) ligado ao editor por `collaboration.fragment` do BlockNote.
- Imagens embutidas via upload são guardadas como data URL dentro do documento.

## Parâmetros de URL (embed)

O app AQUA incorpora o Docs em iframe/WebView. Parâmetros:

- `?host=<origin>` — origem do app hospedeiro. O botão **Publicar no Aqua** envia `postMessage` somente para essa origem (nunca `"*"`). Sem `host` (uso standalone), o botão baixa o `.md`.
- `?room=<nome>` — ativa colaboração em tempo real via **y-webrtc** (servidores de sinalização padrão). A sala tem escopo por documento (`aqua-docs:<room>:<docId>`) e a barra superior mostra o selo "Colaboração ativa". Sem o parâmetro, o documento é somente local.

## Formato da mensagem de publicação

```ts
{
  type: "aqua-docs:publish",
  title: string,     // título do documento
  markdown: string,  // BlockNote blocksToMarkdownLossy()
  html: string,      // BlockNote blocksToHTMLLossy()
}
```

O menu **Exportar** (barra superior) baixa o documento como `.md` ou `.html` independentemente do embed.
