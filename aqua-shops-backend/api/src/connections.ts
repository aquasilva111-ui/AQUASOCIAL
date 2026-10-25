// Conexão de cada loja com o provedor de pagamento dela. A credencial e o segredo de webhook são
// cifrados (AES-256-GCM) antes de ir para o banco e só existem decifrados em memória, na hora de
// cobrar ou validar um webhook. A cifra é amarrada a loja+provedor: copiar o texto cifrado de uma
// loja para outra não abre.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { ConnectInput, PaymentProvider, ShopCredential } from './payments.ts';
import type { OrderStore } from './store.ts';

export interface ShopPaymentConnection {
  /** Id da loja (hoje o id do vendedor; o DID do perfil quando o Mercur sair do caminho). */
  shopId: string;
  provider: string;
  /** Id da conta da loja no provedor. */
  accountId?: string;
  /** Credencial da loja, em JSON cifrado. */
  credentialEnc: string;
  /** Segredo do webhook desta loja, cifrado. */
  webhookSecretEnc: string;
  createdAt: string;
}

export interface CredentialVault {
  seal(plain: string, context: string): string;
  open(sealed: string, context: string): string;
}

/** `key`: 32 bytes em hex (64 caracteres) ou base64. Gere com: openssl rand -hex 32 */
export function createVault(key: string): CredentialVault {
  const raw = /^[0-9a-f]{64}$/i.test(key) ? Buffer.from(key, 'hex') : Buffer.from(key, 'base64');
  if (raw.length !== 32) throw new Error('CONNECTION_ENCRYPTION_KEY deve ter 32 bytes (hex ou base64)');
  return {
    seal(plain, context) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', raw, iv);
      cipher.setAAD(Buffer.from(context));
      const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
    },
    open(sealed, context) {
      const [version, iv, tag, data] = sealed.split('.');
      if (version !== 'v1' || !iv || !tag || !data) throw new Error('Credencial cifrada inválida');
      const decipher = createDecipheriv('aes-256-gcm', raw, Buffer.from(iv, 'base64'));
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
    },
  };
}

/** Uma conexão pronta para uso: credencial e segredo decifrados, só em memória. */
export interface OpenConnection {
  shopId: string;
  provider: PaymentProvider;
  accountId?: string;
  credential: ShopCredential;
  webhookSecret: string;
}

export interface ConnectionsDeps {
  store: Pick<OrderStore, 'getConnection' | 'listConnections' | 'saveConnection'>;
  vault: CredentialVault;
  /** Drivers disponíveis. A loja escolhe um; não existe provedor global. */
  providers: PaymentProvider[];
  /** Endereço público da API, para montar /webhooks/<provedor>/<shopId>. */
  publicUrl: string;
  now?: () => Date;
  newSecret?: () => string;
}

export class ConnectionError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 502,
  ) {
    super(message);
    this.name = 'ConnectionError';
  }
}

const context = (shopId: string, provider: string) => `${shopId}|${provider}`;

export function createConnections(deps: ConnectionsDeps) {
  const publicUrl = deps.publicUrl.replace(/\/+$/, '');
  const now = deps.now ?? (() => new Date());
  const newSecret = deps.newSecret ?? (() => randomBytes(32).toString('hex'));
  const driver = (name: string) => deps.providers.find(p => p.name === name);

  function open(row: ShopPaymentConnection): OpenConnection | null {
    const provider = driver(row.provider);
    if (!provider) return null;
    const ctx = context(row.shopId, row.provider);
    return {
      shopId: row.shopId,
      provider,
      accountId: row.accountId,
      credential: JSON.parse(deps.vault.open(row.credentialEnc, ctx)) as ShopCredential,
      webhookSecret: deps.vault.open(row.webhookSecretEnc, ctx),
    };
  }

  return {
    /** Driver pelo nome (para o webhook saber qual provedor está falando). */
    provider: driver,

    /** Liga a loja a um provedor. Chamar de novo troca a credencial e gera outro segredo de webhook. */
    async connect(shopId: string, providerName: string, input: ConnectInput): Promise<{ webhookUrl: string; webhookSecret: string }> {
      const provider = driver(providerName);
      if (!provider) throw new ConnectionError('Provedor desconhecido', 404);
      if (!shopId.trim()) throw new ConnectionError('Loja inválida', 400);
      if (!provider.connectionKinds.includes(input.kind)) throw new ConnectionError('Este provedor não conecta desse jeito', 400);

      const webhookUrl = `${publicUrl}/webhooks/${provider.name}/${encodeURIComponent(shopId)}`;
      const webhookSecret = newSecret();
      const result = await provider.connect(input, { webhookUrl, webhookSecret }).catch(error => {
        throw new ConnectionError(error instanceof Error ? error.message : 'Falha ao conectar o provedor', 502);
      });

      const ctx = context(shopId, provider.name);
      await deps.store.saveConnection({
        shopId,
        provider: provider.name,
        accountId: result.accountId,
        credentialEnc: deps.vault.seal(JSON.stringify(result.credential), ctx),
        webhookSecretEnc: deps.vault.seal(webhookSecret, ctx),
        createdAt: now().toISOString(),
      });
      return { webhookUrl, webhookSecret };
    },

    /** A conexão da loja naquele provedor, ou null. */
    async get(shopId: string, providerName: string): Promise<OpenConnection | null> {
      const row = await deps.store.getConnection(shopId, providerName);
      return row ? open(row) : null;
    },

    /** A conexão que a loja usa para cobrar: a primeira cujo driver existe. Null se não conectou nada. */
    async forShop(shopId: string): Promise<OpenConnection | null> {
      for (const row of await deps.store.listConnections(shopId)) {
        const connection = open(row);
        if (connection) return connection;
      }
      return null;
    },
  };
}

export type Connections = ReturnType<typeof createConnections>;
