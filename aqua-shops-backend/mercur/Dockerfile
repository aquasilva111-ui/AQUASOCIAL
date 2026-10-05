# Mercur (Medusa) em produção. O endereço público do painel é gravado no build.
FROM node:22-slim AS build
WORKDIR /app
ARG MERCUR_BACKEND_URL
ENV MERCUR_BACKEND_URL=${MERCUR_BACKEND_URL} \
    VITE_MERCUR_BACKEND_URL=${MERCUR_BACKEND_URL} \
    MEDUSA_DISABLE_TELEMETRY=1 \
    MERCUR_DISABLE_TELEMETRY=true \
    CI=1
COPY package.json package-lock.json turbo.json tsconfig.base.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
# --force: o lockfile (gerado no macOS) marca um binário opcional do esbuild para AIX como obrigatório.
RUN npm ci --no-audit --no-fund --force
RUN NODE_ENV=production npx turbo run build --ui=stream
# O artefato do Medusa instala as próprias dependências de produção.
WORKDIR /app/packages/api/.medusa/server
# Prepara o package.json do artefato: sem devDependencies (incluem @acme/admin e @acme/vendor,
# que só existem no monorepo) e com os mesmos overrides da raiz, para manter o Medusa em 2.20.1.
RUN node -e "const fs=require('fs'),p=JSON.parse(fs.readFileSync('package.json')),r=JSON.parse(fs.readFileSync('/app/package.json'));delete p.devDependencies;p.overrides=r.overrides;fs.writeFileSync('package.json',JSON.stringify(p,null,2))" \
 && npm install --omit=dev --no-audit --no-fund

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production MEDUSA_DISABLE_TELEMETRY=1 MERCUR_DISABLE_TELEMETRY=true
COPY --from=build /app/packages/api/.medusa/server ./
EXPOSE 9000
# Migra o banco a cada subida (é idempotente) e inicia.
CMD ["sh", "-c", "npx medusa db:migrate && npx medusa start"]
