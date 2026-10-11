# Git pessoal semântico da AQUA (seção 23) — desenho

> Status: **desenho + núcleo testado** (`aqua-personal-git/`). Nada disto está
> ligado ao app ainda. Convenções, Sinapses, Sínteses, U.I., camada de eventos e
> 616 Network são definidos em outras seções da especificação que ainda não
> estão aqui; onde eu precisei supor algo, está marcado como **(suposição)**.

Princípio: **a AQUA interpreta. O Git pessoal registra a evolução. A 616 Network
prova autoria e direitos.**

```
uso da AQUA ─► eventos (retenção curta) ─► interpretação ─► Convenções / Sinapses / Sínteses
                                                                   │
                                          diff semântico ◄─────────┘
                                                │
                              U.I. valida (dentro das permissões) ─► commit
                                                │                      │
                                       pendente/inferido          histórico, diff, rollback
                                       (usuário decide)                 │
                                                          (opcional) hash ─► 616 Network
```

---

## 1. O que já existe no código (levantamento)

| Conceito | Onde | O que é |
|---|---|---|
| **Convenções (chaves)** | repositório **`feed-generator/`** separado (no `.gitignore` deste repo; ver commits `b574e6abc` e `d7d19380b`) | Pelos testes que estavam aqui: `conventions/extract.ts` (`conventionKeys` → `formato:video`, `criador:<did>`, `tema:musica`, `idioma:pt`; `contextOf` → `madrugada`/`noite`…), `conventions/model.ts` (`conventionId`, `canonical()`, **`versionHash(key, versão, estado, hashAnterior)` — uma cadeia de versões por hash**), `conventions/gravity.ts` (gravidade com meia-vida; estados `emerging`/`active`/`weakening`/`dormant`), `conventions/synapse.ts` (`synapsesFromEvents`: Convenções que co-ocorrem na mesma sessão, por contexto) e `algos/for-you/score.ts` (gravidade pessoal entra no ranking). **O código não está neste repo nem na lista de repositórios do GitHub**; só os testes antigos no histórico. |
| Convenções (estética) | `src/lib/visionboard/algorithm.ts:358-371` | `aestheticConventionKeys` → `estetica:<mood>`, “mais um tipo de Convenção”. |
| Convenções (UI) | `src/screens/NewsAtlas/data.ts` | Página Notícias + Convenções com **dados fixos de exemplo** (“Replace with real sources once the Convenções logic … are wired up”). |
| **U.I.** (Unidade de Inteligência) | `web/ui-ai/index.html`, `web/ui-ai/README.md`, `src/screens/UIAI/` | Consola estática em `aquaapp.systems/ui-ai` que fala com a **U.I. local** (`http://localhost:8765`) por **código de pareamento** (`X-UI-Pareamento`). Mostra contagem de Convenções, Sinapses e Experiências (“Base de Sínteses”). Fonte no repo privado **`I.U-A.I`**. |
| Sínteses | repo privado **`base-de-sinteses`** (“Convenções de Realidade, Sinapses e Sínteses (backup)”) | Não li; só a descrição pública da lista de repositórios. |
| Camada de eventos | `src/lib/views/events.ts` | Eventos de visualização (`impression`, `view`, `watch_time`, superfície `visionboard`…) como spans OpenTelemetry (`aqua.views`). **Não há armazenamento/digestão no servidor** neste repo. |
| Registros próprios no PDS | `src/lib/*/model.ts` | Já existem lexicons `place.aqua.*` (books, stories, highlights, view.channel/collection/playlist, shop, visionboard) — o padrão “dados do usuário no repo dele” já é usado. |
| **616 Network** | — | Nada no código. |
| Interpretação de eventos | — | Nada além do `feed-generator` externo (extração de chaves e sinapses). `aqua-runtime/src/melody/interpret.ts` é sobre música, não tem relação. |

**Consequência:** a peça mais próxima do Git pessoal é o `versionHash` encadeado do
`feed-generator`. O desenho abaixo é compatível com ele (mesma ideia: estado →
JSON canônico → SHA-256 → encadeado ao anterior), mas generaliza do “versionar uma
Convenção” para “versionar o estado semântico inteiro do usuário”.

