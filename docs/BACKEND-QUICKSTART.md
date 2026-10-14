# AQUA — Backend próprio (PDS) — Quickstart

Este guia coloca um **PDS próprio** no ar em poucos minutos. Com ele você já tem:

- Contas e dados no seu servidor (não depende do PDS da Bluesky)
- Possibilidade de moderar e aplicar suas regras
- Base para depois colocar AppView / Relay próprios

## O que você precisa

- Um VPS (DigitalOcean, Hetzner, Contabo, etc.) com Ubuntu/Debian
- Domínio (ex: `pds.aqua.social` ou o que preferir)
- Docker + Docker Compose instalados

## Passo 1 — Preparar o servidor

```bash
sudo mkdir -p /pds/caddy/data /pds/caddy/etc/caddy /pds/blocks
sudo chown -R $USER:$USER /pds
```

## Passo 2 — Arquivos de configuração

Copie os arquivos da pasta `deploy/pds/` deste repositório para o servidor:

```bash
# No seu computador ou no servidor
scp -r deploy/pds/* usuario@seu-vps:/pds/
```

No servidor, renomeie e edite o `.env`:

```bash
cd /pds
cp .env.example .env
nano .env
```

**Gere os secrets obrigatórios:**

```bash
# JWT secret
openssl rand --hex 16

# Admin password
openssl rand --hex 16

# PLC rotation key
openssl ecparam -name secp256k1 -genkey -noout -outform DER | tail -c +8 | head -c 32 | xxd -p -c 32
```

Preencha no `.env`:
- `PDS_HOSTNAME=pds.seudominio.com`
- Os três secrets acima

## Passo 3 — Subir o PDS

```bash
cd /pds
docker compose up -d
```

Verifique:

```bash
docker compose logs -f pds
```

## Passo 4 — DNS e HTTPS

Aponte o registro A (ou AAAA) do seu domínio para o IP do VPS.

O Caddy (incluído no compose) pega o certificado automaticamente.

## Passo 5 — Criar contas

```bash
# Entrar no container e usar pdsadmin
docker exec -it pds pdsadmin account create
```

Ou use a interface web depois de configurar o app.

## Passo 6 — Apontar o app AQUA para o seu PDS

No app (variáveis de ambiente ou configuração):

- `EXPO_PUBLIC_PDS_URL=https://pds.seudominio.com`
- Ou o equivalente no código de login / session

Assim os usuários criam conta no **seu** PDS.

## Próximos passos (independência maior)

1. **AppView próprio** — usar o indigo (está em `app-aqua-finale/bsky-reference/indigo`)
2. **Relay próprio** — ver `deploy-recipes/atproto-relay-docker`
3. **Moderação** — Ozone ou regras customizadas
4. **Features AQUA nativas** — lexicons próprios para Docs/Hub

## Recursos úteis

- Repo oficial do PDS: https://github.com/bluesky-social/pds
- Deploy recipes: `app-aqua-finale/bsky-reference/deploy-recipes`
- Documentação AT Protocol: https://atproto.com

---

Com o PDS no ar você já tem a base da independência. O resto (AppView + Relay) pode vir depois, quando quiser features customizadas e menos dependência da rede principal.
