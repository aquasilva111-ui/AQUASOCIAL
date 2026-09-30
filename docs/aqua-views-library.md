# AQUA Views — biblioteca ("Você")

Páginas do menu lateral do Aqua Views. Mesmo padrão do View Channel: nada aqui
é uma conta; identidade e permissões vêm do Perfil AQUA.

| Item do menu | Rota | Fonte dos dados |
| --- | --- | --- |
| Assinaturas pagas | `/videos/paid` | sem backend de cobrança; só explica o estado |
| Inscrições | `/videos?source=following` | feed "Seguindo" da home (já existia) |
| Canais | `/videos/channels` | `getFollows` + sugeridos; abre o View Channel |
| Histórico | `/videos/history` | **neste aparelho** (localStorage, por conta) |
| Playlist | `/videos/playlists`, `/videos/list/playlist/:did/:rkey` | record no PDS do dono |
| Assistir mais tarde | `/videos/watch-later` | **neste aparelho** (localStorage, por conta) |
| Meus vídeos | `/videos?source=created` | posts com mídia do próprio perfil (já existia) |
| Coleções | `/videos/collections`, `/videos/list/collection/:did/:rkey` | record no PDS do dono |
| Transmissões ao vivo | `/videos/live` | Streamplace `getLiveUsers` |

## Arquivos

| Peça | Arquivo |
| --- | --- |
| Modelo puro (histórico, mais tarde, listas) | `src/lib/view-library/model.ts` |
| Store local (histórico / mais tarde) | `src/state/view-library.ts` |
| Queries e mutations de playlists/coleções | `src/state/queries/view-lists.ts` |
| Telas | `src/screens/ViewLibrary/*` |
| "Salvar em…" e registro no histórico (página do vídeo) | `src/screens/ViewLibrary/SaveMenu.tsx` |
| Testes | `__tests__/lib/view-library.test.ts` |

## Records

```
at://<did>/place.aqua.view.playlist/<tid>     title (≤60), description, visibility
at://<did>/place.aqua.view.collection/<tid>   public|unlisted|private,
                                              items[{uri (app.bsky.feed.post), addedAt}] (≤500)
```

- Só o dono escreve. Leitura via `listRecords`/`getRecord`, sem indexador.
- Dados do repo são não confiáveis: `normalizeList` descarta itens que não sejam URIs de post.
- `private` é escondida no AQUA, mas records AT são públicos (mesma ressalva do View Channel e dos Livros).
- Playlist é ordenada e tem "Reproduzir tudo" (vai para a fila de reprodução); coleção é só prateleira.

## Limites conhecidos

- **Histórico e "mais tarde" não sincronizam** entre navegadores/aparelhos. Para sincronizar, mover para
  records no PDS (mesma forma das listas) — o modelo já é puro e serve nos dois casos.
- Itens de lista que foram apagados ou ficaram indisponíveis somem da exibição; continuam no record até serem removidos.
- Sem capa nos cards de playlist/coleção (precisaria resolver o primeiro post de cada lista).
- Assinaturas pagas dependem de um backend de cobrança recorrente que ainda não existe.
