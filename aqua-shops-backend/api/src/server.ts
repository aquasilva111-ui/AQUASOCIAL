import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { createAsaasClient } from './asaas.ts';
import { createCatalog } from './catalog.ts';
import { createMercurCheckout } from './checkout.ts';
import { createMercurClient } from './mercur.ts';
import { createOrdersService } from './orders.ts';
import { createAsaasProvider, createFakeProvider, type PaymentProvider } from './payments.ts';
import { createPgStore } from './store.ts';
import pg from 'pg';
import { createEcosystemAuthenticator } from './ecosystem/auth.ts';
import { createPgEcosystemStore } from './ecosystem/store.ts';
import { OrderError } from './orders.ts';
import type { Catalog } from './catalog.ts';
import type { Did } from '../../../src/lib/ecosystem/types.ts';
import { createAIProviders } from './ecosystem/providers.ts';

const env = process.env;

const mercurUrl = (env.MERCUR_URL ?? 'http://localhost:9000').replace(/\/+$/, '');
const mercur = createMercurClient({
  baseUrl: mercurUrl,
  publishableKey: env.MERCUR_PUBLISHABLE_KEY ?? '',
  currency: env.CURRENCY ?? 'brl',
});
const catalogUnavailable = async (): Promise<never> => { throw new OrderError('Catálogo Shops não configurado', 503); };
const catalog: Catalog = env.MERCUR_PUBLISHABLE_KEY ? createCatalog(mercur) : {list:catalogUnavailable,get:catalogUnavailable,categories:catalogUnavailable,resolve:catalogUnavailable};

// Pedidos só ligam com um provedor de pagamento e o banco configurados. Sem isso a API serve só o catálogo.
// PAYMENT_PROVIDER: asaas (padrão) ou fake (desenvolvimento: não cobra nada).
let orders;
const providers: PaymentProvider[] = [];
const providerName = env.PAYMENT_PROVIDER ?? 'asaas';
if (providerName === 'asaas' && env.ASAAS_API_KEY && env.ASAAS_WEBHOOK_TOKEN) {
  providers.push(createAsaasProvider(createAsaasClient({ baseUrl: env.ASAAS_BASE_URL ?? 'https://api-sandbox.asaas.com/v3', apiKey: env.ASAAS_API_KEY }), env.ASAAS_WEBHOOK_TOKEN));
} else if (providerName === 'fake') {
  if (env.NODE_ENV === 'production') throw new Error('Fake payment provider is not permitted in production');
  providers.push(createFakeProvider(env.FAKE_WEBHOOK_TOKEN));
}

if (providers.length && env.DATABASE_URL && env.MERCUR_PUBLISHABLE_KEY) {
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
  ecosystem: {
    store: env.DATABASE_URL ? createPgEcosystemStore(new pg.Pool({connectionString:env.DATABASE_URL})) : undefined,
    authenticate: env.AQUA_SERVICE_DID ? createEcosystemAuthenticator(env.AQUA_SERVICE_DID) : undefined,
    reviewerDids: (env.AQUA_REVIEWER_DIDS ?? '').split(',').filter(d => /^did:(plc|web):[a-zA-Z0-9._:%-]+$/.test(d)) as Did[],
    allowedAppOrigins: (env.AQUA_APP_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
    runnerOrigin: env.AQUA_RUNNER_ORIGIN,
    ai: createAIProviders(env),
  },
});

const port = Number(env.PORT ?? 9100);
const hostname = env.HOST ?? '127.0.0.1';
serve({ fetch: app.fetch, port, hostname }, () => console.log(`Aqua Shops API em http://${hostname}:${port}`));
