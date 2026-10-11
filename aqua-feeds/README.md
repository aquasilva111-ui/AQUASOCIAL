# aqua-feeds — feeds "Em alta na Aqua" e "Pra você"

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

## "Pra você": feed por Convenções de Realidade (explicável)

**Em palavras simples.** Cada coisa que você faz com um post — curtir (1),
repostar (2), responder (2), salvar (3), seguir quem postou (4), ficar lendo
(1 a cada 20 s, até 3), "mostrar mais" (2) ou "mostrar menos" (−3) — reforça as
**Convenções** daquele post: `tema:` (#hashtags), `idioma:`, `rotulo:`,
`criador:` e `formato:`. Cada Convenção sua tem uma **gravidade** que cresce com
intensidade, frequência, dias diferentes, variedade de sinais e ligações
(Sinapses), e **cai pela metade a cada 14 dias** sem uso. O **estado** mostra o
momento: emergente, ativa, enfraquecendo ou dormente.

Um post novo vale:

```
(0,1 + Σ Convenções suas que estão no post
      + Sinapses (25% de uma Convenção que costuma andar junto com uma do post)
      + afinidade com o criador e o formato
      + 0,6·ln(1 + curtidas + 2·reposts + 3·respostas))
× frescor (meia-vida de 12 h) × penalidades (já visto ×0,5, mostrar menos ×0,3, silenciada ×0,1)
```

e no fim os criadores são intercalados (diversidade). Tudo é determinístico.

- **Explicação em cada item**: `feedContext` traz as parcelas (`{"a":"pra-voce","s":…,"c":[[convenção, via, pontos]]}`);
  `GET place.aqua.feed.explain?uri=` devolve a conta completa e frases em português.
- **Seu perfil**: `GET place.aqua.convencoes.getProfile` (gravidade, estado,
  fonte explícita/inferida, sinais, tendência, Sinapses, bloqueadas).
- **Histórico**: `GET place.aqua.convencoes.getHistory[?key=]` — o que mudou,
  quando, por quê e se foi você (`usuario`/confirmado) ou a Aqua
  (`aqua`/hipótese). Fica no Git pessoal (`aqua-personal-git`), no formato da
  Base de Sínteses (`7-convencoes-de-realidade/convencoes/<id16>.json`).
- **Ajustes**: `POST place.aqua.convencoes.adjust {key, action, factor?, note?}`
  com `add` (explícita, gravidade mínima 3), `boost` (×0,25–4), `mute`/`unmute`,
  `delete` (esquece os sinais até agora) e `wrong` (esquece e não infere de novo).
- **Sinais sem registro no protocolo**: `POST app.bsky.feed.sendInteractions`
  (mostrar mais/menos, visto) e `POST place.aqua.feed.sendSignals` (salvar, tempo).
- **Login**: JWT de serviço (`com.atproto.server.getServiceAuth` com
  `aud=<DID do serviço>` e `lxm=<método>`), verificado contra a chave do DID.
  Sem login, o "Pra você" vira um feed genérico (recentes + em alta).
- **Categorias sensíveis** (desligadas por padrão): saúde, política, religião,
  sexualidade e identidade de gênero, conteúdo adulto (+18, inclusive os rótulos
  `porn`/`sexual`/`nudity`…), origem étnica e raça, filiação sindical e finanças
  pessoais (dívidas/crédito). A lista é explícita, em `src/conventions/sensitive.ts`
  (#tags exatas, alguns prefixos e rótulos), e pode ser trocada por
  `SENSITIVE_CATEGORIES_FILE`. A Aqua **não infere** Convenções dessas categorias
  (nem Sinapses com elas) até o usuário ativar a categoria em
  `POST place.aqua.convencoes.setSensitive {categoria, ativa}`; Convenções que ele
  adiciona continuam valendo. Desativar tira as inferidas na hora. Cada
  ativação/desativação vira commit no histórico (`sensiveis.json` + as Convenções
  da categoria que entraram/saíram).
- **Privacidade**: só guarda sinais de quem já usou o "Pra você" (o Jetstream é
  público, mas não montamos perfil de quem nunca pediu), por
  `SIGNAL_RETENTION_DAYS` (180).

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
3. **Imagem** (da raiz do repositório, porque o "Pra você" usa `aqua-personal-git`):
   `docker build -f aqua-feeds/Dockerfile -t aqua-feeds .` e rodar com as variáveis
   de `.env.example`.
4. **Publicar o feed** (uma vez, ou para mudar nome/descrição), com uma **senha de
   app** da conta oficial da Aqua:
   ```bash
   FEEDGEN_HANDLE=aqua.bsky.social FEEDGEN_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx \
   FEEDGEN_HOSTNAME=feeds.aquaapp.systems FEED=todos npm run publish-feed
   ```
   (`FEED=em-alta` é o padrão; `pra-voce` publica o feed pessoal com
   `acceptsInteractions: true`.)
   O script imprime a URI `at://<did>/app.bsky.feed.generator/em-alta`. Coloque o
   DID em `FEEDGEN_PUBLISHER_DID` no serviço e reinicie.
5. **App**: defina `EXPO_PUBLIC_AQUA_HOT_FEED_URI=<URI do em-alta>` no build do app
   (e, para o "Pra você", `EXPO_PUBLIC_AQUA_FOR_YOU_FEED_URI=<URI do pra-voce>`,
   `EXPO_PUBLIC_AQUA_FEEDS_URL=https://<FEEDGEN_HOSTNAME>` e
   `EXPO_PUBLIC_AQUA_FEEDS_DID=did:web:<FEEDGEN_HOSTNAME>`).
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
