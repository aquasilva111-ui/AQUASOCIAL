# Git pessoal semântico da AQUA — formato da Base de Sínteses

> Status: **núcleo testado** (`aqua-personal-git/`) e **primeiro uso real** no
> feed "Pra você" (`aqua-feeds/`), onde ele guarda o histórico das Convenções de
> cada usuário. O formato segue a **Base de Sínteses** e as regras de identidade
> da **U.I.** (`I.U-A.I`), usados aqui só como **referência de leitura**: nada
> nesses dois repositórios foi alterado.

Princípio: **a AQUA interpreta. O Git pessoal registra a evolução. A 616 Network
prova autoria e direitos.**

```
uso da AQUA ─► sinais (curtir, salvar, seguir…) ─► perfil de Convenções (gravidade, estado)
                                                         │
                     ajustes do usuário ─────────────────┤
                                                         ▼
                          commit no Git pessoal (fonte + status + porquê)
                                │                    │
                    histórico/tendência         (opcional) hash ─► 616 Network
                    "Minhas Convenções"
```

---

## 1. Layout: as 7 Esferas

O repositório tem as mesmas pastas da Base de Sínteses:

| Esfera | Pasta |
|---|---|
| 7 | `7-convencoes-de-realidade/` |
| 6 | `6-intelectual/` |
| 5 | `5-comunicacao/` |
| 4 | `4-conexao/` |
| 3 | `3-ego/` |
| 2 | `2-criacao/` |
| 1 | `1-existencia/` |

- **Convenções** moram sempre em `7-convencoes-de-realidade/convencoes/<id16>.json`
  (a casa delas), qualquer que seja a esfera do objeto.
- **Sinapses** e **Sínteses** moram em `<n>-<esfera>/sinapses|sinteses/<id16>.json`,
  na esfera do objeto; sem esfera, entram pela **3 (ego)**, a esfera de entrada.
- `<id16>` = os 16 primeiros caracteres do id de significado (seção 3).
- `ia-chats/` e `dados/` são **só do branch privado**: o núcleo recusa esses
  caminhos em qualquer branch público (`public`, `publico`, `public/*`).

Código: `ESFERAS`, `caminhoDe`, `ehPrivado`, `pastaDoCaminho` em
`aqua-personal-git/src/semantica.ts`.

## 2. Campos (em português, como na Base)

```json
{
  "id": "f990d32e…(64 hex)",
  "tipo": "tema",
  "nomes": ["arte"],
  "descricao": "",
  "forca": 3,
  "esfera": 3,
  "ancoras": [{"fonte": "wikidata", "valor": "Q735"}],
  "rotulos": ["visual"],
  "status": "hipótese",
  "fonte": "aqua",
  "proposta_por": "aqua",
  "criada_em": "2026-10-11T10:00:00Z",
  "atualizada_em": "2026-10-11T10:00:00Z",

  "gravidade": 4.2,
  "estado": "ativa"
}
```

- `status`: `hipótese` → `verificado` → `ensinado` → `confirmado`. **Só sobe**
  (`subirStatus`); descer exige uma edição manual explícita.
- `fonte`: `samuel`, `usuario`, `wikidata`, `arena`, `sono`, `aqua`, `importacao`,
  `edicao-manual`.
- **Explícito × inferido** sai desses dois campos: `fonte ∈ {samuel, usuario,
  edicao-manual}` com `status: confirmado` é explícito; `fonte: aqua` com
  `status: hipótese` é inferido (`certeza()` devolve `explicito`, `verificado` ou
  `inferido`).
- `gravidade` e `estado` (`emergente`, `ativa`, `enfraquecendo`, `dormente`) são
  **opcionais**: a Base não tem esses campos; a AQUA os acrescenta quando calcula
  o perfil. O "Pra você" grava também `reforco` (boost) e `silenciada`.
- `validarObjeto` confere, a cada commit, que o id bate com o nome do arquivo,
  com a esfera da pasta e com o significado.

## 3. Identidade dupla

1. **Id de significado** (o mesmo da U.I., `repositorio.py` 68–75): quem é o
   objeto, independentemente da versão.
   - `normalizar(t)` = NFKC → minúsculas → espaços colapsados (com a mesma lista
     de espaços do Python, que inclui U+001C–001F e U+0085 e **não** inclui U+FEFF).
   - `gerar_id(estrutura, *partes)` = `sha256(json.dumps([estrutura, *partes],
     ensure_ascii=False, separators=(",", ":")))`.
   - Convenção: `["convencao", normalizar(tipo), normalizar(nome)]`, ou
     `["convencao", fonte, valor]` quando tem âncora (ex.: Wikidata).
   - Sinapse: `["sinapse", origem, destino, normalizar(tipo), normalizar(contexto)]`.
   - Síntese: `["sintese", sorted(set(ids))]`.
   - Pendente: `gerar_id("pendente", json.dumps(proposta, ensure_ascii=False,
     sort_keys=True))[:16]`, sem `pendente_id`/`procedencia`.