---

## 2. A questão central: o PDS já é um Git

Um repositório AT Protocol (o PDS de cada usuário) **já é** um repositório
assinado, endereçado por conteúdo e versionado:

- cada escrita gera um **commit assinado** pela chave do usuário (`rev` monotônico);
- os registros ficam numa **MST** (Merkle Search Tree) com **CIDs** (hash do conteúdo);
- o repo inteiro é exportável (`com.atproto.sync.getRepo`, arquivo CAR) e **portável**
  (migração de conta entre PDSs mantendo o DID);
- qualquer um verifica a autoria pela chave pública no documento do DID.

Mas ele tem dois limites para este caso:

1. **É público.** Todo registro é legível por qualquer cliente (é exatamente o que
   vimos no Visionboard: “privado” lá só esconde no app).
2. **Não guarda histórico consultável por registro.** O commit do PDS cobre o repo
   todo; versões antigas de um registro não ficam acessíveis pela API depois de
   substituídas. Não há “por quê”, evidência nem certeza no commit.

### Proposta: dois armazenamentos, um formato

| Branch | Onde mora | Por quê |
|---|---|---|
| **público** (`public`) | **PDS do usuário**, lexicons `place.aqua.semantic.*` | Já é assinado, portável e verificável; publicar é decisão explícita do usuário. |
| **privado** (`private`) | **Cofre cifrado** da AQUA (serviço `aqua-semantic-vault`), cifragem por envelope com chave por usuário | O PDS não tem dado privado. |

Os dois usam **o mesmo modelo de objetos e de `SemanticCommit`** (seção 3). No
público, cada objeto vira um registro e cada commit vira um registro de commit;
no privado, tudo fica cifrado no cofre. Assim exportar, comparar e mover entre
modos de armazenamento é o mesmo código (`aqua-personal-git/`).

Promover do privado para o público é **sempre** um commit novo no branch público,
feito pelo usuário (`source: explicit_user_input`), com o conteúdo que ele
escolheu — **nunca automático**, nunca um merge.

---

## 3. Modelo de dados

### Objetos (o que é versionado)

Layout lógico (= `path` na árvore):

```
conventions/<slug>.json      Convenções pessoais (ativação, gravidade, estado, contextos)
synapses/<a>__<b>.json       relações entre Convenções (peso, contexto)
syntheses/<slug>.json        Sínteses (texto, Convenções de origem)
contexts/{work,study,creative}.json
preferences/explicit.json    o que o usuário disse
preferences/inferred.json    o que foi inferido E aprovado
notes/<slug>.json            notas semânticas do usuário
classifications/<slug>.json  classificações próprias
manifest.json                versão do formato, categorias de inferência ligadas/desligadas
```

Exemplo de objeto (**suposição** dos campos de Convenção, alinhados ao `feed-generator`):

```json
{
  "type": "convention",
  "key": "tema:producao-musical",
  "label": "Produção musical",
  "activation": 0.71,
  "state": "active",
  "contexts": {"noite": 0.8, "madrugada": 0.3},
  "visibility": "private"
}
```

Eventos brutos **não** entram. A evidência é referida por id opaco
(`ev:digest:2026-10-11#musica`) que aponta para a camada de eventos, com a
retenção dela.

### Árvore e commit

- **objeto** → `sha256:` do JSON canônico (`canonical()` do núcleo; chaves
  ordenadas, NFC, sem `undefined`, recusa NaN/Date).
- **árvore** → mapa `path → hash do objeto`, também com hash canônico.
- **commit**:

```ts
interface SemanticCommit {
  id: Hash                 // = hash
  hash: Hash               // sha256(JSON canônico de todos os campos abaixo)
  userId: string           // DID
  branch: 'private' | 'public' | string
  timestamp: string
  parentCommitId: Hash | null
  tree: Hash
  changedObjects: {
    path: string
    kind: 'added' | 'modified' | 'removed'
    before?: Hash
    after?: Hash
    fields: {field: string; before?: Json; after?: Json}[]  // diff semântico
  }[]
  reason: string           // "salvamentos repetidos, tempo de vídeo longo, feedback explícito"
  evidenceRefs: string[]   // ids opacos, nunca o dado bruto
  source: 'explicit_user_input' | 'event_digest' | 'synthesis' | 'import' | 'manual_edit' | 'ui'
  certainty: 'explicit' | 'inferred'
  confidenceChange?: {path: string; field: string; before: number; after: number}
}
```

