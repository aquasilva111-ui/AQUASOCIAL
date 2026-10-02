# Drops (Aqua)

Feed vertical infinito de vídeos e fotos do Aqua, baseado em `@rbayuokt/expo-infinite-media`
(players, preload e cache nativos). O app em `example/` é o Drops.

## Identidade
- Paleta em `example/theme.ts`: preto, azul Aqua (`#002BEF` → `#009EFF`, primária `#1185FE`).
- **Likes em laranja** (`color.like`, `#FF7A00`): ícone, burst do toque duplo e contador.
- Textos do feed em pt-BR.

## Rodar
```
npm install && cd example && npm install
npm run ios   # ou android (precisa de build nativo, não roda no Expo Go)
```

## Próximo: integração com a plataforma Aqua
- Trocar `example/data/media.ts` (dados mock) por um feed real do AT Protocol (vídeos/fotos do Aqua Views).
- Ligar curtir/comentar/seguir (`FeedOverlay.tsx`) a `app.bsky.feed.like` e afins.
- Embutir como tela no app principal ou como deep link (`aquadrops://`).
