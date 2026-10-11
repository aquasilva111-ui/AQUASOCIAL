# Launch Hub: modo assistido

Onde a rede não tem API gratuita (ou a Aqua ainda não tem a integração), o Launch Hub usa o **modo assistido**: a Aqua prepara o post de cada rede e abre a tela de postar **da própria rede**, já preenchida quando a rede permite. A pessoa toca em "Publicar" lá e marca aqui. Não há automação de sessão logada, scraping nem post escondido.

## Como funciona

1. **Registro único** em `src/lib/launch-hub/destinations.ts`: para cada rede, `id`, nome, ícone (monograma + cor), `mode` (`auto` | `assistido`), capacidades (limite de texto e como a rede conta, link, imagens, vídeo) e, nas assistidas, o construtor da URL oficial de compartilhar.
2. **Modo efetivo** (`effectiveMode`): Aqua/Bluesky são `auto` (sessão AT Protocol). Uma rede com `adapter: 'integration-api'` vira `auto` sozinha quando a API de integração do AQUA estiver configurada (`backend.ts`), sem mudar nenhuma tela. Redes com `adapter: 'none'` (Reddit, Wattpad, BandLab, WhatsApp, Telegram) ficam sempre assistidas.
3. **Formatação por rede** (`formatting.ts`): corta o texto para caber no limite (X: 280 com links contando 23 e CJK/emoji contando 2; Threads 500; Mastodon 500…), acrescenta as hashtags do lançamento (tira primeiro as hashtags se isso evitar cortar o texto), põe o link do lançamento e o **link de volta para o post na Aqua** (`EXPO_PUBLIC_AQUA_WEB_URL`).
4. **"Publicar em todas"**: publica os destinos automáticos e mostra, no detalhe do lançamento, um passo a passo das redes assistidas: prévia, contagem de caracteres, **Copiar texto**, **Abrir no X/…** (nova aba no navegador via `window.open`, para não marcar "aberto" se o pop-up foi bloqueado; `Linking.openURL` no celular; o texto também vai para a área de transferência), **Compartilhar mídia** (celular, folha de compartilhar nativa via `expo-sharing`), **Marcar como publicado**, **Pular**, **Não deu certo**, **Desfazer**.
5. **Status por destino** salvo no próprio lançamento (store local do Launch Hub): `pendente` → `aberto` → `publicado` | `erro` | `ignorado`. O lançamento fica "Aguardando você" enquanto houver redes assistidas pendentes e aparece nessa aba da lista.

## Visual (referência: mockup da Aquarela, `launch-hub-publicar-em-todas.html`)

Com o lançamento publicado e ao menos uma rede assistida, o detalhe do lançamento vira a tela **Publicar em todas** (`src/screens/LaunchHub/PublishAll.tsx`, tokens em `aqua-look.ts`, que espelham `aqua-design-core/src/brand/tokens.ts`):

- fundo de céu (modo claro) e cartões de vidro (`GlassSurface`: Liquid Glass nativo no iOS 26+, translúcido com desfoque no resto);
- **Seu post**: autor, texto, imagem, link, contagem ("1 imagem · 1 link", "92 / 280 no X") e o aviso de que no X e no Threads o link de postar leva só texto e link, e o Instagram vai pelo compartilhar do celular;
- **Automático**: Aqua/Bluesky com o status e "Tentar de novo" se falhar;
- **Assistido**: legenda dos 4 estados (Pendente, Aberto, Publicado, Erro) e um cartão por rede no estado certo (aberto com borda azul, publicado esmaecido com "Marcado como publicado", erro com borda laranja e "Tentar de novo");
- **Dock em cápsula** fixa embaixo: "4 de 8 redes · Próxima: Threads", barra de progresso em gradiente, "Pular" e "Abrir próxima".

## Logos das redes

Os ícones das redes são os logos oficiais monocromáticos do **Simple Icons v16.35.0** (CC0), em preto no modo claro e branco no escuro, sobre um bloco neutro (`ProviderBadge` em `src/screens/LaunchHub/components.tsx`). Os caminhos SVG foram copiados para `src/lib/launch-hub/brand-icons.ts`, com atribuição, sem adicionar o pacote como dependência.

