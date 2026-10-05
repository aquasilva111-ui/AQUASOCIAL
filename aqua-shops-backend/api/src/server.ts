import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { createAsaasClient } from './asaas.ts';
import { createCatalog } from './catalog.ts';
import { createMercurCheckout } from './checkout.ts';
import { createMercurClient } from './mercur.ts';
import { createOrdersService } from './orders.ts';
import { createAsaasProvider, createFakeProvider, type PaymentProvider } from './payments.ts';
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

// Pedidos só ligam com um provedor de pagamento e o banco configurados. Sem isso a API serve só o catálogo.
// PAYMENT_PROVIDER: asaas (padrão) ou fake (desenvolvimento: não cobra nada).
let orders;
const providers: PaymentProvider[] = [];
const providerName = env.PAYMENT_PROVIDER ?? 'asaas';
if (providerName === 'asaas' && env.ASAAS_API_KEY && env.ASAAS_WEBHOOK_TOKEN) {
  providers.push(createAsaasProvider(createAsaasClient({ baseUrl: env.ASAAS_BASE_URL ?? 'https://api-sandbox.asaas.com/v3', apiKey: env.ASAAS_API_KEY }), env.ASAAS_WEBHOOK_TOKEN));
} else if (providerName === 'fake') {
  providers.push(createFakeProvider(env.FAKE_WEBHOOK_TOKEN));
}

if (providers.length && env.DATABASE_URL) {
  const store = await createPgStore(env.DATABASE_URL);
  orders = createOrdersService({
    catalog,
    checkout: createMercurCheckout({ baseUrl: mercurUrl, publishableKey: env.MERCUR_PUBLISHABLE_KEY, currency: env.CURRENCY ?? 'brl' }),
    store,
    payments: providers,
    split: { commissionBps: Number(env.COMMISSION_BPS ?? 1000), minCommissionCents: Number(env.MIN_COMMISSION_CENTS ?? 200) },
  });
  console.log(`Pedidos ligados (provedor: ${providers[0]!.name})`);
} else {
  console.log('Pedidos desligados: configure o provedor de pagamento (ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN, ou PAYMENT_PROVIDER=fake) e DATABASE_URL.');
}

const app = createApp(catalog, {
  corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
  orders,
  providers,
});

const port = Number(env.PORT ?? 9100);
const hostname = env.HOST ?? '127.0.0.1';
serve({ fetch: app.fetch, port, hostname }, () => console.log(`Aqua Shops API em http://${hostname}:${port}`));
