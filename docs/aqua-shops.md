# AQUA Shops

Lojas dentro da rede social AQUA (AT Protocol). Qualquer perfil pode ter uma loja, como no
Shopify, e vender no feed, no perfil e nos Drops. **A Aqua só fornece a infraestrutura**: o
dinheiro vai direto do comprador para o provedor que cada lojista conectou, e a Aqua nunca o toca.

Estado: **fase 0 (contrato) feita**. Existe a vitrine web em `aqua-shops/` (Nuxt, catálogo de
demonstração ou API real) e o backend em `aqua-shops-backend/` (catálogo via Mercur, pedidos e o
conector de pagamento por loja). Conectores reais, loja no perfil e checkout por loja são as
fases seguintes.

## Princípios (inegociáveis)

1. **A Aqua nunca toca no dinheiro.** Sem conta-mãe, sem split, sem comissão descontada da venda,
   sem custódia, sem repasse e sem estorno feito pela Aqua.
2. **O lojista traz o próprio provedor** (Mercado Pago, Asaas, Stripe, Pix...), com as credenciais
   dele (OAuth sempre que der). Uma cobrança por loja.
3. **Estorno e atendimento são do lojista.** A Aqua mostra o estado (`refunded` vem do provedor) e
   dá ferramentas, mas não decide nem executa.
4. **Taxa da Aqua é cobrada do lojista à parte** (assinatura ou fatura de uso), fora do fluxo da
   venda. Nunca descontada do pagamento.
5. **Identidade é o DID.** Loja, vendedor e comprador são perfis AQUA. Dados públicos ficam no
   repo do vendedor; dados privados (pedidos, endereços, credenciais) no backend.
6. **Começar social.** Produto marcado em post e Drop, loja no perfil e avaliações vêm antes de
   e-commerce pesado.

## Arquitetura

```
App AQUA (feed, perfil, Drops) ─► Vitrine / carrinho ─► API Aqua Shops ─► Provedor DO LOJISTA
        │                                                  │  catálogo,         ▲
        │                                                  │  pedidos,          │ webhook por loja
        ▼                                                  │  conectores        │
Repo do vendedor (PDS)  ──firehose──► Indexador            └────────────────────┘
place.aqua.shop.*                     (lojas, produtos, avaliações)

Comprador ──paga──► provedor do lojista        (a Aqua não está no caminho do dinheiro)
```

| Peça | Como funciona |
| --- | --- |
| Record da loja | `place.aqua.shop.shop/self` no repo do vendedor: nome, descrição, status, políticas. |
| Catálogo | Records `place.aqua.shop.product` (produto, variantes, preço em centavos, mídia). Preço do record é vitrine; preço de checkout e estoque são validados no backend. |
| Conectores de provedor | Interface `PaymentProvider` (`aqua-shops-backend/api/src/payments.ts`): conectar (OAuth/chave), criar cobrança, ler status, validar webhook. A credencial é de uma loja e fica cifrada. |
| Checkout multi-loja | Carrinho separado por loja: um pagamento por loja, cada um no provedor dela. Não existe cobrança única da plataforma. |
| Webhooks por loja | `POST /webhooks/<provedor>/<shopId>`, validado com o segredo daquela loja, idempotente pelo id do evento. |
| Pedidos | Um pedido por loja, privado (backend). Estados: `awaiting_payment`, `paid`, `shipped`, `delivered`, `cancelled`, `refunded` (este só refletido do provedor). |
| Social | `ProductRef` em post/Drop vira card de produto; aba Loja no perfil; avaliações `place.aqua.shop.review` só de quem comprou. |
| Taxa da Aqua | Cobrança separada ao lojista, fora do fluxo de venda. Ainda não implementada. |

## Contrato (fase 0)

### Records públicos (repo do AT Protocol)

Tipos e validações em `src/lib/shops/model.ts`, testes em `__tests__/lib/shops.test.ts`.

| Collection | Onde | Conteúdo |
| --- | --- | --- |
| `place.aqua.shop.shop` | repo do vendedor, rkey `self` | `name`, `description?`, `status` (`active`/`paused`), `policies?` (envio, trocas, privacidade), `createdAt` |
| `place.aqua.shop.product` | repo do vendedor | `name`, `description?`, `status`, `condition`, `categoryId?`, `media[]` (blobs), `variants[]` (`id`, `name`, `sku?`, `price`, `compareAt?`), `createdAt` |
| `place.aqua.shop.review` | repo do **comprador** | `subject` (AT-URI do produto), `rating` 1 a 5, `text?`, `createdAt` |

