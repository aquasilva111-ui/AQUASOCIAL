# AQUA Stories e Destaques

Stories de 24h e destaques permanentes. Não são posts: são records no PDS do próprio
autor, lidos por `com.atproto.repo.listRecords` (sem indexador), como View Channel e Livros.

```
at://<did>/place.aqua.actor.story/<tid>       createdAt, media? (blob de imagem), fit (cover|contain),
                                              background? (#RRGGBB), overlays[] (≤12), aspectRatio
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

## Criar um story (`/stories/new`)

- **Foto** (galeria) ou **Texto** (fundo colorido). O "+" da bandeja e do perfil abrem essa tela.
- Texto arrastável (cor, "com fundo", editar), figurinhas emoji, A−/A+ para o tamanho, cor de fundo.
- A tela de criação e o viewer renderizam o **mesmo `StoryFrame` 9:16**, então o que você monta é o que os outros veem.
- Texto e figurinhas ficam **no record** (`overlays`, posição como fração do quadro), não achatados na foto.
  Story só de texto exige cor de fundo + ao menos um item. Dados do repo são sempre normalizados (limites, cores, posições).
- Stories antigos (sem `fit`/`overlays`) continuam funcionando, exibidos com `contain`.

## Halo no avatar do perfil

Quando a pessoa tem story ativo, a foto do perfil ganha um anel com **um arco por story** (colorido = não visto,
apagado = visto; acima de 12 stories vira um arco único). Tocar na foto abre os stories a partir do primeiro não visto.
Não aparece com live ativa, perfil bloqueado (nos dois sentidos) ou labeler.

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
