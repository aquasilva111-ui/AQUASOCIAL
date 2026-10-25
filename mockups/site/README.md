# Mockup do site AQUA (celular + desktop)

Um único mockup navegável do app inteiro. Cada tela é escrita **uma vez** e se adapta ao celular e ao desktop, então a correção de UX/UI acontece aqui, antes do código.

## Como abrir

```sh
python3 -m http.server 5199        # na raiz do repositório
# http://localhost:5199/mockups/site/index.html
```

No app, use o servidor `mockup-site` de `.claude/launch.json`. Abrir o `index.html` direto por `file://` também funciona num navegador comum.

O endereço guarda a tela e o modo: `#drops/both`, `#home/m`, `#profile/d` (`m` celular, `d` desktop, `both` lado a lado).

## Estrutura

| Arquivo | Papel |
| --- | --- |
| `index.html` | Viewer: barra, mapa de telas, alternância Celular / Desktop / Lado a lado, tema |
| `site.css` | Tokens e componentes. `.m` = celular, `.d` = desktop |
| `icons.js` | Ícones SVG |
| `screens.js` | Dados falsos e `SCREENS`: uma função `render(d)` por tela |
| `app.js` | Molduras, barras (inferior, lateral, drawer, sheet Criar, composer), navegação e o `MAP` do progresso |

## Adicionar uma tela

1. Em `screens.js`: `SCREENS.minhaTela = { title, top: 'main'|'tab'|'sub'|'none', nav, rail, tabs?, render(d) {…} }`.
2. Em `app.js`, no `MAP`, troque o item `'todo'` pelo id da tela. O contador de progresso se atualiza sozinho.
3. Use `data-go="id"` para navegar e `data-act="…"` para ações (`like`, `rt`, `follow`, `tab`, `open`, `close`, `back`).

Use `d` (desktop) só quando a **estrutura** muda (ex.: Mailssage vira dois painéis). O resto fica no CSS.

## Fonte da verdade

Navegação e rótulos seguem o app real: `src/view/shell/desktop/LeftNav.tsx`, `src/view/shell/bottom-bar/BottomBar.tsx` e `src/routes.ts`. Mockups já existentes (Docs, Design, Sheets, Music Studio, Launch Hub, +18) aparecem como "externos" e abrem em outra aba.
