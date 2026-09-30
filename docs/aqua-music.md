# AQUA Música

Quem usa o AQUA (web) conecta o próprio serviço de música e ouve enquanto navega.
A música toca no player oficial do serviço e aparece no mini player flutuante
(arrastável, minimiza para o círculo preto). O AQUA nunca vê a senha; só guarda
os tokens de sessão do serviço neste dispositivo.

Tela: `/music` (item "Música" no menu lateral).

## Serviços

| Serviço | Toca no AQUA? | Requisitos |
| --- | --- | --- |
| Spotify | Sim, música completa | Conta Premium de quem ouve (Web Playback SDK) |
| Apple Music | Sim, música completa | Assinatura Apple Music de quem ouve (MusicKit JS) |
| Deezer | Não | O SDK antigo foi descontinuado e novos apps não são aceitos; só há prévias de 30s |
| YouTube Music | Não | Não tem API oficial; o YouTube só permite o player embutido com vídeo visível |

## Configuração (variáveis de build)

Sem elas, o serviço aparece como "Ainda não configurado neste app".

### Spotify — `EXPO_PUBLIC_SPOTIFY_CLIENT_ID`
1. Crie um app em https://developer.spotify.com/dashboard.
2. Em Redirect URIs, cadastre `https://SEU-DOMINIO/music`
   (local: `http://127.0.0.1:19006/music`; o Spotify não aceita `localhost`).
3. Marque "Web Playback SDK" e copie o Client ID.
4. Enquanto o app estiver em modo de desenvolvimento, só usuários adicionados
   em "User Management" conseguem entrar; peça a extensão de cota ao Spotify
   para abrir ao público.

Login usa OAuth com PKCE: não há client secret no app.

### Apple Music — `EXPO_PUBLIC_APPLE_MUSIC_DEVELOPER_TOKEN`
1. Conta Apple Developer: crie uma MusicKit key e anote Team ID e Key ID.
2. Gere um JWT (ES256) com a chave privada, `iss` = Team ID, `kid` = Key ID,
   validade de até 6 meses, e coloque em `EXPO_PUBLIC_APPLE_MUSIC_DEVELOPER_TOKEN`.
3. Restrinja o token ao seu domínio (claim `origin`).
4. Renove o token antes de vencer.

## Onde está o código
- `src/lib/music/` — adaptadores (`spotify.ts`, `apple.ts`), PKCE, tipos.
- `src/state/music.ts` — o que está tocando; liga ao mini player.
- `src/screens/Music/` — conexão e busca.
- `src/components/view-watch/MiniPlayer.web.tsx` — mini player (vídeo e música).