Isso responde às perguntas da especificação: **o que** mudou (`changedObjects`
+ `fields`), **quando** (`timestamp`), **por quê** (`reason`), **com que
evidência** (`evidenceRefs`), **explícito ou inferido** (`certainty`, `source`)
e **quanto mudou a confiança** (`confidenceChange`).

### Lexicons do branch público (PDS)

```
place.aqua.semantic.object   rkey = slug do path ("conventions:producao-musical")
  { path, value, objectHash, license?, createdAt }
place.aqua.semantic.commit   rkey = TID
  { branch: "public", hash, parentCommitId, tree, changedObjects, reason,
    source, certainty, timestamp }          // sem evidenceRefs no público
```

O PDS assina os registros; o `hash` do `SemanticCommit` continua sendo o
identificador estável entre armazenamentos (o CID do PDS depende da codificação
DAG-CBOR, então não serve como id portátil).

---

## 4. Armazenamento do branch privado (cofre)

Serviço novo `aqua-semantic-vault` (Hono + Postgres, padrão de `aqua-adult-api`):

```sql
create table vault_keys (          -- chave de dados por usuário, cifrada
  user_did text primary key,
  wrapped_dek bytea not null,       -- DEK cifrada pela KEK (KMS) ou pela chave do usuário
  kek_id text not null,
  created_at timestamptz not null default now()
);
create table vault_objects (        -- objetos e árvores, endereçados por hash
  user_did text not null,
  hash text not null,
  kind text not null check (kind in ('object', 'tree')),
  ciphertext bytea not null,        -- AES-256-GCM(DEK, JSON canônico), nonce junto
  primary key (user_did, hash)
);
create table vault_commits (
  user_did text not null,
  hash text not null,
  branch text not null,
  parent_hash text,
  status text not null check (status in ('committed', 'pending')),
  ciphertext bytea not null,        -- o SemanticCommit inteiro cifrado
  created_at timestamptz not null default now(),
  primary key (user_did, hash)
);
create table vault_refs (
  user_did text not null,
  branch text not null,
  head text not null,
  primary key (user_did, branch)
);
```

- **Cifragem por envelope**: uma DEK aleatória por usuário cifra objetos e
  commits (AES-256-GCM). A DEK é guardada cifrada (“wrapped”) por uma KEK.
  - **Modo AQUA-hosted**: KEK no KMS da AQUA. Permite a U.I. no servidor trabalhar.
  - **Modo controlado pelo usuário**: KEK derivada de uma chave que só o usuário
    tem (passkey/WebAuthn PRF ou frase de recuperação). O servidor só vê bytes; a
    U.I. precisa rodar no aparelho (é o que a Consola `/ui-ai` já faz com a U.I. local).
- **Endereçado por hash, mas cifrado**: o `hash` é do texto claro, guardado só
  junto ao `user_did` — vaza no máximo “dois usuários têm o mesmo objeto”, e não
  entre usuários porque a PK inclui o DID. **(Decisão a confirmar: se isso for
  sensível, usar `HMAC(DEK, conteúdo)` como id no cofre.)**
- Apagar uma estrutura = commit que remove + **apagar o ciphertext** dos objetos
  sem referência (coleta de lixo). Apagar a conta = apagar a DEK (crypto-shredding).

Modos futuros (auto-hospedado, espelho local, Git externo) são só outros
“stores” do mesmo formato; o pacote de exportação (seção 6) já é o formato de troca.

---

## 5. API

Tudo autenticado por token de serviço do PDS (padrão `aqua-adult-api/src/auth`),
escopo = o próprio DID.

