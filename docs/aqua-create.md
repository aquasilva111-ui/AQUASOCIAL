# AQUA Create / Creative Hub (arquitetura por ferramentas)

O Creative Hub não é um app único transplantado: é um conjunto de ferramentas
nativas do AQUA que compartilham órgãos (runtime, colaboração, assets, timeline).
Este documento fixa os doadores por ferramenta, os riscos de plataforma e a fila.

Estado: **proposta aprovada em discussão**. O Design já tem fase 1 feita em
`aqua-studio/` (ver `docs/aqua-studio.md`). O app roda na web (VPS + domínio
próprio) e em nativo via Expo.

## Órgãos compartilhados

```
                    AQUA CREATE / CREATIVE HUB
                            │
                    AQUA PROJECT (Repository)
                            │
       ┌────────────────────┼─────────────────────┐
       │                    │                     │
      Docs                Design               Sheets
 BlockNote/Tiptap       Fabric.js             Univer
       │                    │                     │
       └────────────── Yjs Collaboration ─────────┘
                            │
                       AQUA Assets
                            │
         ┌──────────────────┼─────────────────┐
         │                  │                 │
       Video             Audio             Music
      FFmpeg          WaveSurfer          Tone.js
         │                  │                 │
         └──────────────────┴─────────────────┘
                            ↓
                        Launch Hub
```

Arestas extras além do diagrama original:

- **Canvas/Páginas**: Design ↔ Presentations ↔ Whiteboard (um motor, vários
  tipos de documento).
- **Timeline UI**: Video ↔ Audio ↔ Music (tracks, cortes, preview compartilhados).
- **Shared Runtime**: shell do editor, toolbar, painéis, asset picker, provider
  Yjs e undo/redo unificado para todas as ferramentas.

## Doadores por ferramenta

| Ferramenta | Doadores | Papel |
| --- | --- | --- |
| Docs | TypeCellOS/BlockNote | Editor por blocos, slash menu, drag/drop, estrutura tipo Notion |
| | ueberdosis/tiptap | Motor de rich text / ProseMirror (BlockNote já roda sobre ele) |
| | yjs/yjs | Colaboração em tempo real, CRDT, offline/reconnect |
| | toeverything/blocksuite | **Só referência** (edgeless, docs híbridos). Não virar dependência: dois mundos de blocos incompatíveis |
| Design Core | shekarsiri/design-editor (Layerhub) | Doador principal, já escolhido na fase 1 (`aqua-studio/`) |
| | onerkiz/fabric-canvas-editor | Referência de arquitetura React/TS: layers, shapes, filters, export |
| | jalilmarkel/design-editor | Multipágina/apresentação — base do modo Presentations |
| | fabricjs/fabric.js | Motor de canvas |
| Sheets | Univer | Candidato principal (planilha tipo Google Sheets) |
| | FortuneSheet | Doador secundário de UX; mais leve, menos ativo |
| Presentations | **Design Core** (modo de documento) | Canvas, páginas/slides, texto, imagens, shapes, layers, templates |
| | PptxGenJS | Geração/exportação PPTX |
| | reveal.js | Engine de apresentação/preview |
| Video Editor | omniclip (ver `docs/aqua-studio.md`) | Timeline, tracks, cortes, preview no navegador (WebCodecs) |
| | ffmpeg/ffmpeg.wasm | Processamento/renderização de mídia (fallback web/desktop) |
| Audio Editor | wavesurfer-js/wavesurfer.js | Waveform, seleção, regiões, playback |
| | Web Audio API / Tone.js | Processamento e efeitos |
| Music Studio | Tonejs/Tone.js | Engine musical: sequenciamento, synths, efeitos, timing |
| | DAW completo | **A escolher** — ver risco 5 abaixo |
| Repository | isomorphic-git/isomorphic-git | Git diretamente em JS |
| | AQUA Projects/Assets | Arquivos, versões, colaboração, relação entre assets |
| Data Visualization | apache/echarts | Gráficos e dashboards |
| | vega/vega + vega-lite | Visualizações declarativas |
| | observablehq/plot | Visualizações rápidas |
| Whiteboard / Diagramas | BlockSuite | Melhor encaixe com Docs e Projects |
| Colaboração transversal | yjs/yjs | Docs, Design, Sheets e demais ferramentas |

`aqua-create/` está no `.gitignore` (cópias de referência). Código do AQUA vive
em pacotes próprios rastreados, mantendo LICENSEs e avisos de terceiros
(mesma regra já aplicada em `aqua-studio/`).

### Doadores locais (cópias de referência, gitignored)