2. **Hash de conteúdo** (`sha256:` + JSON canônico): qual **versão** do objeto.
   É o que entra nas árvores e commits, e o que vai para a 616 como prova.

**Paridade Python↔TypeScript** (`aqua-personal-git/test/paridade.test.ts`): 164
vetores gerados pelo próprio código da U.I. (`scripts/gerar-vetores.py`, leitura
apenas), incluindo 16 Convenções e 6 Sinapses reais da Base (só os campos que
formam o id) e unicode difícil: `2ª Esfera: Criação`, `♒︎`, `🜓`,
`Autômato ☽♇`, âncora `Q220`, espaços exóticos e surrogates soltos (que o TS
recusa em vez de gerar um id diferente).

## 4. Pendentes: o que a AQUA propõe

A AQUA nunca muda em silêncio o que é do usuário. Uma inferência vira um item na
fila `pendentes` no formato da U.I.:

```json
{"id": "<16 hex>", "estado": "aberta", "criada_em": "…", "visto_em": null,
 "sessao": "…", "fonte": "aqua", "motivo": "curtiu 5 posts com #aquarela",
 "proposta": {"tipo": "tema", "nomes": ["aquarela"], "status": "hipótese", "esfera": 3},
 "resolvida_em": null}
```

- `proporInferenciaAqua` monta a proposta (`fonte: aqua`, `status: hipótese`,
  esfera 3) e põe as evidências em `procedencia`, fora da chave: a mesma proposta
  com evidências novas **não duplica**.
- `aceitar` devolve o caminho e o objeto com `status: confirmado`, pronto para
  commit; `recusada` fica registrada (até 200 resolvidas) para não propor de novo.
- No "Pra você" o caminho é mais curto: o perfil inferido entra como commit
  `aqua`/`hipótese` (seção 6), e cada ajuste do usuário entra como commit
  `usuario`/`confirmado`. A fila de pendentes é para quando a U.I. estiver
  pareada e quiser mudar objetos que o usuário confirmou.

## 5. Público × privado e lexicons

Só o que o usuário escolher vai para o PDS (público), como registros:

| Lexicon | Conteúdo |
|---|---|
| `place.aqua.semantic.convencao` | Convenção (rkey = `id16`) |
| `place.aqua.semantic.sinapse` | Sinapse |
| `place.aqua.semantic.sintese` | Síntese |

`paraRegistroPublico` remove `proposta_por`, acrescenta `hashConteudo` e recusa
qualquer coisa de `ia-chats/` ou `dados/`. **`ia-chats/` nunca sai do privado.**

## 6. Primeiro uso: o histórico do "Pra você"

O feed "Pra você" (`aqua-feeds/src/algos/for-you/`) mostra ao usuário **por que**
cada post apareceu e deixa ele ajustar o peso das Convenções. O Git pessoal é o
**histórico** disso (`aqua-feeds/src/conventions/history.ts`):

- `getProfile` grava, no máximo a cada `DIGEST_HOURS` (6 h), um commit
  "Resumo da sua atividade…" com `fonte: aqua`, `status: hipótese`.
- Cada ajuste (`add`, `boost`, `mute`, `unmute`, `delete`, `wrong`) grava na hora
  um commit só daquela Convenção com `fonte: usuario`, `status: confirmado` e o
  motivo em português ("Você marcou tema:x como errada…").
- `getHistory` devolve o que mudou, quando, por quê e se foi explícito ou
  inferido; `trendOf` tira a série de gravidade para o gráfico de tendência.
- Hoje o branch privado de cada usuário fica no Postgres do `aqua-feeds`
  (`user_repos`, o pacote exportado). **Sem criptografia ainda** — é o MVP; o
  desenho final é o da seção 7.

### Categorias sensíveis (não inferidas por padrão)

Decisão do Samu: a Aqua **não deduz** Convenções destas categorias a partir da
atividade, a menos que o usuário ative a categoria (uma por uma, desligadas por
padrão):

