# /ui-ai — Consola da Unidade de Inteligência

Página estática servida em `https://aquaapp.systems/ui-ai`. Ela não tem servidor
próprio: conversa com a **U.I. que roda no computador de quem abre a página**
(`http://localhost:8765`), depois de pareada com o código mostrado na Consola local.

- Fonte: repositório **I.U-A.I** → `ui/web/consola.html` e `ui/web/logo.svg`.
  Ao mudar a Consola lá, copie para cá (`index.html` e `web/logo.svg`).
- O build copia esta pasta para `web-build/ui-ai/` (`scripts/post-web-build.js`).
  O `.htaccess` já entrega pastas existentes direto, sem passar pelo app.
- Navegador recomendado: Chrome (permite página pública → localhost).
