import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { createAsaasClient } from './asaas.ts';
import { createCatalog } from './catalog.ts';
import { createMercurCheckout } from './checkout.ts';
import { createConnections, createVault } from './connections.ts';
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

// Cada loja conecta o PRÓPRIO provedor de pagamento; não existe provedor global nem conta da plataforma.
// Aqui só registramos os drivers disponíveis. Pedidos ligam com banco, chave de cifra das credenciais
// e a URL pública da API (para montar o webhook de cada loja).
const asaasUrl = env.ASAAS_BASE_URL ?? 'https://api-sandbox.asaas.com/v3';
const providers: PaymentProvider[] = [createAsaasProvider(apiKey => createAsaasClient({ baseUrl: asaasUrl, apiKey }))];
// Desenvolvimento: provedor que não cobra nada.
if (env.ENABLE_FAKE_PAYMENTS === 'true') providers.push(createFakeProvider());

let orders;
let connections;
if (env.DATABASE_URL && env.CONNECTION_ENCRYPTION_KEY && env.PUBLIC_API_URL) {
  const store = await createPgStore(env.DATABASE_URL);
  connections = createConnections({ store, vault: createVault(env.CONNECTION_ENCRYPTION_KEY, env.CONNECTION_ENCRYPTION_KEY_OLD || undefined), providers, publicUrl: env.PUBLIC_API_URL });
  orders = createOrdersService({
    catalog,
    checkout: createMercurCheckout({ baseUrl: mercurUrl, publishableKey: env.MERCUR_PUBLISHABLE_KEY, currency: env.CURRENCY ?? 'brl' }),
    store,
    connections,
  });
  console.log(`Pedidos ligados (drivers: ${providers.map(p => p.name).join(', ')})`);
} else {
  console.log('Pedidos desligados: configure DATABASE_URL, CONNECTION_ENCRYPTION_KEY e PUBLIC_API_URL.');
}

const app = createApp(catalog, {
  corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
  orders,
  connections,
});

const port = Number(env.PORT ?? 9100);
const hostname = env.HOST ?? '127.0.0.1';
serve({ fetch: app.fetch, port, hostname }, () => console.log(`Aqua Shops API em http://${hostname}:${port}`));
