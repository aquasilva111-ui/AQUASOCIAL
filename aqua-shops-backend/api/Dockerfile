FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=9100
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY src ./src
EXPOSE 9100
USER node
CMD ["node", "node_modules/tsx/dist/cli.mjs", "src/server.ts"]
