# AQUA Sheets (spike do Univer)

Spike pedido pelo plano (`docs/aqua-create.md`, risco 4): medir bundle e boot do
[Univer](https://github.com/dream-num/univer) (Apache-2.0) com o preset `sheets-core`.

```
cd aqua-sheets && npm install && npm run build   # build leva alguns minutos
npx vite preview --port 5191
```

## Medido (2026-10-02, build de produção, localhost, sem throttling)

| Item | Valor |
| --- | --- |
| Bundle principal | 6,8 MB (1,8 MB gzip) |
| CSS | 120 KB |
| Transferido na 1ª carga | ~1,8 MB |
| `createUniver` + criar workbook | 76 ms |
| `DOMContentLoaded` | ~4 s (parse do bundle de 6,8 MB) |
| Resultado | planilha renderiza; `=A1+B1` calcula 3 |

Os ~80 arquivos `*.js` extras em `dist/assets` são dicionários de hifenização (um por idioma),
carregados só sob demanda.

## Leitura

- **Dá para usar na web**, mas é pesado para a 1ª carga: carregar o Univer só ao abrir uma
  planilha (import dinâmico), nunca no bundle do app.
- No celular, abrir em WebView embutida (como o Studio), não no bundle nativo.
- Só o preset `sheets-core` foi medido. Fórmulas avançadas, colaboração e importar/exportar
  xlsx são outros presets/pacotes e vão pesar mais. FortuneSheet continua como plano B.
- Não medido: boot em celular real, memória, colaboração (`univer-presets` tem exemplos).

O documento é guardado como snapshot do Univer pelo adaptador `sheet` do `aqua-runtime`.
