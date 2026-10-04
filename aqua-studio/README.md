# AQUA Studio

Editor de design do Creative Hub (fase 1 de `docs/aqua-studio.md`).

```
cd aqua-studio
npm install --legacy-peer-deps
npm run dev      # http://localhost:5188
npm run build
```

Abre com parâmetros: `?format=post|story|video|presentation|banner|book_cover`,
`&template=<id>` (ids em `src/constants/editor.ts`) e `&host=<origem do app>`.

"Publicar no Aqua" renderiza a página em PNG e envia `aqua-studio:publish` por
`postMessage` somente para a origem de `host` (nunca `*`). Sem `host`, baixa o PNG.

## Origem do código

Baseado no [react-design-editor](https://github.com/layerhub-io/react-design-editor)
(Layerhub, MIT, ver `LICENSE-layerhub-design-editor`), com motor
`@layerhub-io/react` (MIT). Mudanças do AQUA:

- Sem backend de terceiros: uploads ficam no aparelho (`src/services/local.ts`).
- Removidos: modelos, imagens e vetores de terceiros, telas Pexels/Pixabay, fonte
  "Uber Move Text", fontes hospedadas pelo Canva e o envio de vídeo para o serviço
  de render do Layerhub.
- Fontes abertas (OFL) via `@fontsource`; modelos e formas próprios do AQUA.
- Tema baseui com a identidade AQUA e textos em pt-BR (parcial).
