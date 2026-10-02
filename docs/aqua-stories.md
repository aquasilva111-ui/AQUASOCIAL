# AQUA Stories e Destaques

Stories de 24h e destaques permanentes. Não são posts: são records no PDS do próprio
autor, lidos por `com.atproto.repo.listRecords` (sem indexador), como View Channel e Livros.

```
at://<did>/place.aqua.actor.story/<tid>       media (blob de imagem), aspectRatio, createdAt
at://<did>/place.aqua.actor.highlight/<tid>   title (≤24), items[{media, createdAt, aspectRatio}] (≤50)
```

O destaque guarda a referência ao mesmo blob do story, então a mídia sobrevive à expiração.

## Peças

| Peça | Arquivo |
| --- | --- |
| Modelo (stories, destaques) | `src/lib/stories/model.ts` |
| Player puro: timer com pausa, toque × segurar, navegação entre pessoas, "visto", resposta | `src/lib/stories/player.ts` |
| "Visto" persistente (MMKV, todas as plataformas, expira em 48h) | `src/lib/stories-seen.ts` |
| Queries: stories, destaques, bandeja, resposta | `src/state/queries/{stories,highlights,story-tray,story-reply}.ts` |
| Viewer (modal em tela cheia) | `src/components/stories/StoryViewer.tsx` |
| Anel segmentado por story | `src/components/stories/StoryRing.tsx` |
| Bandeja na home (aba Seguindo) | `src/components/stories/StoriesTray.tsx` |
| Faixa no perfil (stories + destaques) | `src/components/stories/ProfileStoriesStrip.tsx` |
| Testes | `__tests__/lib/{stories,story-player}.test.ts` |

## Comportamento do viewer

Padrões trazidos de `react-native-story-view` (Simform) e `deebov/stories`, ambos MIT:

- A barra só começa depois que a imagem carregou; falha de carga mostra "Tentar de novo".
- Segurar pausa e esconde a interface; soltar **continua do mesmo ponto** (antes reiniciava) e uma
  pressão longa nunca conta como toque.
- Toque à direita/esquerda avança/volta e segue para a próxima pessoa; no fim da última, fecha.
- Arrastar para baixo fecha; na web: setas, espaço (pausa) e Esc.
- Pausa com o app em segundo plano e enquanto se digita uma resposta.
- Pré-carrega a imagem do próximo story; abre no primeiro story não visto.
- Excluir pede confirmação (segundo toque).

## Reação e resposta

Como o story não é um post, reação e resposta vão por **mensagem direta** para o autor
(`chat.bsky.convo`). É privado e reaproveita bloqueios, moderação e notificações do chat.
Falha (ex.: a pessoa não aceita mensagens suas) aparece num aviso.

## Moderação e permissões

- A bandeja ignora contas silenciadas, bloqueadas (nos dois sentidos) e filtradas pela moderação.
- Perfis bloqueados não mostram stories; só o dono apaga/edita.
- Records AT são públicos: não existe story "privado" nem "amigos próximos".

## Limites conhecidos

- **Sem indexador**, a bandeja consulta no máximo 30 contas seguidas (uma `listRecords` por conta,
  com o PDS em cache por 1h). Para escalar, indexar `place.aqua.actor.story` no jetstream/feed-generator já vendorizados.
- **Sem "visto por"** para o autor e **sem notificação de story novo** (precisam de indexador/push).
- Só imagem. Vídeo exige upload pelo serviço de vídeo e tratamento de duração (os dois repos de referência suportam).
- O "visto" é por aparelho.