```
GET  /semantic/branches                         heads e contagens
GET  /semantic/:branch/tree?at=<hash>           árvore (estado) num commit
GET  /semantic/:branch/objects/*path?at=<hash>  um objeto
GET  /semantic/:branch/log?path=&cursor=        histórico (filtra por objeto)
GET  /semantic/diff?from=<hash>&to=<hash>       diff semântico entre dois commits
POST /semantic/:branch/commits                  {changes, reason, evidenceRefs, source}
POST /semantic/:branch/revert/:hash             desfaz um commit (commit novo)
POST /semantic/:branch/restore/:hash            volta o branch a um estado (commit novo)
GET  /semantic/pending                          propostas da U.I. aguardando o usuário
POST /semantic/pending/:id/accept | /reject | /edit
POST /semantic/public/publish                   {paths, values}: escreve no PDS (place.aqua.semantic.*)
GET  /semantic/export?branch=private            pacote (cifrado com senha do usuário, se pedido)
POST /semantic/import                           pacote → confere hashes → aplica
PUT  /semantic/permissions                      permissões da U.I. (seção 7)
PUT  /semantic/inference                        categorias de inferência ligadas/desligadas
```

---

## 6. Diff, rollback e exportação

- **Diff** é por objeto e por campo (`diffFields`): `activation 0.42 → 0.71`.
- **Revert** desfaz um commit com um commit novo; se o objeto mudou depois
  (outro commit), é **conflito** e a UI pede para reverter os mais novos antes.
- **Restore/rollback** leva o branch ao estado de um commit antigo, também como
  commit novo. O histórico **nunca é reescrito**.
- **Exportação** `aqua-personal-git/1`: JSON com `commits` (em ordem), `trees` e
  `objects`, todos com hash. A importação **reproduz cada commit e confere cada
  hash**; qualquer edição no arquivo é detectada (testado).
  Exportação sensível: o JSON é cifrado com uma senha do usuário (age/scrypt ou
  AES-GCM + scrypt) antes de sair.

Tudo isto está implementado e testado em `aqua-personal-git/` (seção 10).

---

## 7. Permissões da U.I.

A U.I. lê e escreve **só dentro do que o usuário delegou**. Proposta de política,
guardada em `manifest.json` (portanto versionada também):

```json
{
  "ui": {
    "read":  ["conventions/*", "synapses/*", "contexts/*"],
    "write": {
      "conventions/*": {"fields": ["activation", "state", "contexts"], "maxDelta": 0.15},
      "synapses/*":    {"fields": ["weight"], "maxDelta": 0.2}
    },
    "never": ["preferences/explicit.json", "notes/*"],
    "publish": false
  },
  "inference": {"saude": false, "politica": false, "religiao": false, "musica": true}
}
```

- Mudança **dentro** da delegação (campo permitido, delta ≤ `maxDelta`, categoria
  ligada) → a U.I. comita com `source: "ui"`, `certainty: "inferred"`.
- Mudança **fora** (campo não permitido, salto grande, objeto novo, categoria
  desligada, qualquer coisa em `preferences/explicit`) → vira **pendente**.
- `publish` é sempre falso para a U.I.: só o usuário promove para o público.

## 8. Fluxo pendente / inferido

```
evento ─► interpretação ─► proposta de mudança (diff)
                              │
          dentro da permissão? ── sim ─► commit (inferred) ─► usuário pode reverter
                              │
                              não ─► pending (não altera o estado)
                                        │
                     usuário: aceitar ─► commit (explicit, evidenceRefs = proposta)
                              editar  ─► commit com o valor dele (explicit)
                              rejeitar ─► descarta; a U.I. aprende a não propor de novo
                                          (contador em manifest.inferenceFeedback)
```

Pendentes ficam em `vault_commits.status = 'pending'`, **fora** da cadeia do
branch (sem `parentCommitId` fixo); ao aceitar, são recalculados sobre o head
atual. A U.I. **nunca** inventa decisões pessoais em silêncio: qualquer coisa em
`preferences/explicit.json` só muda por `explicit_user_input` ou `manual_edit`.

## 9. 616 Network (prova)

Só a prova vai para a cadeia, **nunca** o estado:

```json
{
  "commitHash": "sha256:…",
  "author": "did:plc:…",            // assinatura com a chave do DID
  "timestamp": "2026-10-11T10:00:00Z",
  "branch": "public",
  "license": "CC-BY-4.0",
  "derivedFrom": ["sha256:…"]        // provenance: Convenção pessoal → Global → Projeto B
}
```

