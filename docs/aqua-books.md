# AQUA Reads (antes AQUA Books)

O produto passou a se chamar **Reads**. Rotas, records (`place.aqua.book.*`) e
arquivos continuam com o prefixo `books` por compatibilidade; só o nome visível mudou.

Publicação serializada de livros (estilo Wattpad) dentro do AQUA. Segue o mesmo
padrão do View Channel: não é uma conta; identidade, seguidores e moderação vêm
do Perfil AQUA. Os dados ficam no PDS do próprio autor.

## Fase 1 — Infraestrutura (feita)

| Peça | Arquivo |
| --- | --- |
| Modelo, validação, acesso, thread parts, share card | `src/lib/books/model.ts` |
| Queries e mutations (React Query + com.atproto.repo) | `src/state/queries/books.ts` |
| Testes (20) | `__tests__/lib/books.test.ts` |

### Records

```
at://<did>/place.aqua.book.book/<tid>      título, sinopse, capa (blob), gêneros (≤3),
                                           tags (≤10), idioma, maturidade, status, visibilidade
at://<did>/place.aqua.book.chapter/<tid>   book (at://, mesmo repo), number, title, body (≤60k),
                                           authorNote, status draft|published, publishedAt, threadUri
```

- Só o autor escreve (repo próprio). Leitura via `listRecords`/`getRecord`, sem indexador.
- Todo dado do repo é tratado como não confiável: `normalizeBook/normalizeChapter`
  descartam o que é inválido; um capítulo só vale se apontar para livro **do mesmo autor**.
- Rascunhos são só do dono; livro `private` só do dono; `unlisted` abre por link e
  fica fora da descoberta. (Records AT são públicos: "privado" esconde no AQUA, não é
  barreira de acesso — mesma ressalva do View Channel.)

### Leitura "thread"

Um capítulo tem dois modos de leitura:

1. **Página** — texto corrido, estilo livro.
2. **Thread** — `splitIntoParts` quebra o texto em partes de ~600 caracteres em
   limites de parágrafo/frase, exibidas numa coluna vertical com linha-guia, como
   posts encadeados. Nunca perde nem reordena palavras (testado).

### Comentários e compartilhamento

- Ao publicar com "anunciar", cria-se um `app.bsky.feed.post` com card externo
  (capa + título + prévia ≤280 chars) e seu URI vai em `chapter.threadUri`. **As
  respostas a esse post são os comentários do capítulo** — curtir, responder e
  repostar reaproveitam a infra social existente.
- "Compartilhar no feed principal" (`useShareChapterMutation`) cria um novo post com
  o mesmo card, sob demanda, só para capítulo publicado de livro `public`.
- O card é `app.bsky.embed.external`: qualquer cliente renderiza; o corpo do capítulo
  nunca vai no post.

### Decisões e limites conhecidos

- **Sem feed global ainda.** Sem indexador, a Home de Livros lista por autor
  (seguidos + sugeridos). Descoberta global/ranking → indexar `place.aqua.book.*` no
  `jetstream/` + `feed-generator/` já vendorizados (fase futura).
- **Maturidade 18+**: o campo existe; a integração com o gate do `aqua-adult`
  (esconder de menores, respeitar preferência) é da fase de UI.
- **Exclusão de livro** apaga capítulos primeiro; posts de anúncio já publicados
  permanecem (o autor pode apagá-los no feed).
- Capítulos são texto simples com parágrafos separados por linha em branco (sem rich
  text no v1).

## Fase 2 — Mockups (feita)

9 telas em HTML interativo, no visual do aquaapp.systems (Inter, azul #002BEF).

## Fase 3 — Telas e integração (feita, sem teste em dispositivo)

Rotas (`src/routes.ts`): `/books`, `/books/studio`, `/books/studio/book/:book`,
`/books/studio/book/:book/chapter/:chapter` (`new` cria), `/books/:handle/:book`,
`/books/:handle/:book/:chapter`. `:handle` aceita handle ou DID.

| Tela | Arquivo |
| --- | --- |
| Home (novos capítulos de quem você segue) | `src/screens/Books/BooksHomeScreen.tsx` |
| Detalhe do livro | `BookDetailScreen.tsx` |
| Leitor (Thread / Página, compartilhar, anterior/próximo) | `BookChapterScreen.tsx` |
| Estúdio do autor | `BooksStudioScreen.tsx` |
| Editar livro (capa, gêneros, classificação, visibilidade, apagar) | `BookEditScreen.tsx` |
| Editar capítulo (rascunho, publicar + anúncio, apagar) | `ChapterEditScreen.tsx` |

Menu lateral desktop: o item "Books" agora abre `/books`.

Ainda não feito:
- Render próprio do card de capítulo no feed (hoje é o card de link padrão).
- Lembrar o modo de leitura e o ponto onde o leitor parou.
- Entrada de Livros no menu mobile.
- Feed global (precisa de indexador).
- Comentários por parte do thread (v1 comenta o capítulo inteiro).

## Fase 4 — Feed Reads (feita, sem teste em dispositivo)

`/reads` (`ReadsFeedScreen.tsx`): feed vertical estilo Threads. Cada card é uma
parte (`splitIntoParts`) do último capítulo de livros de quem você segue; "Biblioteca"
leva a `/books`. Menu desktop: "Reads" → `/reads`.

| Ação | Como funciona |
| --- | --- |
| Curtir | curte o post-anúncio do capítulo (`threadUri`); contagem é do capítulo, não da parte |
| Republicar thread | novo post com card (título + trecho ≤280) apontando para `#parte-N` |
| Publicar no story | `StoryPartCard` (1080x1920) → `react-native-view-shot` → `useCreateStoryMutation` |

Doadores de referência (só padrões, nenhum código copiado — são backends
Postgres/Next, o AQUA é PDS): Aaccraa para lógica de publicação/engajamento,
Rantale para descoberta e UX do leitor.

Pendente: curtida **por parte** (precisa indexador), o leitor rolar até `#parte-N`,
paginação/mais capítulos no feed, ícones no lugar dos rótulos, item no menu mobile.
