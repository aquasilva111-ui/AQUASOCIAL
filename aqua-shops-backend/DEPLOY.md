# Deploy da Aqua Shops num VPS (Docker)

Sobe a pilha inteira num servidor Linux com Docker: Postgres, Redis, Mercur, API da Aqua
Shops, vitrine e o Caddy (proxy com HTTPS automático via Let's Encrypt).

```
internet ─► Caddy :80/:443 ─┬─ SHOPS_URL ─► vitrine ─► API ─► Mercur ─► Postgres / Redis
                            └─ PANEL_URL ─► Mercur (painel admin em /dashboard, vendedor em /seller)
```

Só as portas 80 e 443 ficam abertas. Postgres, Redis, API e vitrine ficam na rede interna.
Este guia foi testado em containers locais (build, migração, seed e acesso pelo proxy);
**não** foi executado num VPS de verdade.

## Antes de começar

- Um VPS Linux (Ubuntu 22.04+) com **pelo menos 4 GB de RAM**. O build do Mercur é pesado e
  pode falhar com menos. Docker e o plugin Compose instalados (o Hostinger tem modelo de
  VPS "Ubuntu com Docker"; ou `curl -fsSL https://get.docker.com | sh`).
- **Dois nomes no DNS** apontando (registro A) para o IP do VPS, por exemplo
  `shops.aquaapp.online` (vitrine) e `painel.aquaapp.online` (painel). O HTTPS só sai se o DNS
  já estiver propagado. Reserve esses nomes para o site: se `*.aquaapp.online` for usado
  como handle de perfil no PDS, `shops` e `painel` não podem ser handles.
- Firewall liberando 22, 80 e 443.

## 1. Código no servidor

Só as duas pastas necessárias (o repositório é grande):

```bash
git clone --depth 1 --filter=blob:none --sparse --branch 1.111.0-ota-5 \
  https://github.com/aquasilva111-ui/AQUASOCIAL.git
cd AQUASOCIAL
git sparse-checkout set aqua-shops aqua-shops-backend
cd aqua-shops-backend
```

Se o repositório for privado, o `git clone` pedirá um token de acesso do GitHub.

## 2. Configuração

```bash
cp .env.production.example .env.production
nano .env.production
```

Preencha `SHOPS_URL` e `PANEL_URL` (com `https://`) e gere os segredos com
`openssl rand -hex 32` (um diferente para `POSTGRES_PASSWORD`, `JWT_SECRET` e
`COOKIE_SECRET`). Deixe `MERCUR_PUBLISHABLE_KEY` vazio por enquanto. O `.env.production`
não vai para o git; guarde uma cópia dos segredos num lugar seguro.

> `PANEL_URL` é gravado dentro do painel **no build**. Se mudar depois, refaça o build do
> Mercur (`up -d --build mercur`).

## 3. Fase 1: banco e Mercur

```bash
alias dc='docker compose --env-file .env.production -f docker-compose.prod.yml'
dc up -d --build postgres redis mercur      # a primeira vez leva vários minutos
dc logs -f mercur                           # espere "Server is ready on port: 9000"
```

O Mercur aplica as migrações sozinho a cada subida.

**Catálogo de exemplo** (opcional, só para ver a loja funcionando; vendedores e produtos são
fictícios). Defina uma senha aleatória para os vendedores de exemplo, senão o seed usa uma
senha pública:

```bash
SENHA=$(openssl rand -hex 12); echo "senha dos vendedores de exemplo: $SENHA"
dc exec -e SEED_SELLER_PASSWORD="$SENHA" mercur sh -c \
  "npx medusa exec ./src/scripts/seed.js && npx medusa exec ./src/scripts/seed-brl.js"
```

Os vendedores de exemplo são `seller@mercur.dev`, `kickz@mercur.dev` e
`trailhead@mercur.dev`. **Apague-os antes de abrir ao público** (painel admin → vendedores).
Sem o seed, a loja começa vazia e a região/moeda BRL precisa ser criada pelo painel.

**Usuário administrador** (a senha é digitada por você, no servidor):

```bash
dc exec mercur npx medusa user -e seu@email.com -p 'SENHA_FORTE'
```

## 4. Fase 2: API e vitrine

A API precisa da chave publicável da loja, que existe depois da fase 1:

```bash
dc exec -T postgres psql -U aqua -d aqua_shops -Atc \
  "select token from api_key where type='publishable' and deleted_at is null limit 1"
```

Cole o resultado em `MERCUR_PUBLISHABLE_KEY` no `.env.production` e suba o resto:

```bash
dc up -d --build
dc ps                       # tudo "Up" / "healthy"
```

Abra `SHOPS_URL` (vitrine) e `PANEL_URL/dashboard` (admin).

## Atualizar

```bash
git pull
dc up -d --build
```

## Backup

O que importa está no Postgres e nos uploads (volume `uploads`):

```bash
dc exec -T postgres pg_dump -U aqua aqua_shops | gzip > aqua_shops_$(date +%F).sql.gz
```

Guarde o arquivo **fora** do servidor.

## Limitações conhecidas (leia antes de abrir ao público)

- **Pedidos e pagamento ainda não existem.** O checkout da vitrine ao vivo responde erro
  (`POST /orders` da API devolve 501). O site é só vitrine e catálogo por enquanto.
- **Redis não está ligado ao Mercur.** O `medusa-config.ts` do template não configura o módulo
  de Redis (o log avisa "redisUrl not found"), então eventos, locks e fluxos ficam em memória:
  funciona com uma instância só, mas o que estiver em andamento se perde ao reiniciar.
  Configurar os módulos de Redis do Medusa é pendência antes de ter pedidos reais.
- O painel do Mercur (`PANEL_URL`) expõe também a API da loja. Isso é normal, mas faz do painel
  um alvo: use senha forte e mantenha o sistema atualizado.
- O cadastro público de vendedores está ativo (`seller_registration`). Desative em
  `medusa-config.ts` se não quiser.
- Moderação de anúncios, NF-e e regras de consumidor não estão implementadas (ver
  `docs/aqua-shops.md`).