| id | Categoria |
|---|---|
| `saude` | Saúde (inclui saúde mental, remédios, gravidez) |
| `politica` | Política (partidos, eleições, ideologias) |
| `religiao` | Religião e crenças |
| `sexualidade` | Sexualidade e identidade de gênero |
| `adulto` | Conteúdo adulto +18 (inclui rótulos `porn`, `sexual`, `nudity`, `sexual-figurative`, `graphic-media`, `gore`) |
| `etnia-raca` | Origem étnica e raça |
| `sindicato` | Filiação sindical |
| `financas-pessoais` | Finanças pessoais claramente sensíveis (dívidas, nome sujo, falência, empréstimos) |

- A lista é **explícita** (`aqua-feeds/src/conventions/sensitive.ts`): #tags
  exatas (normalizadas sem acento), alguns prefixos (`lgbt…`) e rótulos.
  Configurável por `SENSITIVE_CATEGORIES_FILE`. Não há classificação por IA.
- Sem opt-in, sinais com essas Convenções não contam para elas (nem formam
  Sinapses) e elas não aparecem no perfil nem no histórico; o resumo seguinte
  remove do Git as que já tinham sido inferidas.
- Convenções sensíveis **adicionadas pelo usuário** continuam valendo.
- Ativar/desativar é um commit `usuario`/`confirmado` com `sensiveis.json`
  (`categorias_ativas`) e as Convenções da categoria que entraram ou saíram.

## 7. Quem é dono do Git: a U.I.

- O **Git local é da U.I.** (no aparelho/computador do usuário). A AQUA não é a
  fonte de verdade: ela **sincroniza** esse Git como um **remoto criptografado**.
- A chave fica **no aparelho** (gerada e guardada pela U.I.; em celulares, uma
  passkey com PRF pode derivá-la). O servidor guarda só blobs cifrados + hashes
  de conteúdo, o que basta para sincronizar e para a prova na 616, sem ver o
  conteúdo.
- Enquanto a U.I. não estiver pareada, o "Pra você" usa a cópia do servidor
  (seção 6). Ao parear, a U.I. puxa esse histórico, passa a ser a dona e o
  servidor fica só com o remoto cifrado.

### Permissões em `manifest.json`

Mesmo modelo de `permissoes.py` da U.I. (**uma vez / sempre / nunca**), aplicado
a pastas do Git em vez de pastas do computador:

```json
{
  "formato": "aqua-personal-git/2",
  "permissoes": [
    {"quem": "aqua", "pasta": "7-convencoes-de-realidade/convencoes", "acoes": ["propor"], "alcance": "sempre", "desde": "…"},
    {"quem": "aqua", "pasta": "3-ego/sinapses", "acoes": ["escrever"], "alcance": "uma-vez", "pedido": "<id do pendente>"},
    {"quem": "*",    "pasta": "ia-chats", "alcance": "nunca"},
    {"quem": "*",    "pasta": "dados",    "alcance": "nunca"}
  ],
  "publicar": false
}
```

- `uma-vez`: vale para aquele pedido e acaba. `sempre`: vale para a pasta (e as
  de dentro) até ser revogada. `nunca`: nem com permissão.
- Sem regra → a AQUA só pode **propor** (vira pendente).
- `publicar` é do usuário; nenhuma regra dá à AQUA o poder de publicar.
- O `manifest.json` é versionado como qualquer arquivo (fora do layout das
  Esferas, então o `validarObjeto` não o confere).

## 8. 616 Network (prova)

Só a prova vai para a cadeia, nunca o estado: `{hashConteudo ou commitHash, did,
timestamp, branch, licenca, derivadoDe[]}` assinado com a chave do DID. Commits
privados só expõem o hash, e só se o usuário pedir. (Formato e cadeia da 616
ainda não definidos.)

## 9. Núcleo (`aqua-personal-git/`)

| Arquivo | O que faz |
|---|---|
| `canonical.ts` | JSON canônico + `sha256:` (hash de conteúdo) |
| `semantica.ts` | `normalizar`, `gerarId`, `idConvencao/Sinapse/Sintese`, `chavePendente`, Esferas, caminhos, `validarObjeto`, status/fonte, lexicons, `paraRegistroPublico` |
| `pendentes.ts` | fila de pendentes, `proporInferenciaAqua`, `aceitar` |
| `repo.ts` | commits encadeados com `fonte`/`status`, diff, revert, restore, verify, export/import (`aqua-personal-git/2`) |

`cd aqua-personal-git && npm ci && npm test` — 20 testes (13 do repositório + 7 de
paridade). `npm run vetores` regenera os vetores a partir da U.I. local
(`UI_DIR`, `BASE_DIR`), sem escrever nada lá.

## 10. Perguntas abertas

1. A U.I. pareada substitui a cópia do servidor imediatamente, ou as duas
   convivem (servidor só como remoto cifrado) desde o primeiro dia?
2. Licença padrão do que for publicado e formato/cadeia da 616.
