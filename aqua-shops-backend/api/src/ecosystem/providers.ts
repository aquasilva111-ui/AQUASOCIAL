import type {
  AIMessage,
  ProviderId,
} from '../../../../src/lib/ecosystem/intelligence.ts';
import { EcosystemError } from './store.ts';

type ProviderConfig = { key?: string; model: string; url: string };
/** Credentials and endpoint selection live only on the existing backend. No browser provider calls. */
export function createAIProviders(
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch = fetch,
) {
  const configurations: Partial<Record<ProviderId, ProviderConfig>> = {};
  if (env.AQUA_OPENAI_API_KEY && env.AQUA_OPENAI_MODEL)
    configurations.openai = {
      key: env.AQUA_OPENAI_API_KEY,
      model: env.AQUA_OPENAI_MODEL!,
      url: 'https://api.openai.com/v1/chat/completions',
    };
  if (env.AQUA_KIMI_API_KEY && env.AQUA_KIMI_MODEL)
    configurations.kimi = {
      key: env.AQUA_KIMI_API_KEY,
      model: env.AQUA_KIMI_MODEL!,
      url: 'https://api.moonshot.ai/v1/chat/completions',
    };
  if (env.AQUA_ANTHROPIC_API_KEY && env.AQUA_ANTHROPIC_MODEL)
    configurations.anthropic = {
      key: env.AQUA_ANTHROPIC_API_KEY,
      model: env.AQUA_ANTHROPIC_MODEL!,
      url: 'https://api.anthropic.com/v1/messages',
    };
  if (env.AQUA_GEMINI_API_KEY && env.AQUA_GEMINI_MODEL)
    configurations.gemini = {
      key: env.AQUA_GEMINI_API_KEY,
      model: env.AQUA_GEMINI_MODEL!,
      url: 'https://generativelanguage.googleapis.com/v1beta/models/',
    };
  if (env.AQUA_LOCAL_MODEL_URL && env.AQUA_LOCAL_MODEL) {
    const url = new URL(env.AQUA_LOCAL_MODEL_URL);
    if (
      url.username ||
      url.password ||
      (url.protocol !== 'https:' &&
        !(
          url.protocol === 'http:' &&
          ['127.0.0.1', 'localhost'].includes(url.hostname)
        ))
    )
      throw new Error('Local model endpoint must use HTTPS or loopback HTTP');
    configurations.local = {
      model: env.AQUA_LOCAL_MODEL!,
      url: url.href,
      key: env.AQUA_LOCAL_MODEL_KEY,
    };
  }
  const providers = Object.keys(configurations) as ProviderId[];
  return {
    providers,
    async send(
      provider: ProviderId,
      messages: AIMessage[],
      signal: AbortSignal,
    ) {
      const config = configurations[provider];
      if (!config)
        throw new EcosystemError(503, 'Provedor de IA não configurado');
      if (!/^[a-zA-Z0-9._:/-]+$/.test(config.model))
        throw new EcosystemError(503, 'Modelo inválido');
      const total = messages.reduce((n, m) => n + m.content.length, 0);
      if (total > 16000 || messages.length > 20)
        throw new EcosystemError(400, 'Limite de contexto excedido');
      let url = config.url;
      const headers: Record<string, string> = {
        'content-type': 'application/json',
      };
      let body: unknown = { model: config.model, messages, max_tokens: 2048 };
      if (provider === 'anthropic') {
        headers['x-api-key'] = config.key!;
        headers['anthropic-version'] = '2023-06-01';
        body = {
          model: config.model,
          max_tokens: 2048,
          system: messages
            .filter(m => m.role === 'system')
            .map(m => m.content)
            .join('\n'),
          messages: messages.filter(m => m.role !== 'system'),
        };
      } else if (provider === 'gemini') {
        url = `${url}${encodeURIComponent(config.model)}:generateContent`;
        headers['x-goog-api-key'] = config.key!;
        body = {
          systemInstruction: {
            parts: messages
              .filter(m => m.role === 'system')
              .map(m => ({ text: m.content })),
          },
          contents: messages
            .filter(m => m.role !== 'system')
            .map(m => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }],
            })),
          generationConfig: { maxOutputTokens: 2048 },
        };
      } else if (config.key) headers.authorization = `Bearer ${config.key}`;
      let response: Response;
      try {
        response = await fetcher(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal,
          redirect: 'error',
        });
      } catch {
        throw new EcosystemError(
          503,
          'Provedor de IA indisponível ou execução cancelada',
        );
      }
      if (!response.ok)
        throw new EcosystemError(
          503,
          `Provedor de IA recusou a operação (${response.status})`,
        );
      const data: any = await response.json().catch(() => ({}));
      const result =
        provider === 'anthropic'
          ? data.content
              ?.filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join('\n')
          : provider === 'gemini'
            ? data.candidates?.[0]?.content?.parts
                ?.map((p: any) => p.text ?? '')
                .join('\n')
            : data.choices?.[0]?.message?.content;
      if (typeof result !== 'string' || !result.trim() || result.length > 32000)
        throw new EcosystemError(503, 'Resposta do provedor inválida');
      return result;
    },
  };
}
