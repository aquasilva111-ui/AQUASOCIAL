# AQUA Design Core

Núcleo sem UI do AQUA Studio: modelo de documento + renderizador.

```
cd aqua-design-core
npm install
npm run typecheck && npm test
npm run dev      # playground em http://localhost:5190
```

## O que tem

- `src/scene-graph/`: cópia do `@open-pencil/scene-graph` 0.15.1 (MIT, `LICENSE-open-pencil`).
  Grafo de nós (frame, retângulo, elipse, texto, grupo, componentes), geometria, snap,
  hit-test, undo, cópia, redimensionamento, variáveis e cores. Sem DOM, sem framework.
  Código copiado sem alterações.
- `src/fabric/`: ponte própria do AQUA. `FabricRenderer` desenha uma página do grafo num
  canvas do [Fabric.js](https://github.com/fabricjs/fabric.js) (dependência npm, MIT) e,
  no modo interativo, grava mover/redimensionar/rotacionar de volta no grafo.
  Exporta PNG e SVG.

- `src/brand/`: identidade AQUA. `tokens.ts` (azul #002BEF, laranja #F04C24, gradientes do app,
  fontes abertas, formatos do hub), `kit.ts` (kit de marca padrão e `mergeBrandKit` para o kit
  do usuário), `document.ts` (`createAquaDocument(formato)`, `addTitle`, `solid`, `linearGradient`)
  e `fabric-theme.ts` (alças e bordas de seleção em azul AQUA, fundo da área de trabalho).
  Tokens espelham `src/alf/tokens.ts` e `aqua-studio/src/lib/brand.ts`: manter em sincronia.

- `src/serialize.ts`: documento <-> bytes JSON (guardar num Projeto).
- `src/presentation.ts`: modo Apresentação do mesmo motor: página com frames 1920x1080 como
  slides, notas do apresentador, `toPptx` (PptxGenJS: retângulo, elipse, texto; gradiente vira
  a primeira cor) e `toRevealHtml` (reveal.js, palco 1920x1080).

## Decisões sobre as fontes pedidas

| Repositório | Licença | Uso |
| --- | --- | --- |
| fabric.js | MIT | Dependência npm (`fabric`), renderizador e interação. |
| open-pencil | MIT | `scene-graph` copiado. O resto (CanvasKit, Yoga, Vue, Tauri, `.fig`) não é necessário. |
| konva | MIT | Não usado aqui: seria um segundo motor de canvas. Entra na fase 3 via Filerobot (foto). |
| fabric-canvas-editor | sem licença | Não copiado (sem licença = todos os direitos reservados). Fica só como referência em `aqua-create/`. |

## Ainda não ponteado

VECTOR, STAR, POLYGON, BOOLEAN_OPERATION, imagens e gradientes que não sejam lineares (o linear vai da esquerda para a direita, sem a matriz do Figma),
efeitos além de sombra, auto-layout. Ligar ao `aqua-studio/` (hoje em Layerhub) é a próxima etapa.

## Verificado no navegador (playground)

Prancheta com gradiente AQUA, título em Inter, elipse com sombra e retângulo com borda; alças
de seleção azuis; arrastar um objeto grava a nova posição no grafo. Frames do topo da página
viram prancheta (fundo fixo) com os filhos editáveis. Limitações: o conteúdo não é recortado
na borda da prancheta, e só os filhos diretos de um frame de topo gravam de volta (frames
aninhados ficam como grupo). Redimensionar e rotacionar ainda não foram testados.
