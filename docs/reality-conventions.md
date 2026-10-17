# Convenções de Realidade

Primeira infraestrutura do AQUA para transformar uso em significado.
Isto não é um perfil psicológico, não é a lista de interesses do onboarding
e não é um ranking que substitui o feed.

Um evento sozinho quase não significa nada. Eventos contextualizados podem
formar uma **Convenção**. Convenções que voltam a aparecer juntas podem formar
uma **Sinapse**. Convenções e sinapses recorrentes podem formar uma **Síntese**.

A Convenção descreve o significado do conteúdo ou do contexto. Ela não afirma
quem a pessoa é.

## O que foi implementado

| Fase | Estado |
|---|---|
| AQUA-049A evento → extrator por regras → registro → evidência → grafo pessoal → ativação, confiança, gravidade, persistência, explicação | implementado |
| AQUA-049B decay, dormência, reativação, feedback explícito | implementado |
| AQUA-050 consultas do grafo, sinais de ranking, saturação | implementado, não ligado ao feed |
| AQUA-051 sinapses, sínteses, grafo coletivo | implementado em processo |

A engine fica em `src/lib/conventions/` e nasce **desligada**.
Com `enabled: false`, ou se o armazenamento vier corrompido, os sinais de
ranking são neutros: o rank que já existia não muda.

```ts
const conventions = createConventionEngine({enabled: true})

await conventions.processEvent(event)
const graph = await conventions.getPersonalGraph(userDid)
const ranked = await conventions.rankCandidate({
  userDid,
  content,
  context,
  existingRank,
})
const explanation = await conventions.explain({userDid, content})
```

`processEvent` aceita um `SemanticEvent` ou um `ViewEvent` do AQUA
(`src/lib/views/events.ts`). O adaptador está em
`events/view-adapter.ts`. `recordViewEvent` continua devolvendo o mesmo
evento. Ele ganhou `subscribeViewEvents`, que só avisa quem se inscreveu.
Sem inscritos, o comportamento anterior permanece. Nenhuma tela chama
`attachConventionEngine` (`bridge.ts`). Quem for ligar a engine chama
`ingestViewEvent`, `attachConventionEngine` ou `createConventionEventSink`.

Os eventos de view de hoje não carregam título nem tags. A extração usa o
`content` enviado junto do evento, ou um `contentResolver` opcional.
Sem isso, o evento de view não inventa uma Convenção.

## O que não foi implementado

- Chamada automática a partir de Home, Feed, like, save ou follow.
  `subscribeViewEvents` existe e fica vazio até alguém optar por ele.
- Extrator por modelo de linguagem. O contrato `SemanticExtractor` existe;
  a implementação desta versão é `RuleBasedExtractor`.
- Tela pública de debug. Há `debugInspect`, que devolve JSON.
- Git semântico pessoal (AQUA-052). Existem `ConventionGraphSnapshot` e
  `ConventionGraphDiff`. Não há histórico git.
- Anúncios (AQUA-053) e royalties (AQUA-054).
- Ponte 616 (AQUA-055). Nada desta engine vai para uma chain.
- Base de Sínteses distribuída. Há um `SynthesisRepository` em memória.
  A pasta `base-de-sinteses/` não é lida nem escrita.
- Autômatos, U.I. como agente, e inferência de crença, ferida, medo ou esperança.
- `ServerConventionStore` e gravação no PDS.

Os marcadores estão em `src/lib/conventions/future.ts`.

## Conceitos que permanecem distintos

| Conceito | Papel nesta versão |
|---|---|
| Convenção | Unidade semântica estável: `namespace + type + canonical key` |
| Evidência | Por que a Convenção existe, com peso, polaridade e origem |
| Ativação | Quão presente ela está agora |
| Gravidade | Presença relacional acumulada, não contagem de likes |
| Confiança | Qualidade da evidência, não uma verdade sobre a pessoa |
| Contexto | Ativação por superfície, projeto, comunidade, creator, formato ou janela |
| Saturação | Exposição recente. Relevância alta pode conviver com saturação alta |
| Sinapse | Relação recorrente entre duas Convenções. Uma coincidência não basta |
| Síntese | Componente computacional de sinapses. Não é texto de IA |
| Grafo pessoal | Estado daquela pessoa. Não é o perfil AT Protocol |
| Grafo coletivo | Gravidade na rede. Não é copiado para o grafo pessoal |

## Fluxo

```text
ViewEvent ou SemanticEvent
        │
        ▼
Event adapter
        │
        ▼
RuleBasedSemanticExtractor
  tags, hashtags, facets, categorias, léxico, frases conhecidas,
  tipo de conteúdo, creator só em follow/subscribe
        │
        ▼
ConventionRegistry  (canonicalização e aliases)
        │
        ▼
Evidence + Activation + Confidence + Gravity
        │
        ▼
PersonalConventionGraph
        │
        ├── co-ocorrência na sessão ──► Synapse ──► Synthesis (lote)
        │
        └── exposures ──► Saturation ──► Ranking signals (não ligados ao feed)

observeNetwork ──► CollectiveConventionGraph
```

`processEvent` atualiza só as Convenções do evento. Decay, síntese e gravidade
coletiva não varrem a vida inteira da pessoa a cada impressão.

## Arquivos

