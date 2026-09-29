# aqua-adult-api

Backend do AQUA +18: Entitlements, Creator Economy, Media Engine, Views +18,
Studios +18, Library, Live +18 e Creator/Studio Dashboard. **Somente
desenvolvimento** — não habilitar para usuários reais. Relatórios:
`docs/aqua-adult/final-architecture.md` (readiness final), `phases-8-10-report.md`, `phase-13-report.md`, `phase-14-report.md`, `entry-gate.md`.

## Rodar localmente

```bash
cd aqua-adult-api
npm install
npm test
```

```bash
AQUA_DEV_AUTH=1 AQUA_ENABLE_MOCK_PAYMENTS=1 npm run dev
```

Sobe em `http://127.0.0.1:4318` com Postgres embutido (PGlite) em
`.data/pglite` e mídia privada em `.data/media`.

## Variáveis

| Variável | Uso |
|---|---|
| `AQUA_ENV` | `development` \| `test` \| `production` |
| `AQUA_SERVICE_DID` | DID deste serviço (audiência dos tokens). Obrigatório em produção |
| `DATABASE_URL` | Postgres. Obrigatório em produção |
| `AQUA_MEDIA_SIGNING_SECRET` | segredo HMAC das URLs de mídia. Obrigatório em produção |
| `AQUA_PLAYBACK_TTL_SECONDS` | validade das autorizações de mídia (padrão 300) |
| `AQUA_MEDIA_DIR` | pasta privada de mídia (adaptador local) |
| `AQUA_MAX_UPLOAD_BYTES` | limite de upload |
| `AQUA_CORS_ORIGINS` | origens do app permitidas (vírgula) |
| `AQUA_DEV_AUTH` | `1` aceita `x-aqua-dev-did` (ignorado em produção) |
| `AQUA_ENABLE_MOCK_PAYMENTS` | `1` liga os provedores simulados de pagamento e verificação (produção recusa iniciar) |
| `AQUA_ADULT_AGE_VERIFICATION_ENABLED` | `1` = só verificação real abre o +18. Padrão: desligado em dev, **ligado em produção** |
| `AQUA_SUPERADMIN_DIDS` | DIDs SUPERADMIN iniciais (vírgula). Os outros papéis vêm da API `/admin/staff` |
| `AQUA_LOG_LEVEL` | nível pino (`silent` em testes). Tokens e chaves de stream são mascarados |
| `AQUA_TRUST_PROXY` | `1` atrás de CDN/proxy (IP real para o rate limit) |
| `FFMPEG_BIN` | ffmpeg do sistema (recomendado em produção; `ffmpeg-static` é GPL) |

Em produção o processo **não inicia** com pagamento simulado, sem segredo
de mídia, sem `DATABASE_URL` ou sem `AQUA_SERVICE_DID`.