- Só commits do branch **público** são ancorados por padrão; ancorar um commit
  privado expõe apenas o hash (não o conteúdo), e só se o usuário pedir.
- **(Suposição)** a 616 aceita um registro com hash + DID + assinatura; para
  muitos commits, ancorar a raiz de uma árvore de Merkle dos hashes do dia.
- Royalties/créditos usam `derivedFrom`: quando o Projeto B usa uma Convenção
  pública, ele registra o hash do commit de origem.

---

## 10. Núcleo implementado (`aqua-personal-git/`)

Sem I/O e sem dependências (só `node:crypto`):

| Função | O que faz |
|---|---|
| `canonical`, `hashOf` | JSON canônico + `sha256:` |
| `diffFields` | diff semântico campo a campo |
| `createRepo(userId)` | objetos, árvores, commits e refs em memória |
| `.commit(branch, {changes, reason, evidenceRefs, source, certainty?, confidenceChange?})` | commit encadeado; sem mudança real não cria nada |
| `.log`, `.read`, `.treeAt`, `.diffTrees` | histórico e estado |
| `.revert(branch, hash)` | desfaz com commit novo; conflito se o objeto mudou depois |
| `.restore(branch, hash)` | rollback do branch inteiro, como commit novo |
| `.verify(branch)` | recalcula todos os hashes |
| `.exportBranch` / `importBranch` | pacote portátil; a importação reproduz e confere cada hash |

`cd aqua-personal-git && npm install && npm test` — 10 testes.

---

## 11. MVP em fases

| Fase | Entrega | Depende de |
|---|---|---|
| **0 (este PR)** | Desenho + núcleo testado | — |
| **1 – Cofre privado** | `aqua-semantic-vault` (Hono + Postgres), DEK por usuário com KEK em KMS (modo AQUA-hosted), API de leitura/commit/log/diff/revert/restore/export | definição dos objetos de Convenção/Sinapse/Síntese (seções da spec que faltam) |
| **2 – Ligar a interpretação** | o `feed-generator` (que já calcula chaves, gravidade e sinapses) passa a propor diffs ao cofre em vez de só guardar `versionHash`; tudo entra como **pendente** no início | código do `feed-generator` neste monorepo ou como pacote |
| **3 – Tela “Minha mente” no app** | histórico com diffs legíveis, aceitar/rejeitar pendentes, reverter, exportar, desligar categorias de inferência | Fase 1 |
| **4 – U.I.** | permissões (seção 7), U.I. local pareada lendo/escrevendo pelo cofre; modo chave do usuário (passkey PRF) | repo `I.U-A.I` |
| **5 – Público + 616** | publicar objetos escolhidos em `place.aqua.semantic.*` no PDS; ancorar hash do commit na 616 | definição da 616 |

---

## 12. Perguntas abertas para o Samu

1. **Onde está o código do `feed-generator`** (Convenções, gravidade, sinapses)? Ele
   saiu deste repo e não aparece entre os repositórios do GitHub. Ele deve virar
   pacote compartilhado ou entrar no monorepo?
2. O repo privado **`base-de-sinteses`** é a fonte de verdade das Convenções,
   Sinapses e Sínteses (da U.I.)? O Git pessoal deveria versionar esse formato
   em vez de inventar outro?
3. A U.I. deve rodar **no servidor** (modo AQUA-hosted, mais simples) ou **só no
   aparelho** (chave do usuário, servidor nunca vê o conteúdo)? Muda a fase 1.
4. Quais **categorias de inferência** são sensíveis por padrão (saúde, política,
   religião, sexualidade…) e começam desligadas?
5. Qual é a **616 Network** na prática (qual cadeia, formato do registro, quem paga a
   transação)? Ancorar commit a commit ou em lote diário (raiz de Merkle)?
6. Licença padrão para o que for publicado no branch público?
7. O id de objeto no cofre pode ser o hash do conteúdo, ou prefere HMAC com a chave
   do usuário para não revelar nem igualdade de conteúdo?
