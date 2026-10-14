# AQUA Social

**AQUA é um sistema operacional social.**

Não é só mais um feed. É feed + ferramentas criativas de primeira classe, construído sobre o AT Protocol, com identidade visual e regras próprias.

O código começou como um fork do [Bluesky social-app](https://github.com/bluesky-social/social-app) (MIT). A partir daí virou outra coisa: um lugar onde você cria junto (Docs, música, vídeo, design, planilhas) e publica no mesmo perfil.

## O que tem aqui

- **App principal** — React Native + Expo (Web, iOS, Android)
- **Módulos AQUA**:
  - `aqua-docs/` — editor de documentos em blocos (BlockNote + Yjs, colaboração em tempo real)
  - `aqua-hub/` — Creative Hub (design, apresentação, gráficos, música com Melody Lab, mixagem, áudio, vídeo, planilha)
  - `aqua-runtime/` — runtime compartilhado das ferramentas (colaboração, persistência, adapters)
  - `aqua-design-core/`, `aqua-render/`, `aqua-sheets/`, etc.
- **Backend** — referências e guia para PDS próprio (`docs/BACKEND-COMPLETO.md`)

## Rodando local (rápido)

```bash
# App principal
yarn install
yarn web
```

Para os módulos criativos:

```bash
cd aqua-docs && npm install && npm run dev     # porta 5174
cd aqua-hub  && npm install && npm run dev     # porta 5192
```

Mais detalhes: [`docs/CONTRIBUINDO.md`](docs/CONTRIBUINDO.md).

## Identidade

- Paleta Nazar: azul `#002bef` / `#0D2BDB`, iris `#7EC8F5`
- Interface em português brasileiro
- Ferramentas criativas são de primeira classe (não “add-ons”)

## Documentação útil

| Assunto | Arquivo |
|---------|---------|
| Como contribuir | [`docs/CONTRIBUINDO.md`](docs/CONTRIBUINDO.md) |
| Backend próprio (PDS) | [`docs/BACKEND-COMPLETO.md`](docs/BACKEND-COMPLETO.md) |
| Colaboração no Hub | [`docs/COLABORACAO-HUB.md`](docs/COLABORACAO-HUB.md) |
| Deploy na Vercel | [`docs/DEPLOY-VERCEL.md`](docs/DEPLOY-VERCEL.md) |
| Moderação e regras | [`docs/MODERACAO.md`](docs/MODERACAO.md) |

## Licença

MIT — veja [LICENSE](./LICENSE).

O código original do Bluesky é usado sob MIT. Este fork tem branding próprio e remove analytics/suporte do original.