| Doador | Caminho | Versão | Uso |
| --- | --- | --- | --- |
| BlockNote | `blocknote/` | monorepo (npm 0.55.0 em uso) | Engine do Aqua Docs (`aqua-docs/`) |
| TypeCell | `aqua-create/typecell` | clone shallow | Referência de arquitetura (docs colaborativos) |
| Tiptap | `tiptap/` | core 3.30.3 | Referência; o Aqua Docs usa @tiptap/core 3.31.4 via BlockNote |
| Yjs | `yjs/` | 14.0.0-rc.28 | Referência; o Aqua Docs usa yjs **13.6.33** (estável) — y-webrtc/y-indexeddb exigem ^13; migrar para v14 só quando o ecossistema y-protocols suportar |
| BlockSuite | `blocksuite/` | monorepo affine (blocks, data-view, gfx…) | **Só referência** para Docs; doador do Whiteboard (futuro) |
| Design editors | `aqua-create/{shekarsiri,jalilmarkel,onerkiz,scenify}-*` | cópias | Design Core (`aqua-studio/`) |

Regra: nada de código é copiado dos doadores sem checar licença e sem viver em
pacote rastreado; conteúdo (templates, imagens, fontes de CDN) nunca entra.

## Decisão firme: Presentations não é um quarto editor

O Design Core já tem páginas, canvas, texto, imagens, shapes, layers e
templates. Presentations é o mesmo motor com um tipo de documento diferente:

```
Design document       → poster / thumbnail / social graphic
Presentation document → slide 1 / slide 2 / slide 3
```

Isso elimina um editor gráfico inteiro da fila. O que sobra em AQUA-037 é o
modo de documento + PptxGenJS + preview (reveal.js).

## Riscos de plataforma e engenharia

1. **DOM-first vs. nativo**: Univer, BlockSuite, Fabric.js e WaveSurfer são
   web/DOM. O app já roda na web no VPS/domínio próprio, então a web é o alvo
   primário; no nativo, cada ferramenta decide explicitamente: WebView
   embutida (padrão, como o Studio já faz) ou binding nativo (exceção cara).
   Registrar a decisão por ferramenta na fila antes de codar.
2. **FFmpeg.wasm em dispositivo móvel**: renderização wasm no celular é lenta
   e esquenta. Preferir render server-side (infra de vídeo já existe no
   workspace: streamplace/cobalt) com preview local leve; wasm só como
   fallback web/desktop.
3. **Yjs + Fabric.js não é de graça**: Yjs+ProseMirror (Docs) e Yjs no Univer
   (Sheets) têm bindings maduros. No canvas do Fabric é preciso sincronizar o
   grafo de objetos manualmente (serialização, undo/redo por usuário, seleção
   remota/awareness). Spike dedicado dentro do AQUA-024; Docs e Sheets
   herdam bindings prontos, Design não.
4. **Univer é pesado**: bundle grande, arquitetura de plugins própria. Spike
   de "hello spreadsheet" medindo bundle e tempo de boot antes de comprometer;
   FortuneSheet é o plano B.
5. **DAW completo**: a maioria dos DAWs open source é desktop/C++ ou GPL
   pesado. Caminho realista: piano roll, mixer e multitrack próprios sobre
   Tone.js, **reusando o componente de Timeline do Video Editor** e o canvas
   do Design Core. Não buscar um transplante de DAW inteiro.
6. **Conteúdo de terceiros** (vale para todos): templates, imagens de CDN,
   fontes proprietárias e tokens fixos no código dos doadores não entram —
   mesma regra já aplicada na fase 1 do Studio (`docs/aqua-studio.md`).

## Fila revisada

| Item | Ferramenta | Base | Bloqueios |
| --- | --- | --- | --- |
| AQUA-023 | Docs Core | BlockNote + Tiptap + Yjs | — |
| AQUA-024 | Design Core | Fabric.js + design-editor donors (inclui spike Yjs+Fabric) | — |
| AQUA-041 | Repository | AQUA Projects + isomorphic-git | AQUA-024 |
| AQUA-0XX | Shared Runtime | shell, painéis, asset picker, Yjs provider, undo/redo | AQUA-023, AQUA-024 |
| AQUA-036 | Sheets | Univer (WebView no nativo, DOM na web) | AQUA-041 |
| AQUA-037 | Presentations | Design Core + PptxGenJS + reveal.js | AQUA-024 |
| AQUA-038 | Video Editor | omniclip + FFmpeg (render server-side) | AQUA-041 |
| AQUA-039 | Audio Editor | WaveSurfer + Web Audio | AQUA-041 |
| AQUA-040 | Music Studio | Tone.js + Timeline compartilhada | AQUA-038 |
| AQUA-042 | Data Visualization | ECharts + Vega/Plot | AQUA-041 |

Mudanças em relação à fila original:

- **AQUA-041 (Repository) subiu** para logo depois do Design Core: todas as
  ferramentas salvam/abrem assets; construir editores antes do sistema de
  arquivos/versionamento gera retrabalho de integração em todas.
- **Shared Runtime entrou como item novo**: sem ele, cada ferramenta constrói
  o próprio chrome e o Hub vira 9 apps colados.
- **AQUA-037 declara bloqueio em AQUA-024** (é um modo de documento, não um
  editor novo); **AQUA-040 depende de AQUA-038** (Timeline compartilhada).
