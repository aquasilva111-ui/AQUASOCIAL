# AQUA Render

Servidor que transforma um `VideoProject` (do `aqua-runtime`) em MP4 rodando o **ffmpeg como
processo separado** (nada do ffmpeg/GPL é embutido ou distribuído com o app).

```
cd aqua-render && npm install && npm test
AQUA_RENDER_TOKEN=<16+ caracteres> AQUA_RENDER_ORIGINS=https://create.exemplo npm start
```

Variáveis: `AQUA_RENDER_TOKEN` (obrigatória, mín. 16), `AQUA_RENDER_ORIGINS` (origens do
navegador permitidas, separadas por vírgula; vazio = sem CORS), `PORT` (8788), `FFMPEG`
(caminho do binário; padrão `ffmpeg` do PATH).

- `PUT /assets/<sha256>`: envia um arquivo; recusado se o hash não bater.
- `POST /render`: JSON do projeto, devolve `video/mp4`.
- Tudo exige `Authorization: Bearer <token>`. Projeto validado (clipes, tamanho do canvas 16–4096,
  fps, duração máxima 10 min), no máximo 2 renders ao mesmo tempo (429), timeout do ffmpeg,
  arquivos temporários sempre apagados, nomes de arquivo nunca vêm do usuário.

## Limites conhecidos

- **O comando do ffmpeg nunca rodou com ffmpeg real** (a máquina de desenvolvimento não tem).
  Os testes usam um executável de mentira que só registra os argumentos. Antes de usar: rodar um
  render real e ajustar o filtro, se preciso.
- Assets ficam na memória do servidor (sem disco, sem limpeza); um token compartilhado, sem
  usuários nem cotas. Para produção: armazenamento em disco/objeto e autenticação por usuário.
- Instalar ffmpeg no servidor é decisão de licença (builds com libx264 são GPL).