Dinheiro é sempre `{amount: centavos inteiros, currency: 'BRL'}`. Estoque **não** vai para o
record. A avaliação só é aceita pelo indexador se o backend tiver um pedido **entregue** daquele
comprador com aquele produto (`canReview`).

### Pedido (privado, no backend)

Um pedido por loja (`ShopOrder`), com linhas, frete, total, provedor e id da cobrança. Quem pode
mover cada estado (`canTransition(from, to, actor)`):

| Para | Quem | Observação |
| --- | --- | --- |
| `paid` | provedor | confirmação por webhook |
| `shipped`, `delivered` | lojista | |
| `cancelled` | provedor ou lojista | cobrança vencida/cancelada, ou lojista cancela |
| `refunded` | **só provedor** | o lojista estorna no provedor dele; a Aqua apenas reflete |

O mesmo vocabulário vale para o contrato da vitrine (`aqua-shops/shared/types`) e para o backend.

### Conector de pagamento por loja

```ts
interface PaymentProvider {
  name: string;
  connectionKinds: Array<'api_key' | 'oauth'>;
  authorizationUrl?(redirectUri, state): string;
  connect(input, { webhookUrl, webhookSecret }): Promise<{ accountId?, credential }>;
  createCharge(credential, input): Promise<Charge>;   // com a credencial DA LOJA
  getChargeStatus(credential, paymentId): Promise<ChargeStatus>;
  verifyWebhook(webhookSecret, header, rawBody): boolean;  // segredo DA LOJA
  parseWebhook(body): PaymentEvent | null;            // paid | expired | cancelled | refunded
}
```

Não há `refund`, nem split, nem provedor global. O driver não guarda estado: o backend abre a
conexão da loja e passa a credencial a cada chamada.

### Esquema `aqua.shop_payment_connections`

| Coluna | |
| --- | --- |
| `shop_id`, `provider` | chave primária (uma loja pode ter mais de um provedor) |
| `account_id` | conta da loja no provedor |
| `credential_enc` | credencial em JSON, cifrada (AES-256-GCM) |
| `webhook_secret_enc` | segredo de webhook **desta loja**, cifrado |

A cifra é amarrada a `shop_id|provider` (AAD): copiar o texto cifrado de uma loja para outra não
abre. O texto cifrado carrega o id da chave (`v1.<kid>.<iv>.<tag>.<dados>`). A chave vem de
`CONNECTION_ENCRYPTION_KEY` (32 bytes); na troca, a antiga fica em `CONNECTION_ENCRYPTION_KEY_OLD`
só para leitura e `npm run rotate-keys` recifra tudo. Backup e rotação estão no README do backend.
Substitui `aqua.seller_wallets`, que era o recebedor de split de cada vendedor.

### Webhooks

`POST /webhooks/<provedor>/<shopId>`. A API busca a conexão da loja, valida com o segredo daquela
loja e só então processa. **O webhook não prova o pagamento:** antes de marcar um pedido como `paid`,
a API consulta o provedor da loja (`getChargeStatus`) e exige status pago e, se o provedor informar,
o mesmo valor do pedido. Um evento só afeta pedidos da própria loja e do provedor que cobrou. O
id do evento (`provedor:loja:evento`) torna a entrega repetida inofensiva.

## Fluxo de compra

1. O comprador monta o carrinho (pode ter itens de várias lojas; a vitrine agrupa por loja).
2. O backend valida preço, estoque e frete por loja, sem confiar no navegador.
3. Uma cobrança por loja, criada no provedor dela com a credencial dela.
4. O comprador paga cada loja; o dinheiro cai direto na conta do lojista.
5. O webhook da loja confirma: o pedido daquela loja vira `paid` e o estoque é baixado.
6. O lojista envia e, se for o caso, estorna no provedor ou pelo conector. A Aqua só reflete.

O pedido é gravado **antes** da cobrança: se a gravação falhar nada é cobrado, e se a cobrança
falhar o pedido é cancelado.

