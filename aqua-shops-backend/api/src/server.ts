import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { createAsaasClient } from './asaas.ts';
import { createCatalog } from './catalog.ts';
import { createMercurCheckout } from './checkout.ts';
import { createMercurClient } from './mercur.ts';
import { createOrdersService } from './orders.ts';
import { createPgStore } from './store.ts';

const env = process.env;
if (!env.MERCUR_PUBLISHABLE_KEY) {
  console.error('Defina MERCUR_PUBLISHABLE_KEY (veja .env.example).');
  process.exit(1);
}

const mercurUrl = (env.MERCUR_URL ?? 'http://localhost:9000').replace(/\/+$/, '');
const mercur = createMercurClient({
  baseUrl: mercurUrl,
  publishableKey: env.MERCUR_PUBLISHABLE_KEY,
  currency: env.CURRENCY ?? 'brl',
});
const catalog = createCatalog(mercur);

// Pedidos só ligam com chave do Asaas, banco e token do webhook. Sem isso a API serve só o catálogo.
let orders;
const webhookToken = env.ASAAS_WEBHOOK_TOKEN;
if (env.ASAAS_API_KEY && env.DATABASE_URL && webhookToken) {
  const store = await createPgStore(env.DATABASE_URL);
  orders = createOrdersService({
    catalog,
    checkout: createMercurCheckout({ baseUrl: mercurUrl, publishableKey: env.MERCUR_PUBLISHABLE_KEY, currency: env.CURRENCY ?? 'brl' }),
    store,
    asaas: createAsaasClient({ baseUrl: env.ASAAS_BASE_URL ?? 'https://api-sandbox.asaas.com/v3', apiKey: env.ASAAS_API_KEY }),
    split: { commissionBps: Number(env.COMMISSION_BPS ?? 1000), minCommissionCents: Number(env.MIN_COMMISSION_CENTS ?? 200) },
  });
  console.log(`Pedidos ligados (Asaas: ${env.ASAAS_BASE_URL ?? 'sandbox'})`);
} else {
  console.log('Pedidos desligados: faltam ASAAS_API_KEY, DATABASE_URL ou ASAAS_WEBHOOK_TOKEN.');
}

const app = createApp(catalog, {
  corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
  orders,
  webhookToken,
});

const port = Number(env.PORT ?? 9100);
const hostname = env.HOST ?? '127.0.0.1';
serve({ fetch: app.fetch, port, hostname }, () => console.log(`Aqua Shops API em http://${hostname}:${port}`));
