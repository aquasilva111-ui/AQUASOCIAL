# aqua-feeds — feed "Em alta na Aqua"

Feed generator do AT Protocol. Lê o firehose (Jetstream), indexa os posts das
últimas 72 h e as curtidas, reposts e respostas que eles recebem, e serve um
ranking "em alta" para o app (e para qualquer cliente do protocolo).

```
Jetstream ─► indexador (posts + interações, 72 h) ─► Postgres/PGlite
                                                    │
AppView (api.bsky.app) ◄── getFeedSkeleton ◄── snapshot do ranking (a cada 2 min)
        │
        └─► app AQUA (hidrata os posts e mostra a aba)
```

## Ranking

```
pontuação = (curtidas + 2·reposts + 3·respostas) / (horas + 2)^1.5
```

- A idade conta a partir de quando o post **chegou ao indexador**, não do `createdAt`
  (o autor controla esse campo).
- Curtir, repostar ou responder **o próprio post não conta**.
- **No máximo `MAX_PER_AUTHOR` posts por autor** na lista (padrão 3).
- Só entram posts com engajamento ponderado ≥ `MIN_ENGAGEMENT` (padrão 1).
- Respostas não aparecem no feed; elas contam como interação do post respondido.
- Filtro de idioma `FEED_LANGS` (padrão `pt`) e, opcional, lista de autores da rede
  Aqua `FEED_AUTHOR_DIDS`.

### Paginação

A cada `REFRESH_SECONDS` o ranking é congelado num **snapshot** (até
`SNAPSHOT_SIZE` posts). O cursor é `<snapshot>::<posição>`: rolar a lista
não repete nem pula posts, mesmo que os números mudem no meio. Snapshots vivem
`SNAPSHOT_TTL_MINUTES`; um cursor de snapshot apagado devolve lista vazia e o app
recarrega do topo.

## Rodar localmente

```bash
cd aqua-feeds
npm install
npm test
FEEDGEN_PUBLISHER_DID=did:plc:teste npm run dev
```

Sobe em `http://127.0.0.1:3020`, com PGlite em `.data/pglite`, já assinando o
Jetstream público. Testar:

```bash
curl 'http://127.0.0.1:3020/xrpc/app.bsky.feed.getFeedSkeleton?feed=at://did:plc:teste/app.bsky.feed.generator/em-alta&limit=10'
curl http://127.0.0.1:3020/xrpc/app.bsky.feed.describeFeedGenerator
curl http://127.0.0.1:3020/.well-known/did.json
```

Nos primeiros minutos a lista fica vazia ou curta: o índice começa do zero e
precisa acumular interações.

## Rede

O app AQUA usa a rede da Bluesky (`bsky.social`, AppView `did:web:api.bsky.app`,
ver `src/env/common.ts` e `src/lib/constants.ts`), então o padrão é o **Jetstream
público da Bluesky**. Se a Aqua passar a ter relay/Jetstream próprio, troque
`JETSTREAM_URL`; para restringir o feed a contas da Aqua, preencha
`FEED_AUTHOR_DIDS`.

## Deploy

1. **Servidor com HTTPS** num domínio próprio, ex.: `feeds.aquaapp.systems`.
   O AppView chama `https://<FEEDGEN_HOSTNAME>/xrpc/app.bsky.feed.getFeedSkeleton`
   e lê `https://<FEEDGEN_HOSTNAME>/.well-known/did.json`. Tem que ser HTTPS na
   porta 443 (Caddy ou Nginx na frente, como em `aqua-shops-backend/Caddyfile`).
2. **Postgres** (`DATABASE_URL`). Em produção o processo não sobe sem
   `FEEDGEN_HOSTNAME`, `FEEDGEN_PUBLISHER_DID` e `DATABASE_URL`.
3. **Imagem**: `docker build -t aqua-feeds aqua-feeds/` e rodar com as variáveis
   de `.env.example`.
4. **Publicar o feed** (uma vez, ou para mudar nome/descrição), com uma **senha de
   app** da conta oficial da Aqua:
   ```bash
   FEEDGEN_HANDLE=aqua.bsky.social FEEDGEN_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx \
   FEEDGEN_HOSTNAME=feeds.aquaapp.systems npm run publish-feed
   ```
   O script imprime a URI `at://<did>/app.bsky.feed.generator/em-alta`. Coloque o
   DID em `FEEDGEN_PUBLISHER_DID` no serviço e reinicie.
5. **App**: defina `EXPO_PUBLIC_AQUA_HOT_FEED_URI=<a URI acima>` no build do app.
   Com isso, "Em alta na Aqua" entra como primeira aba fixada para quem cria conta
   e nos botões "adicionar feeds recomendados". Contas antigas não ganham a aba
   sozinhas: elas podem salvar o feed pela tela do feed (ou uma migração de
   preferências pode ser feita depois).

## Volume

Com `FEED_LANGS=pt`, só posts em português entram no banco, e curtidas em posts
não indexados são descartadas em memória (sem tocar no banco). Num teste de 70 s
contra o Jetstream público entraram ~23 posts e 7 interações; o grosso das
curtidas/reposts recebidos acontece nas horas seguintes. Sem filtro de idioma, o
volume é o da rede inteira: use Postgres e acompanhe o tamanho do banco.
