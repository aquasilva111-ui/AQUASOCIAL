# AQUA Social

Rede social modular e descentralizada construída sobre o **AT Protocol**, usando o código do Bluesky social-app (licença MIT) como ponto de partida.

AQUA é um sistema operacional social: feed + ferramentas criativas de primeira classe (Docs estilo Notion, Hub com design, música, vídeo, planilhas, etc.).

## O que está neste repositório

- App principal (React Native + Expo → Web, iOS, Android) baseado no social-app do Bluesky, com rebrand para AQUA.
- Módulos AQUA:
  - `aqua-docs/` — editor de documentos em blocos (BlockNote + Yjs)
  - `aqua-hub/` — Creative Hub (design, apresentação, gráficos, música com Melody Lab, mixagem, áudio, vídeo, planilha)
  - `aqua-runtime/`, `aqua-design-core/`, `aqua-render/`, etc.

## Stack

- **App**: React Native + Expo (TypeScript)
- **Protocolo**: AT Protocol (identidades e dados portáteis)
- **Ferramentas criativas**: BlockNote, Yjs, Fabric, ECharts, Univer, etc.
- Pacotes: Yarn / npm · Node ≥ 20

## Rodando local

```bash
# App principal
yarn install
yarn web
```

Veja também os READMEs de `aqua-docs/` e `aqua-hub/` para os módulos criativos.

## Status do rebrand

Este repositório ainda está em processo de limpeza das referências ao Bluesky (scheme, bundle IDs, domínios, analytics, etc.). O objetivo é deixar a identidade AQUA clara para usuários e desenvolvedores.

## Licença

MIT — veja [LICENSE](./LICENSE).

O código original do Bluesky Social App é usado sob a licença MIT. Este fork segue as diretrizes de forking do projeto original: branding diferenciado e remoção de sistemas de analytics/suporte do original.
