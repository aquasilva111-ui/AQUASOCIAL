import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { createCatalog } from './catalog.ts';
import { createMercurClient } from './mercur.ts';

const env = process.env;
if (!env.MERCUR_PUBLISHABLE_KEY) {
  console.error('Defina MERCUR_PUBLISHABLE_KEY (veja .env.example).');
  process.exit(1);
}

const mercur = createMercurClient({
  baseUrl: (env.MERCUR_URL ?? 'http://localhost:9000').replace(/\/+$/, ''),
  publishableKey: env.MERCUR_PUBLISHABLE_KEY,
  currency: env.CURRENCY ?? 'brl',
});

const app = createApp(
  createCatalog(mercur),
  (env.CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
);

const port = Number(env.PORT ?? 9100);
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => console.log(`Aqua Shops API em http://127.0.0.1:${port}`));