**Hoje (fase 0)**, `POST /orders` aceita itens de **uma loja** por compra e cobra na conta dela;
carrinho com várias lojas (uma cobrança em cada) é a fase 3. Se a loja não conectou um provedor,
ela não vende. Se o pedido não puder ser criado no Mercur depois do pagamento, o pedido fica
`paid` com o motivo em `failure` e o lojista resolve (inclusive estornando) no provedor dele; a
Aqua não estorna.

## Decisão pendente: Mercur/Medusa

**Em aberto.** O Mercur (`mercurjs/mercur`, MIT, sobre Medusa) dá catálogo e painel do vendedor, mas é
pesado e o modelo de marketplace com split dele não serve. A alternativa é um catálogo próprio sobre
os records do AT Protocol. Até decidir, o backend continua usando o Mercur para catálogo, frete e
criação do pedido, sempre atrás da API própria da Aqua (o app nunca fala direto com ele). Licenças:
Mercur e Medusa são MIT, **exceto** o `ENTERPRISE-LICENSE.md` do Medusa, que não pode ser usado.

## Reaproveitado do que já existia

| Componente | Destino |
| --- | --- |
| `src/lib/shops/model.ts` | mantido e estendido (produto, avaliação, pedido); `splitPayment` removido |
| `aqua-shops/` (vitrine Nuxt) | adaptar: carrinho por loja, login Aqua, embutir no app |
| `PixPayment.vue` | adaptar: uma tela por loja, recebedor é o lojista |
| `payments.ts` | evoluído para o conector por loja |
| `asaas.ts` | vira conector usando a conta Asaas do lojista, sem split nem estorno |
| `split.ts`, estorno automático, `PAYMENT_PROVIDER` | **removidos** |
| `checkout.ts`, `orders.ts` | adaptados (cobrança na conta da loja; um pedido por loja) |
| `seller_wallets` | substituída por `shop_payment_connections` |
| `DEPLOY.md` | mantido |

## Roteiro por fases

| Fase | Entregas | Estado |
| --- | --- | --- |
| 0. Contrato | Lexicons `shop`, `product`, `review`; tipos de pedido; interface de conector por loja; este doc | **feito** |
| 1. Loja no perfil | Criar loja pelo app (record no DID), cadastrar produtos, aba Loja no perfil, indexador do firehose | |
| 2. Conector 1 | O lojista conecta o primeiro provedor (OAuth ou chave), credencial cifrada, webhook por loja, teste em sandbox, rota de conexão | |
| 3. Checkout por loja | Carrinho agrupado por loja, uma cobrança por loja, pedido por loja, painel do lojista (pedidos, envio) | |
| 4. Social | Produto marcado em post e Drop, card no feed, avaliações de compradores verificados | |
| 5. Mais provedores e cobrança da Aqua | Segundo e terceiro conectores; assinatura do lojista cobrada à parte | |
| 6. Escala | Busca e recomendações, LGPD completa, termos do lojista, abertura ao público | |

## Perguntas em aberto

1. Mantemos Mercur/Medusa ou catálogo próprio sobre os records do AT Protocol?
2. Quais provedores primeiro? Mercado Pago (OAuth, Pix e cartão), Asaas, Stripe, Pix direto ou cripto (BTCPay)?
3. Modelo de taxa da Aqua: assinatura fixa, planos, ou fatura por uso cobrada depois?
4. Carrinho com várias lojas logo de início, ou uma loja por compra no começo?
5. LGPD: quem é controlador dos dados do comprador (Aqua, lojista ou ambos)? Quanto tempo guardar CPF e endereço?
6. Quem pode abrir loja: qualquer perfil, ou com verificação (CPF/CNPJ)?
7. Produtos proibidos e moderação: regras da rede ou próprias das lojas?
8. A vitrine continua em Nuxt (web embutida) ou passa a ser nativa no app React Native?

## Riscos abertos

- Mercur é jovem; escala em produção não foi comprovada. Medir cedo.
- Impostos (NF-e) e regras de consumidor brasileiras exigem validação jurídica antes de abrir a
  lojistas reais. Como a Aqua não toca no dinheiro, o risco de custódia some, mas termos do lojista
  e LGPD continuam necessários.
- Moderação de anúncios (itens proibidos) precisa existir antes do lançamento; reaproveitar o Ozone.
- CPF do comprador fica no backend: política de retenção antes de abrir ao público.
