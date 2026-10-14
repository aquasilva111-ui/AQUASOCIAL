# Deploy do AQUA na Vercel

Como você já tem a Vercel conectada, este é o fluxo mais simples para a versão web.

## Configuração recomendada

No painel da Vercel (projeto ligado ao repositório AQUASOCIAL):

| Campo | Valor |
|-------|-------|
| Framework Preset | Other |
| Root Directory | `.` |
| Build Command | `yarn install && yarn build` |
| Output Directory | `web-build` |
| Install Command | `yarn install` |
| Node.js Version | 20.x |

## vercel.json

O arquivo `vercel.json` na raiz já existe. Você pode deixar o deploy automático ligado (hoje está desabilitado).

Para ativar:

```json
{
  "git": {
    "deploymentEnabled": true
  }
}
```

## Rotas do cliente

O app é SPA. A Vercel precisa servir `index.html` para rotas como `/search`.

Adicione (ou confirme) no `vercel.json`:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

## Variáveis de ambiente

Se precisar apontar para o seu PDS:

- `EXPO_PUBLIC_PDS_URL` = `https://pds.seudominio.com`

## Cloudflare (alternativa)

Se preferir Cloudflare Pages:

- Build command: `yarn install && yarn build`
- Output: `web-build`
- Mesmas rewrites para SPA

## Hostinger

O arquivo `HOSTINGER.md` continua válido se quiser usar lá. A Vercel é só mais automática.

## Depois do deploy

1. Abra a URL da Vercel.
2. Teste uma rota direta (ex: `/search`).
3. Confirme que o rebrand AQUA aparece (nome, cores).

Pronto. O fluxo fica: push na branch → Vercel faz o build → site no ar.
