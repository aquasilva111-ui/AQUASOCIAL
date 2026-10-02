# AQUA Hub (Create, web)

Interface web das ferramentas do Creative Hub sobre o `aqua-runtime`. Projeto e arquivos ficam
no navegador (assets em IndexedDB, projeto em localStorage), com autosave.

```
cd aqua-hub && npm install && npm run dev      # http://localhost:5192
```

| Ferramenta | Tela |
| --- | --- |
| Design | prancheta Fabric (texto, retângulo, elipse, cores do kit AQUA), desfazer/refazer, PNG |
| Apresentação | mesma prancheta por slide, notas, **Apresentar** (reveal.js), **Baixar PPTX** |
| Gráfico | dados em texto, barras/linha/pizza (ECharts), PNG |
| Música | piano roll próprio (grade, faixas, instrumentos), gerar áudio e baixar WAV |
| Áudio | onda, seleção por arrasto, trechos mantidos, ganho e fades, WAV (importa WAV/MP3/M4A) |
| Vídeo | timeline com cursor, pré-visualização e reprodução; arrastar bordas (cortar) e clipes (reordenar); dividir (S); fade, brilho/contraste/saturação; textos; trilha de música; render no servidor `aqua-render` |
| Planilha | Univer carregado só ao abrir a planilha; snapshot salvo no projeto |

## O que não é (ainda)

- **Docs não está aqui**: o editor é o `aqua-docs/` (BlockNote) e não foi embutido.
- A timeline de vídeo é própria (inspirada nas *features* do OpenCut, que é MIT mas está em reescrita e não foi importado). Pré-visualização aproximada (fade/cor) e **sem tocar a trilha de música**. Sem velocidade, transições entre clipes além de fade, múltiplas faixas de vídeo, legendas automáticas ou keyframes.
- Piano roll e onda são **componentes próprios e simples**, não os doadores
  (signal, waveform-playlist, omniclip). Servem para editar e exportar; não têm multitrack de
  áudio, mixer, arrastar notas/clipes na grade, nem pré-visualização do vídeo.
- Música toca por síntese própria (WAV), não Tone.js. Sem pré-escuta ao vivo enquanto edita.
- Colaboração: o runtime está ligado ao `MemoryHub` (uma aba). Falta um transporte de rede.
- O gráfico/ECharts e o Univer pesam; o Hub carrega cada editor sob demanda.
- Sem login nem sincronização com o PDS; sem ligação com a tela Projetos do app nem Launch Hub.

## Verificado no navegador (2026-10-02)

Criar e abrir as 7 ferramentas sem erros; persistência após recarregar; música (3 notas clicadas
-> WAV de 1,4 MB válido); áudio (WAV de 4 s cortado em 2 s, 32044 bytes exatos); gráfico PNG;
apresentação (PPTX zip válido); vídeo (navegador -> servidor -> MP4 com ffmpeg simulado; o render em si foi validado à parte com ffmpeg real, ver `aqua-render/README.md`).
Não testado: arrastar no canvas de Design/waveform com o mouse, editar célula da planilha
manualmente, vídeo de verdade.
