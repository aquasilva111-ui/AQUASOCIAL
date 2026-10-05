# AQUA Shops backend

Motor do marketplace (Mercur, MIT, sobre Medusa) e a API da Aqua Shops que fica na frente
dele. Plano em `../docs/aqua-shops.md`.

```
vitrine (aqua-shops, :5194) ─► API Aqua Shops (api/, :9100) ─► Mercur (mercur/, :9000) ─► Postgres + Redis
```

## Subir tudo (desenvolvimento)

1. `docker compose up -d` (Postgres 16 e Redis 7, só em localhost). Precisa do Docker Desktop aberto.
2. Mercur: entrada `aqua-shops-backend` do `.claude/launch.json` (ou, em `mercur/packages/api`,
   `npx medusa develop`). Painéis: `http://localhost:9000/dashboard` (admin) e `/seller` (vendedor).
3. API: entrada `aqua-shops-api` (ou, em `api/`, `npm start`). Precisa de `api/.env`
   (modelo em `api/.env.example`; a chave publicável sai de
   `select token from api_key where type='publishable'`).
4. Vitrine ligada à API: entrada `aqua-shops-live` (`AQUA_SHOPS_API=http://127.0.0.1:9100`).

Primeira vez, em `mercur/packages/api`: `npx medusa db:migrate`, `npm run seed` e
`npx medusa exec ./src/scripts/seed-brl.ts` (região Brasil e preços em BRL; idempotente).

## Decisões que não são óbvias

- **Medusa fixado em 2.20.1.** O template do Mercur vem com 2.21.0, mas `@mercurjs/core` 2.3.5
  só tem o patch de checkout multi-vendedor para Medusa `<2.21`. Sem o patch, o checkout com
  vários vendedores quebra. Ao subir para `@mercurjs/core` com suporte a 2.21+, volte os pins.
- **`react-hook-form` em 7.55.0** (o template pedia 7.49.1, que conflita com `@hookform/resolvers`).
- **Telemetria desligada** (`MERCUR_DISABLE_TELEMETRY=true`, `MEDUSA_DISABLE_TELEMETRY=1`).
- O `create-mercur-app` baixa o template do branch `main`, não de uma versão fixa. Este projeto
  foi gerado em 2026-10-02; versões instaladas ficam no `package.json`.
- **Oferta = vendedor × variante.** O produto é catálogo compartilhado; preço e estoque são da
  oferta. A API junta as ofertas por produto × vendedor num "anúncio" (id `produto~vendedor`),
  com o preço da mais barata e o estoque somado.
- Preço no Medusa é em unidade principal (100 = R$ 100); a API converte para centavos.
- O seed só tem EUR/USD. `seed-brl.ts` cria o BRL (euro × 6, só para desenvolvimento) e deixa
  a loja só com BRL.
- Vendedor do Mercur não tem DID. Até ligar o perfil AQUA (`seller.metadata.did`), a API usa o
  id do vendedor como `seller.did`.
- Credenciais do seed (`seller@mercur.dev` / `supersecret`, secrets `supersecret` no `.env`)
  são só de desenvolvimento. Trocar tudo antes de qualquer ambiente público.

## O que falta

- `POST /orders` na API devolve 501: carrinho/checkout do Mercur e pagamento Pix com split (passo 7).
  A parte de split automático e KYC de vendedor é Enterprise no Mercur; para Pix será preciso um
  provedor de pagamento próprio.
- Catálogo em memória (cache de 30 s). Quando virar gargalo, índice de busca próprio.