- **Com logo:** Bluesky, X, Threads, Facebook, Pinterest, Tumblr, Mastodon, Reddit, WhatsApp, Telegram, Wattpad, BandLab, Instagram, TikTok, YouTube, SoundCloud.
- **Sem logo, fica o monograma:** LinkedIn (não existe no Simple Icons 16.35.0 nem no `develop`: foi retirado a pedido da marca) e Website (não é uma marca).
- **Aqua:** mantém a própria marca (`AquaLogo`, azul).

**Cuidados com as marcas:**
- CC0 vale para os arquivos SVG, não para as marcas. Cada logo continua sendo marca registrada da empresa dona e aparece aqui só para identificar a rede (uso nominativo), sem sugerir parceria ou endosso.
- Não alterar a forma, não recortar, não animar e não combinar com outros elementos. Preto/branco monocromático é aceito pela maioria das diretrizes (X, Meta, YouTube, Pinterest, Reddit), mas algumas preferem a cor oficial em certos usos. As diretrizes de cada marca estão no campo `guidelines` de `brand-icons.ts`.
- Antes do lançamento público, revisar as diretrizes de Meta (Instagram, Threads, Facebook, WhatsApp), X, YouTube e TikTok, porque elas mudam com frequência.
- Se alguma marca pedir a retirada, basta apagar a entrada em `brand-icons.ts`: o cartão volta ao monograma sozinho.

## Redes e URLs (conferidas em 11/10/2026)

| Rede | Modo hoje | URL | Verificação |
|---|---|---|---|
| Aqua / Bluesky | auto | publicação real (AT Protocol) | — |
| X | assistido (vira auto com a API) | `https://x.com/intent/post?text=&url=` | oficial (Web Intents do X) |
| Threads | assistido | `https://www.threads.com/intent/post?text=&url=&tag=` | oficial (Meta, Threads Web Intents) |
| LinkedIn | assistido | `https://www.linkedin.com/sharing/share-offsite/?url=` (só `url`; texto vai copiado) | oficial (Microsoft Learn, Share Plugin) |
| Facebook | assistido | `https://www.facebook.com/sharer/sharer.php?u=` (texto copiado) | prática: funciona sem app_id, mas a doc oficial só descreve o Share Dialog (`/dialog/share?app_id=`) |
| Reddit | assistido (sempre) | `https://www.reddit.com/submit?url=&title=&type=LINK` | prática: sem doc oficial da página de envio; houve relatos de campos não preenchidos |
| Pinterest | assistido | `https://www.pinterest.com/pin/create/button/?url=&media=&description=` | oficial (Pinterest Save button); precisa de imagem pública |
| Tumblr | assistido | `https://www.tumblr.com/widgets/share/tool?posttype=&canonicalUrl=&content=&title=&caption=&tags=` | oficial (Tumblr Share Button) |
| Mastodon | assistido | `https://<servidor>/share?text=` (servidor informado pela pessoa) | prática: usado há anos, sem documentação oficial |
| WhatsApp | assistido (sempre) | `https://wa.me/?text=` | oficial (FAQ Click to Chat) |
| Telegram | assistido (sempre) | `https://t.me/share/url?url=&text=` (`url` obrigatório) | oficial (Telegram Share Button) |
| Wattpad | assistido (copiar + abrir) | `https://www.wattpad.com/myworks/new` | prática (página do editor) |
| BandLab | assistido (copiar + abrir) | `https://www.bandlab.com/` | não verificado (não há URL de "novo post") |
| Instagram | assistido (legenda copiada + mídia pelo compartilhar do celular) | `https://www.instagram.com/` | não verificado (não existe URL de postar) |
| TikTok | assistido (copiar + abrir) | `https://www.tiktok.com/upload` | não verificado |
| YouTube | assistido (copiar + abrir) | `https://www.youtube.com/upload` | não verificado |
| SoundCloud | assistido (copiar + abrir) | `https://soundcloud.com/upload` | não verificado |
| Site do criador | auto quando a API existir | — | — |

Testes: `__tests__/lib/launch-hub-assist.test.ts`.
