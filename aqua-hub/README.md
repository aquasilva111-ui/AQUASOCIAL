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
| Música | piano roll: clicar/arrastar cria e estica notas, arrastar move (tempo e altura), borda direita redimensiona, teclado toca a nota, régua posiciona o cursor, grade 1/4–1/32, intensidade; mixer por faixa (volume, M, S); pré-escuta com cursor; WAV |
| Mixagem | multitrack: faixas com volume/pan/M/S/master, clipes com onda, arrastar (inclusive entre faixas), cortar pelas bordas, dividir, ganho e fades; pré-escuta e WAV estéreo |
| Áudio | (um arquivo) onda, seleção por arrasto, trechos mantidos, ganho e fades, WAV (importa WAV/MP3/M4A) |
| Vídeo | timeline com cursor, pré-visualização e reprodução; arrastar bordas (cortar) e clipes (reordenar); dividir (S); fade, brilho/contraste/saturação; textos; trilha de música; render no servidor `aqua-render` |
| Planilha | Univer carregado só ao abrir a planilha; snapshot salvo no projeto |

## O que não é (ainda)

- **Docs não está aqui**: o editor é o `aqua-docs/` (BlockNote) e não foi embutido.
- A timeline de vídeo é própria (inspirada nas *features* do OpenCut, que é MIT mas está em reescrita e não foi importado). Tem velocidade (0,25–4×), segunda faixa de vídeo (sobreposição com posição/tamanho e movimento por keyframes), textos com movimento e aparecer em fade, legendas (SRT/VTT ou **Whisper tiny no navegador**, ~40 MB baixados na 1ª vez do Hugging Face) e trilha de música tocando na prévia.
- Limites do vídeo: keyframes só de posição (x/y) e opacidade do texto, não de zoom/escala/cor; só **uma** faixa de sobreposição por item (várias sobreposições se empilham em ordem), sem edição visual de curvas; Whisper tiny erra mais que modelos grandes e a legenda automática usa só clipes com áudio; o áudio do clipe acelerado muda de tom (atempo preserva, mas o resultado depende do ffmpeg). A cor na prévia é aproximada; fade e posição são exatos. Não ouvi o áudio da prévia (só confirmei que o `play()` é chamado).
- Piano roll: sem seleção múltipla, copiar/colar, faixa de intensidade, loop nem quantização; o som vem de osciladores simples (synth/pluck/percussão/quadrada), não de instrumentos amostrados.
- Mixagem: sem automação de volume, sem esticar tempo/mudar tom, sem alças de fade para arrastar (fades são números), sem efeitos (EQ, compressão); tudo em 44,1 kHz; as ondas e o mix são calculados no navegador (arquivos muito longos pesam). Exporta WAV, não MP3.
- A pré-escuta usa o mesmo cálculo da exportação (`renderMix`/`renderSong`) e toca por Web Audio; confirmei que o contexto roda e o cursor avança, mas não ouvi o áudio.
- Colaboração: o runtime está ligado ao `MemoryHub` (uma aba). Falta um transporte de rede.
- O gráfico/ECharts e o Univer pesam; o Hub carrega cada editor sob demanda.
- Sem login nem sincronização com o PDS; sem ligação com a tela Projetos do app nem Launch Hub.

## Verificado no navegador (2026-10-02)

Criar e abrir as 7 ferramentas sem erros; persistência após recarregar; música (3 notas clicadas
-> WAV de 1,4 MB válido); áudio (WAV de 4 s cortado em 2 s, 32044 bytes exatos); gráfico PNG;
apresentação (PPTX zip válido); vídeo (navegador -> servidor -> MP4 com ffmpeg simulado; o render em si foi validado à parte com ffmpeg real, ver `aqua-render/README.md`).
Não testado: arrastar no canvas de Design/waveform com o mouse, editar célula da planilha
manualmente, vídeo de verdade.
