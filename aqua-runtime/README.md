# AQUA Runtime (Shared Runtime)

Uma sessão que junta o que o Creative Hub já tem: Projeto/Assets (`aqua-project`), Design
(`aqua-design-core`), Docs (Yjs, o mesmo `document-store` do `aqua-docs`) e a saída para o
Launch Hub. Sem UI.

```
cd aqua-runtime && npm install && npm run typecheck && npm test
```

## Contrato

Cada ferramenta implementa `ToolAdapter` (`create`/`open`) e devolve um `ToolSession`:
`serialize()` (bytes que vão para o projeto), `onChange`, histórico próprio (opcional),
`collab` (opcional) e `export(capability)` (opcional). O runtime não conhece o interior
de nenhuma ferramenta.

`CreativeRuntime`:

- `create` / `openItem` / `save` / `flush`: abre e salva itens no projeto (autosave opcional).
  Cada save é uma versão; conteúdo igual não cria versão.
- `undo` / `redo` unificados: Docs usam `Y.UndoManager` (CRDT não volta por snapshot);
  Design usa snapshots. Edições remotas não entram no undo local.
- Colaboração por `CollabTransport` (`MemoryHub` para teste/aba única; um provedor WebRTC
  ou WebSocket entra depois). Só quem tem `collab` participa.
- `pickable` (seletor de assets), `link` (itens embutidos), `launchable` e
  `exportForLaunch` (o arquivo certo para o destino do Launch Hub).

## Estado das ferramentas

| Ferramenta | No runtime |
| --- | --- |
| Docs | adaptador pronto (Yjs). Export para artigo fica no editor (dono do esquema de blocos) |
| Design | adaptador pronto; PNG por `renderPng` injetado (no navegador, o `FabricRenderer`) |
| Apresentações | `designAdapter('presentation')`: slides, notas, `toPptx`, `toRevealHtml`. PNG por slide ainda não |
| Gráficos | ECharts (SVG sem DOM), `vegaLiteToSvg`, `plotToSvg`. PNG por `rasterize` injetado |
| Música | modelo + **render real para WAV** (`renderSong`, osciladores com envelope). Tone.js na UI para tocar ao vivo e instrumentos melhores |
| Áudio | modelo (fonte por hash, regiões, ganho, fades) + **render real** de WAV (`applyAudioEdit`). MP3/M4A precisam de `decode` injetado |
| Sheets | adaptador do documento (snapshot do Univer + valores). Univer roda na UI (`aqua-sheets/`); PNG da tabela por `renderImage` injetado |
| Vídeo | modelo (clipes, cortes, áudio extra) + `buildFfmpegArgs` (comando do ffmpeg). Render por `render` injetado, no servidor. **Comando não testado com ffmpeg real** (não havia ffmpeg na máquina) |

## Ainda não feito

- Servidor de render de vídeo (roda o ffmpeg com `buildFfmpegArgs`).
- UIs das ferramentas (piano roll, timeline, multitrack, planilha) e donors já escolhidos em `docs/aqua-create.md`.
- Colaboração no Design (Yjs + Fabric): spike do AQUA-024; hoje o Design não tem `collab`.
- Provedor de rede e persistência (IndexedDB/PDS) do `AssetStore`.
- Shell de UI (toolbar, painéis, seletor de assets) e ligação com a tela Projetos do app.
- Imagens do Design como assets por hash (hoje não vão no documento).
