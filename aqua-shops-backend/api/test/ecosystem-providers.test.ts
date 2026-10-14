import { describe, expect, it, vi } from 'vitest';
import { createAIProviders } from '../src/ecosystem/providers.ts';

describe('Server AI provider adapters (contract fixtures, not production providers)', () => {
  it('does not advertise a provider without both credentials and an explicitly chosen model', () => {
    expect(createAIProviders({}).providers).toEqual([]);
    expect(
      createAIProviders({ AQUA_OPENAI_API_KEY: 'test-only' }).providers,
    ).toEqual([]);
  });
  it.each([
    [
      'openai',
      'OPENAI',
      { choices: [{ message: { content: 'Architecture' } }] },
      'api.openai.com',
    ],
    [
      'kimi',
      'KIMI',
      { choices: [{ message: { content: 'Implementation' } }] },
      'api.moonshot.ai',
    ],
    [
      'anthropic',
      'ANTHROPIC',
      { content: [{ type: 'text', text: 'Review' }] },
      'api.anthropic.com',
    ],
    [
      'gemini',
      'GEMINI',
      { candidates: [{ content: { parts: [{ text: 'Comparison' }] } }] },
      'generativelanguage.googleapis.com',
    ],
  ] as const)(
    'uses the %s server endpoint and parses its real response shape',
    async (id, name, response, hostname) => {
      const send = vi.fn<typeof fetch>(
        async (_url, _init) =>
          new Response(JSON.stringify(response), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      );
      const gateway = createAIProviders(
        {
          [`AQUA_${name}_API_KEY`]: 'contract-test-key',
          [`AQUA_${name}_MODEL`]: 'test-model',
        },
        send as typeof fetch,
      );
      const result = await gateway.send(
        id,
        [
          { role: 'system', content: 'Preserve decisions' },
          { role: 'user', content: 'Ask' },
        ],
        new AbortController().signal,
      );
      expect(result).toBeTruthy();
      expect(
        new URL(send.mock.calls[0]![0] as unknown as string).hostname,
      ).toBe(hostname);
      expect(JSON.stringify(send.mock.calls)).not.toContain('localhost');
    },
  );
  it('reports authorization failures and malformed output without simulating success or echoing secrets', async () => {
    const env = {
      AQUA_OPENAI_API_KEY: 'contract-test-key',
      AQUA_OPENAI_MODEL: 'test-model',
    };
    const denied = createAIProviders(
      env,
      async () => new Response('secret provider message', { status: 401 }),
    );
    await expect(
      denied.send(
        'openai',
        [{ role: 'user', content: 'Ask' }],
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      status: 503,
      message: 'Provedor de IA recusou a operação (401)',
    });
    const empty = createAIProviders(
      env,
      async () => new Response('{}', { status: 200 }),
    );
    await expect(
      empty.send(
        'openai',
        [{ role: 'user', content: 'Ask' }],
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
  it('enforces context limits and rejects insecure local endpoints', async () => {
    const gateway = createAIProviders(
      { AQUA_OPENAI_API_KEY: 'test-only', AQUA_OPENAI_MODEL: 'test-model' },
      vi.fn() as any,
    );
    await expect(
      gateway.send(
        'openai',
        [{ role: 'user', content: 'a'.repeat(16001) }],
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(() =>
      createAIProviders({
        AQUA_LOCAL_MODEL_URL: 'http://remote.example.test',
        AQUA_LOCAL_MODEL: 'model',
      }),
    ).toThrow();
    expect(
      createAIProviders({
        AQUA_LOCAL_MODEL_URL: 'http://127.0.0.1:8000/v1/chat/completions',
        AQUA_LOCAL_MODEL: 'model',
      }).providers,
    ).toEqual(['local']);
  });
});
