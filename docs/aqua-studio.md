# AQUA Studio (editores do Creative Hub)

Plano para trazer edição de design, foto e vídeo ao Creative Hub com a UX/UI do AQUA.
Estado: **fase 1 feita** (pacote `aqua-studio/`, editor de design com identidade AQUA,
exporta PNG). Ainda não está ligado ao hub do app (fase 2). Foto e vídeo: fases 3 e 4.

## Peças (todas MIT, conferido nas páginas dos repositórios)

| Recurso | Base | Observação |
| --- | --- | --- |
| Design, apresentação, vídeo por camadas | Layerhub design editor (`aqua-create/shekarsiri-design-editor`) | Motor `@layerhub-io/react` (MIT) e `@layerhub-io/core` (ISC). UI em baseui. |
| Editar foto | Filerobot Image Editor | React + Konva. |
| Editor de vídeo | omniclip | Roda no navegador (WebCodecs). 2.0 em desenvolvimento. |
| Referência de modelos/autosave | OpenDesign | Só referência de formato. |

Evitar: Remotion (licença especial), tldraw (licença comercial à parte), Polotno SDK (pago).

## Achados que mudam o plano

1. `aqua-create/` está no `.gitignore` (cópias de referência). O código do AQUA precisa
   viver num pacote próprio e rastreado (`aqua-studio/`), mantendo o `LICENSE` do
   Layerhub e um aviso de terceiros.
2. O editor chama um backend de terceiros com **token fixo no código**
   (`src/services/api.ts`) para templates, uploads, fontes e criações. Não pode ir.
   Substituir por armazenamento local (IndexedDB) e, depois, blobs no PDS do usuário.
3. Conteúdo, não código, que **não** deve ser copiado: `constants/templates` (6 mil
   linhas com imagens ik.imagekit.io e fontes do `font-public.canva.com`),
   `constants/mock-data` (imagens Pexels/Pixabay), fonte "Uber Move Text" (CDN de
   terceiro) e as telas Pixabay/Pexels (exigem chaves de API).
4. Substituir por: fontes Google (Inter e outras de licença aberta), modelos próprios
   do AQUA (`src/lib/creative-hub/model.ts`, convertidos para JSON de cena), uploads do
   próprio usuário.

## Arquitetura

- Pacote web `aqua-studio/` (Vite + React 18), tema baseui com a identidade AQUA
  (Inter, azul #002BEF, laranja do Creative Hub, claro e escuro), textos em pt-BR.
- Módulos: Design (Layerhub), Foto (Filerobot), Vídeo (omniclip).
- Embutido no Creative Hub na web; no celular abre em tela web embutida.
- Ponte com o app por `postMessage`: o Studio manda o PNG/MP4 exportado e o app faz o
  upload e abre o compositor ("Publicar no Aqua": post, story ou capa de livro).

## Fases

1. Pacote + Design: copiar só o código do Layerhub, trocar a camada de dados, tema
   AQUA, formatos do hub, exportar PNG.
2. Ponte "Publicar no Aqua" e abrir pelo hub (web).
3. Foto (Filerobot) nos Uploads e no painel de imagens.
4. Vídeo (omniclip).
5. Kit de marca, modelos próprios, salvar projetos no PDS.

## Fase 1: o que foi feito e o que falta

Feito: pacote `aqua-studio/` (Vite + React 18), tema AQUA, formatos e modelos próprios,
uploads locais, "Publicar no Aqua" (PNG por `postMessage` ou download), fontes abertas.
Verificado no navegador: abre no formato pedido (`?format=story` = 9:16), carrega a
Inter, mostra os modelos e exporta o PNG.

Falta nesta fase: traduzir os títulos internos dos painéis e da barra de ferramentas
(ainda em inglês), painéis de imagens e formas extras, salvar projetos além do JSON
manual, e o bundle principal tem 1,9 MB (dividir em partes).
