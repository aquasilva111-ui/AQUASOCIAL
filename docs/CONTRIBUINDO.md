# Contribuindo no AQUA

Guia rápido para rodar local e mexer nos módulos `aqua-*`.

## Pré-requisitos

- Node.js ≥ 20
- Yarn (app principal) ou npm (módulos `aqua-*`)
- Git

## App principal

```bash
yarn install
yarn web          # abre no navegador
# ou
yarn ios / yarn android   # com Expo
```

## Módulos criativos

Cada um tem seu próprio `package.json` e README.

### Docs

```bash
cd aqua-docs
npm install
npm run dev        # http://localhost:5174
```

### Hub

```bash
cd aqua-hub
npm install
npm run dev        # http://localhost:5192
```

Colaboração: abra com `?room=nome`.

### Runtime

```bash
cd aqua-runtime
npm install
npm run typecheck
npm test
```

## Estrutura dos módulos

- `aqua-docs/` — editor BlockNote + Yjs
- `aqua-hub/` — UI das ferramentas criativas
- `aqua-runtime/` — adapters, transporte de colaboração, helpers de publish
- `aqua-design-core/` — motor de design (Fabric)
- `aqua-render/` — render de vídeo (ffmpeg)

## Testes

O Melody Lab já tem testes no `aqua-runtime`.  
Para rodar:

```bash
cd aqua-runtime && npm test
```

Novos testes são bem-vindos, especialmente nos adapters de música, áudio e vídeo.

## Localização

O app usa Lingui. O idioma principal é **português brasileiro**.  
Prefira termos naturais (não tradução literal de inglês).  
Veja `docs/localization.md` para o fluxo de tradução.

## Fluxo de contribuição

1. Crie uma branch a partir de `1.111.0-ota-5` (ou a branch ativa).
2. Faça as mudanças.
3. Teste localmente.
4. Abra um Pull Request descrevendo o que mudou e por quê.

## Dúvidas

Abra uma issue ou comente no PR. O objetivo é deixar o AQUA mais claro e útil para quem cria.
