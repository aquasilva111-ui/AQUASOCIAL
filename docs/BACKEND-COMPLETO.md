# Guia Completo — Backend Próprio do AQUA (PDS)

Este guia leva você do zero até ter um **Personal Data Server (PDS)** próprio rodando, com contas e dados sob seu controle. Com isso o AQUA deixa de depender totalmente da rede principal do Bluesky.

**O que você ganha agora:**
- Contas criadas no seu servidor
- Dados (posts, perfil, etc.) armazenados no seu VPS
- Base para moderação e regras alinhadas com a sua visão
- Caminho aberto para AppView e Relay próprios depois

---

## 1. Pré-requisitos

### Servidor
- VPS com Ubuntu 22.04 ou Debian 12 (recomendado)
- Mínimo: 2 vCPU, 2 GB RAM, 20 GB disco (SSD)
- Acesso root via SSH
- IP público fixo

### Domínio
- Um domínio (ex: `aqua.social` ou subdomínio `pds.aqua.social`)
- Acesso ao painel DNS

### No seu computador
- Terminal / SSH client
- (Opcional) `scp` ou `rsync` para enviar arquivos

---

## 2. Preparar o VPS

Conecte via SSH:

```bash
ssh root@SEU_IP
```

Atualize o sistema:

```bash
apt update && apt upgrade -y
```

Instale Docker e Docker Compose:

```bash
# Docker
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# Compose plugin
apt install -y docker-compose-plugin
```

Crie as pastas do PDS:

```bash
mkdir -p /pds/caddy/data /pds/caddy/etc/caddy /pds/blocks
chown -R 1000:1000 /pds   # ou o usuário que você usar
```

---

## 3. DNS

No painel do seu registrador, crie um registro:

| Tipo | Nome | Valor          |
|------|------|----------------|
| A    | pds  | IP do seu VPS  |

Exemplo: `pds.aqua.social` → `123.45.67.89`

Aguarde a propagação (pode levar de minutos a algumas horas). Teste com:

```bash
dig pds.seudominio.com
```

---

## 4. Arquivos de configuração

No repositório AQUASOCIAL existe a pasta `deploy/pds/`.

### No servidor (ou via scp)

```bash
# Exemplo enviando do seu computador
scp -r deploy/pds/* root@SEU_IP:/pds/
```

No servidor:

```bash
cd /pds
cp .env.example .env
nano .env
```

### Gerar os secrets obrigatórios

```bash
# JWT Secret
openssl rand --hex 16

# Admin Password
openssl rand --hex 16

# PLC Rotation Key
openssl ecparam -name secp256k1 -genkey -noout -outform DER | tail -c +8 | head -c 32 | xxd -p -c 32
```

Preencha no `.env`:

```env
PDS_HOSTNAME=pds.seudominio.com
PDS_JWT_SECRET=o_valor_gerado
PDS_ADMIN_PASSWORD=o_valor_gerado
PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX=o_valor_gerado
```

As outras variáveis podem ficar como estão no `.env.example` no começo.

---

## 5. Subir o PDS

```bash
cd /pds
docker compose up -d
```

Acompanhe os logs:

```bash
docker compose logs -f pds
```

Você deve ver o servidor iniciar sem erros graves.

O Caddy vai tentar pegar o certificado HTTPS automaticamente assim que o DNS estiver apontando corretamente.

---

## 6. Criar a primeira conta

```bash
docker exec -it pds pdsadmin account create
```

Siga o prompt (e-mail, senha, handle).  
Depois você pode criar convites ou desativar a exigência de invite no `.env` (`PDS_INVITE_REQUIRED=false`).

---

## 7. Apontar o app AQUA para o seu PDS

No código do app (ou via variáveis de ambiente do Expo), configure a URL do PDS.

Exemplo comum:

```env
EXPO_PUBLIC_PDS_URL=https://pds.seudominio.com
```

Procure no código por referências a `bsky.social` ou URLs de PDS padrão e ajuste para o seu.

Depois de rebuildar o app, o fluxo de criar conta / login deve ir para o seu servidor.

---

## 8. Verificar se está funcionando

1. Abra `https://pds.seudominio.com` no navegador (deve responder).
2. Crie uma conta pelo app ou via `pdsadmin`.
3. Faça login no app AQUA e poste algo.
4. Confira se os dados aparecem no seu servidor.

---

## 9. Próximos passos (independência maior)

| Etapa              | O que faz                          | Onde está a referência                  |
|--------------------|------------------------------------|-------------------------------------------|
| AppView próprio     | API de leitura da rede             | `app-aqua-finale/bsky-reference/indigo`  |
| Relay próprio       | Firehose de eventos                | `deploy-recipes/atproto-relay-docker`    |
| Moderação          | Regras e labels                    | Ozone + configurações do PDS             |
| Lexicons AQUA      | Features nativas (Docs, Hub etc.)  | Você define os schemas                    |

Não precisa fazer tudo de uma vez. O PDS sozinho já resolve a parte mais importante (dados e contas).

---

## 10. Troubleshooting

**Certificado não gera**
- Confirme que o DNS está apontando para o IP certo.
- Verifique portas 80 e 443 abertas.
- Olhe logs do Caddy: `docker compose logs caddy`

**PDS não sobe**
- Verifique o `.env` (secrets preenchidos).
- Logs: `docker compose logs pds`

**App não conecta**
- Confirme a URL no app (https, sem barra no final).
- Teste o endpoint: `curl https://pds.seudominio.com/xrpc/_health`

**Conta não cria**
- Verifique se `PDS_INVITE_REQUIRED` está como esperado.
- Use `pdsadmin` para criar manualmente.

---

## 11. Manutenção básica

```bash
# Atualizar containers
cd /pds && docker compose pull && docker compose up -d

# Backup (recomendado)
tar czf /backup/pds-$(date +%F).tar.gz /pds
```

---

## Recursos

- PDS oficial: https://github.com/bluesky-social/pds
- AT Protocol docs: https://atproto.com
- Deploy recipes: repositório `app-aqua-finale` → `bsky-reference/deploy-recipes`
- Este guia + arquivos: pasta `deploy/pds/` e `docs/` neste repositório

---

Com esse PDS no ar, o AQUA já tem sua própria base de dados e contas. O restante (AppView, Relay, features customizadas) pode ser construído em cima disso no seu ritmo.
