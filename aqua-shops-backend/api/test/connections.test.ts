import { describe, expect, it, vi } from 'vitest';
import { ConnectionError, createConnections, createVault, VaultError } from '../src/connections.ts';
import { createFakeProvider } from '../src/payments.ts';
import { createMemoryStore } from '../src/store.ts';

const KEY = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

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
    expect(() => createVault(KEY_B).open(sealed, 'loja-a|asaas')).toThrow(VaultError);
    expect(() => createVault(KEY).open(sealed, 'loja-b|asaas')).toThrow(); // copiar para outra loja não funciona
    expect(() => createVault(KEY).open(sealed.slice(0, -2) + 'AA', 'loja-a|asaas')).toThrow(VaultError);
    expect(() => createVault(KEY).open('lixo', 'loja-a|asaas')).toThrow(VaultError);
  });

  it('exige chave de 32 bytes', () => {
    expect(() => createVault('curta')).toThrow();
    expect(() => createVault(KEY, 'curta')).toThrow();
    expect(() => createVault(Buffer.alloc(32, 1).toString('base64'))).not.toThrow();
  });

  it('põe o id da chave no texto cifrado: v1.<kid>.iv.tag.dados', () => {
    const vault = createVault(KEY);
    const parts = vault.seal('x', 'c').split('.');
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe('v1');
    expect(parts[1]).toBe(vault.keyId);
    expect(vault.keyId).not.toBe(createVault(KEY_B).keyId);
    expect(vault.seal('x', 'c')).not.toContain(KEY); // o id não revela a chave
  });

  it('lê o que foi cifrado com a chave antiga, mas só cifra com a nova', () => {
    const sealedOld = createVault(KEY).seal('segredo', 'c');
    const vault = createVault(KEY_B, KEY);
    expect(vault.open(sealedOld, 'c')).toBe('segredo');
    expect(vault.needsRotation(sealedOld)).toBe(true);
    const sealedNew = vault.seal('segredo', 'c');
    expect(sealedNew.split('.')[1]).toBe(vault.keyId);
    expect(vault.needsRotation(sealedNew)).toBe(false);
  });

  it('diz qual chave falta quando a chave se perdeu, com erro próprio', () => {
    const sealed = createVault(KEY).seal('segredo', 'c');
    const lost = createVault(KEY_B);
    expect(() => lost.open(sealed, 'c')).toThrow(VaultError);
    expect(() => lost.open(sealed, 'c')).toThrow(createVault(KEY).keyId);
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

  describe('chave de cifra perdida ou trocada', () => {
    const withKeys = async (key: string, oldKey?: string) => {
      const { store, fake } = setup();
      await createConnections({ store, vault: createVault(KEY), providers: [fake], publicUrl: 'https://api.aqua.test', now: () => new Date('2026-10-05T12:00:00Z') }).connect('loja_1', 'fake', { kind: 'api_key', apiKey: 'chave-da-loja' });
      const connections = createConnections({ store, vault: createVault(key, oldKey), providers: [fake], publicUrl: 'https://api.aqua.test' });
      return { store, fake, connections };
    };

    it('credencial ilegível vira ConnectionError 500 com mensagem própria, sem vazar detalhe', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { connections } = await withKeys(KEY_B); // chave original perdida
      for (const call of [() => connections.get('loja_1', 'fake'), () => connections.forShop('loja_1')]) {
        const err = await call().catch(e => e);
        expect(err).toBeInstanceOf(ConnectionError);
        expect(err.status).toBe(500);
        expect(err.message).toMatch(/ilegível/);
        expect(err.message).not.toMatch(/chave|key|CONNECTION/i);
      }
      expect(log.mock.calls[0]!.join(' ')).toContain('loja_1'); // o motivo vai para o log
      log.mockRestore();
    });

    it('com a chave antiga configurada continua lendo, e rotate() recifra tudo com a nova', async () => {
      const { store, connections } = await withKeys(KEY_B, KEY);
      expect((await connections.get('loja_1', 'fake'))?.credential).toEqual({ token: 'chave-da-loja' });
      expect(await connections.rotate()).toBe(1);
      expect(await connections.rotate()).toBe(0); // nada mais a fazer

      // Depois da rotação a chave antiga já pode sair.
      const row = (await store.getConnection('loja_1', 'fake'))!;
      expect(row.credentialEnc.split('.')[1]).toBe(createVault(KEY_B).keyId);
      const onlyNew = createConnections({ store, vault: createVault(KEY_B), providers: [setup().fake], publicUrl: 'https://api.aqua.test' });
      expect((await onlyNew.get('loja_1', 'fake'))?.credential).toEqual({ token: 'chave-da-loja' });
      expect(row.createdAt).toBe('2026-10-05T12:00:00.000Z'); // a data da conexão não muda
    });

    it('rotate() falha sem regravar nada se alguma conexão não abre', async () => {
      const { store, connections } = await withKeys(KEY_B); // sem a antiga
      const before = (await store.getConnection('loja_1', 'fake'))!.credentialEnc;
      await expect(connections.rotate()).rejects.toMatchObject({ status: 500 });
      expect((await store.getConnection('loja_1', 'fake'))!.credentialEnc).toBe(before);
    });
  });
});
