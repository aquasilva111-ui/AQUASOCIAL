# AQUA — Backend próprio (PDS) — Quickstart

> **Guia completo:** veja [`BACKEND-COMPLETO.md`](./BACKEND-COMPLETO.md) para o processo detalhado (VPS, DNS, Docker, secrets, app, troubleshooting e próximos passos).

Este arquivo é a versão resumida.

## O que você precisa

- VPS (Ubuntu/Debian) com Docker
- Domínio apontando para o IP do VPS

## Passos rápidos

1. No servidor:
   ```bash
   sudo mkdir -p /pds/caddy/data /pds/caddy/etc/caddy /pds/blocks
   sudo chown -R $USER:$USER /pds
   ```

2. Copie a pasta `deploy/pds/` para `/pds/`.

3. Gere os secrets e preencha o `.env`:
   ```bash
   openssl rand --hex 16                                          # JWT
   openssl rand --hex 16                                          # Admin
   openssl ecparam -name secp256k1 -genkey -noout -outform DER | tail -c +8 | head -c 32 | xxd -p -c 32  # PLC key
   ```

4. Suba:
   ```bash
   cd /pds && docker compose up -d
   ```

5. Crie conta:
   ```bash
   docker exec -it pds pdsadmin account create
   ```

6. Aponte o app AQUA para `https://pds.seudominio.com`.

---

Para detalhes, erros comuns e próximos passos (AppView/Relay), use o **[guia completo](./BACKEND-COMPLETO.md)**.