```text
src/lib/conventions/
  index.ts                 API pública
  types.ts                 schemaVersion 1
  processor.ts             createConventionEngine
  bridge.ts                inscrição opcional em recordViewEvent
  policy.ts                pesos e fórmulas substituíveis
  registry.ts              ids e aliases
  normalize.ts
  privacy.ts               bloqueio de rótulos de identidade
  validate.ts              estado persistido não confiável
  events/                  adaptador de ViewEvent e sink em processo
  extraction/              contrato + extrator por regras
  activation/              atualização e decay
  gravity/                 gravidade pessoal e coletiva
  synapses/detector.ts
  synthesis/               motor e repositório em memória
  saturation/engine.ts
  ranking/                 sinais e blend opcional
  graph/                   consultas, contexto, snapshot e diff
  storage/                 memória e porta chave-valor
  explain/explanation.ts
  debug.ts
  future.ts
  telemetry.ts             spans aqua.convention.*
```

## Fórmulas desta versão

Não são a fórmula final. Cada uma mora numa policy e pode ser trocada no
`createConventionEngine`.

- Peso do sinal: `getSignalWeight(eventType, context)`. Impressão e view
  curto pesam pouco. Save, follow, busca e “mostrar mais” pesam muito.
  “Mostrar menos” e mute pesam negativo. Os números estão em `policy.ts`.
- Ativação positiva: `atual + peso * ganho * (1 - atual)`.
- Decay: meia-vida. `activation * 0.5 ^ (tempo / halfLife)`. O histórico
  não é apagado. Status: `emerging → active → weakening → dormant`.
  Evidência nova tira uma Convenção dormente do sono.
- Confiança inferida: `1 - e^(-growth * massa positiva)`. Pin explícito
  não fica abaixo de 0.95.
- Gravidade pessoal: combinação limitada de recorrência, persistência,
  ativação, confiança, profundidade, contextos, sinapses e sinal explícito.
- Gravidade coletiva: volume, atores, creators, comunidades, gestos sociais,
  profundidade, persistência e velocidade. É outro número, noutro grafo.
- Sinapse: a mesma dupla precisa recorrer (`minRecurrence` 2) dentro da
  sessão. Força `recorrência / (recorrência + 4)`.
- Saturação: exposições da janela / `fullAt` (8 em 24h), por tópico,
  entidade, creator e formato.
- Blend de ranking, se alguém chamar `applyConventionSignals`: o peso
  coletivo (0.08) é menor que o pessoal (0.35) e a saturação desconta.
  O feed não chama essa função.

## Persistência

`ConventionStore` é a porta. `MemoryConventionStore` guarda o processo.
`LocalConventionStore` recebe um `get`/`set` e não fala com `localStorage`
nem com MMKV. O schema do `src/storage` não foi alterado.

Todo registro persistido tem `schemaVersion`. Versão diferente da 1 é
rejeitada. Tipo desconhecido vira `other` e guarda `unrecognizedType`.
JSON inválido não sobe exceção até o feed: o rank volta neutro.

O grafo pessoal não entra no PDS e não entra na pasta `base-de-sinteses/`.
Essa pasta pertence à Unidade de Inteligência, que é outro sistema.

## Ranking

O feed continua com a ordem que já tinha (`getRelatedMedia` e os feeds
AT Protocol). A engine só calcula `ConventionRankingSignals`:

```text
personalRelevance
personalGravity
collectiveGravity
novelty
saturationPenalty
confidence
```

`neutral: true` significa “não some nem subtraia nada”.

## Privacidade

A engine não grava senha, e-mail, telefone, coordenada, diagnóstico,
orientação sexual, religião ou identidade política.

O extrator não emite os tipos reservados `belief`, `symbol`, `wound`,
`fear`, `hope`. Um rótulo no formato “depressed user” ou “left-wing user”
é descartado. Um tópico de conteúdo, como `music` ou `open-source`, pode
existir. Ativação alta de `open-source` não significa que a pessoa
“acredita” em open source, nem que ela é música.

Conteúdo classificado como `adult_private` não entra neste grafo.

Telemetria (`aqua.convention.extract`, `update`, `synapse`, `synthesis`,
`rank`) leva contagens e tipos. Não leva título, busca nem texto do grafo.

## Feedback

`applyFeedback` aceita `show_more`, `show_less`, `mute`, `unmute`,
`reset_inference`, `pin` e `remove`.

Explícito pesa mais que inferência fraca. `pin` fixa confiança alta e
pode ser removido. `reset_inference` baixa o que foi inferido e conserva
a evidência e o que a pessoa fixou (`source: explicit`). Mute guarda a
ativação latente para o unmute.

## Limitações conhecidas

- A co-ocorrência da sessão vive na memória do processo. Um reload perde
  a janela aberta; as sinapses já gravadas ficam.
- O conjunto de aliases é pequeno de propósito. Tag solta vira tópico;
  frase só entra se estiver na tabela.
- O grafo coletivo conta atores até um teto (`actorCap`).
- Não há agendador de decay. Quem quiser materializar o decay chama
  `decay(subjectId)`. O ranking não reprocessa o passado sozinho.
- A síntese não tem frase gerada. `summary` fica vazio.
- Cache de ranking: no máximo 32 entradas, chaveada pela revisão do grafo.

## Integração futura

A U.I. pode consultar o grafo. Ela não é esta engine.
Um extrator externo pode implementar `SemanticExtractor` sem trocar o resto.
AQUA-052 pode gravar os snapshots que esta versão já produz.
