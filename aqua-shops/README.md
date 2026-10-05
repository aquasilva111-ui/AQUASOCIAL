# AQUA Shops (storefront web)

Storefront do marketplace do AQUA, em Nuxt 4. Parte do plano em
[`docs/aqua-shops.md`](../docs/aqua-shops.md).

Baseado no [NuxtCommerce](https://github.com/zackha/nuxtcommerce) (MIT, © 2025 Sefa Bulak;
veja `LICENSE`). Mantivemos a UX/UI (grade estilo Pinterest, rolagem infinita, modo escuro,
carrinho e favoritos) e trocamos toda a camada de dados do WooCommerce pelo contrato da
Aqua Shops.

## Rodar

```bash
cd aqua-shops
pnpm install
pnpm dev
```

Sem configuração, usa um **catálogo de demonstração** (produtos e vendedores fictícios,
checkout que não cobra nada).

## Ligar à API da Aqua Shops

Defina `AQUA_SHOPS_API` (veja `.env.example`). O storefront espera:

| Método e rota | Resposta |
| --- | --- |
| `GET /products?cursor&search&category&seller&sort&limit` | `ProductsPage` |
| `GET /products/:id` | `Product` |
| `GET /categories` | `Category[]` |
| `POST /orders` (`CheckoutInput`) | `Order` |

Os tipos estão em `shared/types/index.ts`. Dinheiro em centavos inteiros (BRL). O servidor
do storefront nunca confia em preço vindo do navegador.

## Estado

- Feito: vitrine, busca, categorias, produto, carrinho, favoritos, checkout de demonstração,
  pt-BR e en, identidade AQUA.
- Falta: login com perfil AQUA, pagamento real (Pix), painel do vendedor, produto marcado em
  posts/Drops, loja no perfil. Ver fases no doc.
