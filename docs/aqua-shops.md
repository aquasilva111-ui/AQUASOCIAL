# AQUA Shops (marketplace integrado à rede)

Marketplace estilo Mercado Livre/Amazon, ligado ao grafo social do AQUA.
Estado: **fase 0 feita** (decisão e contrato) e **storefront web** em `aqua-shops/` rodando com
catálogo de demonstração. **Backend em desenvolvimento local**: Mercur + API da Aqua Shops
(`aqua-shops-backend/`) servindo catálogo, busca, categorias e filtro por vendedor reais para a
vitrine. Pedidos e pagamento ainda não.

## Decisão

Começar com **Mercur** (`mercurjs/mercur`, MIT, sobre Medusa) como motor de catálogo,
pedidos e vendedores, **sempre atrás da API própria da Aqua Shops**. O app nunca fala
direto com o Mercur. Quando um módulo virar gargalo, ele é reescrito como serviço
próprio sem mudar o app.

Licenças conferidas nos repositórios: Mercur é MIT; Medusa é MIT, **exceto** os
materiais do `ENTERPRISE-LICENSE.md`, que não podem ser usados. Evitar qualquer
pacote marcado como Enterprise.

Descartados como núcleo: Bagisto, Aimeos, Sylius (monolitos PHP), Spree (segunda stack,
Ruby). Spree e Bagisto ficam como referência de regras de negócio e de UX.

## Arquitetura

```
App AQUA (RN/web) ──► API Aqua Shops (própria) ──► Mercur/Medusa (Postgres)
        │                    │                         │
        │                    ├─► Busca (Typesense)      └─► PSP (split de pagamento)
        │                    └─► Fila de eventos
        └─► PDS do vendedor (post/Drop com produto marcado)
```

- **Identidade**: vendedor e comprador são perfis AQUA (DID). A loja é um registro do
  vendedor, não uma conta separada, como em Books.
- **Fonte da verdade**: pedidos, estoque e livro-caixa ficam no backend da Aqua Shops,
  nunca no PDS. O PDS guarda só o que é público: a vitrine e o produto marcado em posts.
- **Integração social**: post ou Drop com cartão de produto, loja ligada ao perfil,
  avaliações como respostas a um post, recomendações a partir do grafo.

## Módulos e como cada um escala

| Módulo | Hoje | Quando virar gargalo |
| --- | --- | --- |
| Catálogo e vendedores | Mercur | Serviço próprio + cache/CDN |
| Busca e descoberta | Typesense | Cluster; ranking com sinais sociais |
| Pedidos e estoque | Mercur | **Reescrever primeiro**: serviço próprio, eventos |
| Pagamentos e repasse | PSP com split | Livro-caixa próprio sobre o PSP |
| Mídia | Blobs no PDS/CDN | CDN dedicada |
| Entrega | Frete via API de transportadora | Logística própria (`ever-demand` como referência) |

## Brasil

Medusa/Mercur trazem Stripe por padrão. Para Pix e boleto é preciso um provedor de
pagamento com split (Mercado Pago, Pagar.me ou Stripe Brasil). O AQUA nunca guarda dado
de cartão nem saldo de vendedor: quem custodia é o PSP. Valores sempre em **centavos
inteiros** (BRL), sem ponto flutuante.

## Fases

1. Contrato: tipos e regras puras em `src/lib/shops/model.ts` (feito, com testes).
2. Backend: **feito para leitura.** Postgres + Redis em Docker, Mercur rodando com dados de
   exemplo em BRL, e a API `aqua-shops-backend/api/` (Hono, 16 testes) traduzindo ofertas do
   Mercur para o contrato. Falta `POST /orders` (passo 7). Detalhes e decisões em
   `aqua-shops-backend/README.md`.
3. Telas: vitrine, produto, carrinho, checkout, painel do vendedor (web e app).
   Feito na web: pacote `aqua-shops/` (Nuxt 4, baseado no NuxtCommerce, MIT) com a UX de
   grade estilo Pinterest, busca, categorias, filtro por vendedor, carrinho, favoritos e
   checkout de demonstração, em pt-BR e en. Ele fala só com o contrato de
   `aqua-shops/shared/types` e troca para a API real definindo `AQUA_SHOPS_API`.
   Falta: painel do vendedor e abrir dentro do app (tela web embutida, como o Studio).
4. Social: produto marcado em post e Drop, loja no perfil, avaliações.
5. Busca e recomendações; depois pagamento real (Pix) e frete.
6. Substituir módulos pelo código próprio conforme os gargalos aparecerem.

## Riscos abertos

- Mercur é jovem (1,8k estrelas); escala em produção não foi comprovada. Medir cedo.
- Pagamentos, impostos (NF-e) e regras de consumidor brasileiras exigem validação
  jurídica antes de abrir a vendedores reais.
- Moderação de anúncios (itens proibidos) precisa existir antes do lançamento; reaproveitar
  o Ozone do AQUA.
