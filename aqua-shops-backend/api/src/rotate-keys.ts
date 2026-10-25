// Troca da chave de cifra das credenciais das lojas. Veja "Backup e troca da chave" no README.
//   CONNECTION_ENCRYPTION_KEY=<nova> CONNECTION_ENCRYPTION_KEY_OLD=<antiga> DATABASE_URL=... npm run rotate-keys
import { createConnections, createVault } from './connections.ts';
import { createPgStore } from './store.ts';

const env = process.env;
if (!env.DATABASE_URL || !env.CONNECTION_ENCRYPTION_KEY) {
  console.error('Defina DATABASE_URL e CONNECTION_ENCRYPTION_KEY (a nova) e, se estiver trocando, CONNECTION_ENCRYPTION_KEY_OLD.');
  process.exit(1);
}

const store = await createPgStore(env.DATABASE_URL);
try {
  const vault = createVault(env.CONNECTION_ENCRYPTION_KEY, env.CONNECTION_ENCRYPTION_KEY_OLD || undefined);
  const connections = createConnections({ store, vault, providers: [], publicUrl: 'http://localhost' });
  const rotated = await connections.rotate();
  console.log(`${rotated} conexão(ões) recifrada(s) com a chave ${vault.keyId}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await store.close();
}
