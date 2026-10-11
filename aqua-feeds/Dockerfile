FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production AQUA_FEEDS_ENV=production HOST=0.0.0.0 PORT=3020
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --omit=dev
COPY src ./src
COPY scripts ./scripts
EXPOSE 3020
USER node
CMD ["node", "node_modules/tsx/dist/cli.mjs", "src/server.ts"]
