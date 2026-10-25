# AQUA Shops backend

Motor do marketplace (Mercur, MIT, sobre Medusa) e a API da Aqua Shops que fica na frente
dele. Plano em `../docs/aqua-shops.md`.

```
vitrine (aqua-shops, :5194) ─► API Aqua Shops (api/, :9100) ─► Mercur (mercur/, :9000) ─► Postgres + Redis
                                      └─► provedor de pagamento DE CADA LOJA (webhook por loja)
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

## Pedidos e pagamento (conector por loja)

A Aqua **não toca no dinheiro**: cada loja conecta o PRÓPRIO provedor de pagamento e o comprador
paga direto a ele. Sem conta-mãe, sem split, sem comissão descontada da venda, sem custódia e sem
estorno feito pela Aqua (o lojista estorna no provedor dele; a API só reflete o estado). Qualquer taxa
da Aqua é cobrada do lojista à parte. Modelo completo em `../docs/aqua-shops.md`.

Fluxo: `POST /orders` monta o carrinho no Mercur (itens por oferta e o frete mais barato do
vendedor), cobra o total exato no provedor da loja com a credencial dela e devolve o QR Code Pix.
Quando o webhook da loja confirma o pagamento, o mesmo carrinho é finalizado no Mercur (pedido do
vendedor, estoque reservado). Se o Mercur não conseguir finalizar, o pedido continua `paid` com o
motivo em `failure`, para o lojista resolver no provedor dele.

- **Um conector por loja** (`src/payments.ts`): a interface `PaymentProvider` é só o "driver" do
  provedor (conectar por OAuth/chave, criar cobrança, ler status, validar e traduzir webhook). Toda
  chamada recebe a credencial da loja; não existe provedor global. Drivers hoje: `asaas` (conta Asaas
  do lojista, sem split; ainda sem validação em sandbox) e `fake` (só desenvolvimento). Não há
  conectores reais completos ainda: é a fase 2.
- **Conexões** (`src/connections.ts`): a credencial e o segredo de webhook de cada loja ficam
  cifrados (AES-256-GCM, amarrados a loja+provedor) em `aqua.shop_payment_connections`. Ainda não
  há rota HTTP para o lojista conectar (fase 2); por ora a conexão é criada pelo serviço
  `connections.connect(...)`.
- **Webhooks por loja**: `POST /webhooks/<provedor>/<shopId>`, validado com o segredo daquela loja
  e idempotente pelo id do evento (`provedor:loja:evento`). O webhook de uma loja só mexe nos pedidos
  dela. A rota antiga `POST /webhooks/<provedor>` foi removida. Eventos: pago, vencido/cancelado e
  estornado (`refunded`, só refletido).
- **Estados do pedido**: `awaiting_payment`, `paid`, `shipped`, `delivered`, `cancelled`, `refunded`.
- **Uma loja por compra, por enquanto.** `POST /orders` recusa (422) carrinho com itens de mais de uma
  loja; uma cobrança por loja é a fase 3. Loja sem provedor conectado também é recusada (422). O id da
  loja é o id do vendedor no Mercur até o DID do perfil ser ligado.
- Variáveis (`ASAAS_BASE_URL` é opcional, sandbox por padrão):
  - `DATABASE_URL`: Postgres dos pedidos e das conexões.
  - `CONNECTION_ENCRYPTION_KEY`: 32 bytes em hex ou base64 (`openssl rand -hex 32`). **Quem perder
    esta chave perde as credenciais das lojas**; guarde fora do servidor.
  - `PUBLIC_API_URL`: endereço público da API, para montar o webhook de cada loja.
  - `ENABLE_FAKE_PAYMENTS=true`: registra o driver `fake` (não cobra nada).
  - `PAYMENT_PROVIDER`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `COMMISSION_BPS` e
    `MIN_COMMISSION_CENTS` **não existem mais**: credencial e segredo de webhook são por loja.
  Sem `DATABASE_URL`, `CONNECTION_ENCRYPTION_KEY` e `PUBLIC_API_URL` a API serve só o catálogo e
  `/orders` responde 503.
- Pedidos ficam no esquema `aqua` do Postgres (`orders`, `webhook_events`,
  `shop_payment_connections`). A migração apaga `seller_wallets` (recebedores do split antigo, que
  nunca rodou com vendedor real) e renomeia os estados antigos (`pending_payment` vira
  `awaiting_payment`, `expired` vira `cancelled`, `failed` vira `paid`).
- O Mercur precisa ter frete para o Brasil. `seed-brl.ts` acrescenta `br` às zonas de entrega de
  exemplo; vendedores reais cadastram as suas no painel.
- Testes: `npm test` (65 passando; os 5 de Postgres real rodam com `TEST_DATABASE_URL`).

## O que falta

- Fase 2: rota para o lojista conectar o provedor (OAuth ou chave), cadastro automático do webhook
  na conta dele e teste contra o sandbox (Asaas e/ou Mercado Pago).
- Fase 3: carrinho com várias lojas (uma cobrança por loja), painel do lojista (envio, entrega).
- Decisão pendente: manter ou não Mercur/Medusa (ver `../docs/aqua-shops.md`).
- Escolha de variante (tamanho): hoje o pedido compra a oferta mais barata do anúncio.
- Mostrar o frete antes de gerar o Pix (hoje ele aparece junto do QR Code).
- CPF do comprador fica no banco: política de privacidade (LGPD) antes de abrir ao público.
- Catálogo em memória (cache de 30 s). Quando virar gargalo, índice de busca próprio.
