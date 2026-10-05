# AQUA Shops backend

Motor do marketplace (Mercur, MIT, sobre Medusa) e a API da Aqua Shops que fica na frente
dele. Plano em `../docs/aqua-shops.md`.

```
vitrine (aqua-shops, :5194) ─► API Aqua Shops (api/, :9100) ─► Mercur (mercur/, :9000) ─► Postgres + Redis
```

Para colocar num servidor (VPS com Docker), veja **[DEPLOY.md](DEPLOY.md)**.

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
  são só de desenvolvimento. Em servidor público use `SEED_SELLER_PASSWORD` (o seed já lê essa
  variável) e segredos gerados; veja DEPLOY.md.
- **Produção em container:** o Medusa liga SSL no Postgres quando `NODE_ENV=production`, por isso a
  URL do banco no compose leva `?sslmode=disable` (rede interna). O artefato do Mercur precisa dos
  mesmos `overrides` de versão da raiz e sem `devDependencies` (ver `mercur/Dockerfile`).

## Pedidos e Pix (Asaas)

Fluxo: `POST /orders` monta o carrinho no Mercur (itens por oferta e o frete mais barato de cada
vendedor), cobra o total exato no Asaas com split por vendedor e devolve o QR Code. Quando o
webhook `PAYMENT_RECEIVED`/`CONFIRMED` chega, o mesmo carrinho é finalizado no Mercur: sai um
grupo de pedidos com um pedido por vendedor (aparecem no painel de cada um) e o estoque é
reservado. Se o Mercur não conseguir finalizar depois do pagamento, o Asaas devolve o dinheiro.

- **Provedores de pagamento são plugáveis** (`src/payments.ts`): a API só conhece a interface
  `PaymentProvider` (criar cobrança com split, estornar, validar e traduzir webhook). Hoje existem
  `asaas` e `fake` (desenvolvimento, não cobra nada); Woovi, Mercado Pago ou cripto entram como
  novos adaptadores, sem mexer em pedidos nem no Mercur. Escolha com `PAYMENT_PROVIDER`.
- Variáveis em `api/.env.example`: `PAYMENT_PROVIDER`, `ASAAS_API_KEY`, `ASAAS_BASE_URL` (sandbox
  por padrão), `ASAAS_WEBHOOK_TOKEN`, `DATABASE_URL`, `COMMISSION_BPS`, `MIN_COMMISSION_CENTS`.
  Sem provedor configurado a API serve só o catálogo e `/orders` responde 503.
- Cada provedor recebe seus webhooks em `POST /webhooks/<nome>`. No Asaas, cadastre
  `https://SUA_API/webhooks/asaas` com o mesmo `authToken` do `ASAAS_WEBHOOK_TOKEN`. A entrega é
  "pelo menos uma vez"; a API ignora repetições (o id do evento é guardado com o nome do provedor).
- Pedidos ficam no esquema `aqua` do Postgres (`orders`, `webhook_events`, `seller_wallets`).
  `seller_wallets` guarda o recebedor de cada vendedor por provedor (carteira Asaas, subconta
  Woovi...). Vendedor sem recebedor no provedor ativo não vende: a compra é recusada.
- O Mercur precisa ter frete para o Brasil. `seed-brl.ts` acrescenta `br` às zonas de entrega de
  exemplo; vendedores reais cadastram as suas no painel.
- Testado com um Asaas de mentira local e o Mercur real. **Falta rodar contra o sandbox do
  Asaas** (precisa da chave) e confirmar os campos exatos da API deles.

## O que falta

- Rodar contra o sandbox do Asaas; script para criar as subcontas dos vendedores (a conta-mãe
  precisa ser CNPJ para criar subcontas).
- Escolha de variante (tamanho): hoje o pedido compra a oferta mais barata do anúncio.
- Mostrar o frete antes de gerar o Pix (hoje ele aparece junto do QR Code).
- CPF do comprador fica no banco: política de privacidade (LGPD) antes de abrir ao público.
- Pagamento sem CNPJ (cripto), ver `docs/aqua-shops.md`.
- Catálogo em memória (cache de 30 s). Quando virar gargalo, índice de busca próprio.
