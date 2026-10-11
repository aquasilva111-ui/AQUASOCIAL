# Build a partir da RAIZ do repositório (o "Pra você" usa ../aqua-personal-git):
#   docker build -f aqua-feeds/Dockerfile -t aqua-feeds .
# O aqua-feeds/Dockerfile.dockerignore limita o contexto a estas duas pastas.
FROM node:22-alpine
ENV NODE_ENV=production AQUA_FEEDS_ENV=production HOST=0.0.0.0 PORT=3020
WORKDIR /app/aqua-personal-git
COPY aqua-personal-git/package.json ./
COPY aqua-personal-git/src ./src
WORKDIR /app/aqua-feeds
COPY aqua-feeds/package.json aqua-feeds/package-lock.json aqua-feeds/.npmrc ./
RUN npm ci --no-audit --no-fund --omit=dev
COPY aqua-feeds/src ./src
COPY aqua-feeds/scripts ./scripts
EXPOSE 3020
USER node
CMD ["node", "node_modules/tsx/dist/cli.mjs", "src/server.ts"]
