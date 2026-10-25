import { describe, expect, it } from 'vitest';
import { ConnectionError, createConnections, createVault } from '../src/connections.ts';
import { createFakeProvider } from '../src/payments.ts';
import { createMemoryStore } from '../src/store.ts';

const KEY = 'a'.repeat(64);

describe('cofre de credenciais', () => {
  it('cifra e decifra, sem deixar o texto aberto', () => {
    const vault = createVault(KEY);
    const sealed = vault.seal('{"apiKey":"segredo"}', 'loja|asaas');
    expect(sealed).not.toContain('segredo');
    expect(vault.open(sealed, 'loja|asaas')).toBe('{"apiKey":"segredo"}');
    expect(vault.seal('x', 'c')).not.toBe(vault.seal('x', 'c')); // IV novo a cada vez
  });

  it('não abre com outra chave, outro contexto ou texto adulterado', () => {
    const sealed = createVault(KEY).seal('segredo', 'loja-a|asaas');
    expect(() => createVault('b'.repeat(64)).open(sealed, 'loja-a|asaas')).toThrow();
    expect(() => createVault(KEY).open(sealed, 'loja-b|asaas')).toThrow(); // copiar para outra loja não funciona
    expect(() => createVault(KEY).open(sealed.slice(0, -2) + 'AA', 'loja-a|asaas')).toThrow();
    expect(() => createVault(KEY).open('lixo', 'loja-a|asaas')).toThrow();
  });

  it('exige chave de 32 bytes', () => {
    expect(() => createVault('curta')).toThrow();
    expect(() => createVault(Buffer.alloc(32, 1).toString('base64'))).not.toThrow();
  });
});

describe('conexões das lojas', () => {
  const setup = () => {
    const store = createMemoryStore();
    const fake = createFakeProvider();
    const connections = createConnections({
      store,
      vault: createVault(KEY),
      providers: [fake],
      publicUrl: 'https://api.aqua.test/',
      now: () => new Date('2026-10-05T12:00:00Z'),
      newSecret: () => 'segredo-gerado',
    });
    return { store, fake, connections };
  };

  it('conecta a loja, guarda credencial e segredo cifrados e devolve o webhook dela', async () => {
    const { store, connections } = setup();
    const result = await connections.connect('loja_1', 'fake', { kind: 'api_key', apiKey: 'chave-da-loja' });
    expect(result).toEqual({ webhookUrl: 'https://api.aqua.test/webhooks/fake/loja_1', webhookSecret: 'segredo-gerado' });

    const row = (await store.getConnection('loja_1', 'fake'))!;
    expect(row.credentialEnc).not.toContain('chave-da-loja');
    expect(row.webhookSecretEnc).not.toContain('segredo-gerado');
    expect(row.accountId).toBe('fake_acc_chave-da-loja');

    const open = (await connections.get('loja_1', 'fake'))!;
    expect(open.credential).toEqual({ token: 'chave-da-loja' });
    expect(open.webhookSecret).toBe('segredo-gerado');
  });

  it('cada loja tem a sua credencial: não existe conexão global', async () => {
    const { connections } = setup();
    await connections.connect('loja_1', 'fake', { kind: 'api_key', apiKey: 'a' });
    await connections.connect('loja_2', 'fake', { kind: 'oauth', code: 'b', redirectUri: 'https://app/cb' });
    expect((await connections.forShop('loja_1'))?.credential).toEqual({ token: 'a' });
    expect((await connections.forShop('loja_2'))?.credential).toEqual({ token: 'b' });
    expect(await connections.forShop('loja_3')).toBeNull();
    expect(await connections.get('loja_1', 'asaas')).toBeNull();
  });

  it('conectar de novo troca a credencial', async () => {
    const { connections } = setup();
    await connections.connect('loja_1', 'fake', { kind: 'api_key', apiKey: 'velha' });
    await connections.connect('loja_1', 'fake', { kind: 'api_key', apiKey: 'nova' });
    expect((await connections.get('loja_1', 'fake'))?.credential).toEqual({ token: 'nova' });
  });

  it('recusa provedor desconhecido, loja vazia e falha do provedor', async () => {
    const { connections, store } = setup();
    await expect(connections.connect('loja_1', 'nao-existe', { kind: 'api_key', apiKey: 'k' })).rejects.toMatchObject({ status: 404 });
    await expect(connections.connect(' ', 'fake', { kind: 'api_key', apiKey: 'k' })).rejects.toMatchObject({ status: 400 });
    const err = await connections.connect('loja_1', 'fake', { kind: 'api_key', apiKey: '' }).catch(e => e);
    expect(err).toBeInstanceOf(ConnectionError);
    expect(err.status).toBe(502);
    expect(await store.getConnection('loja_1', 'fake')).toBeNull(); // nada gravado
  });

  it('ignora conexão cujo driver não está registrado', async () => {
    const { store, connections } = setup();
    await connections.connect('loja_1', 'fake', { kind: 'api_key', apiKey: 'k' });
    const row = (await store.getConnection('loja_1', 'fake'))!;
    await store.saveConnection({ ...row, provider: 'sumiu' });
    expect(await connections.get('loja_1', 'sumiu')).toBeNull();
  });
});
