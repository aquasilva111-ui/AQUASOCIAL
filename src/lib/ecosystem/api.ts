import {type BskyAgent} from '@atproto/api'

import {type EcosystemCapabilities} from './types'

export const ECOSYSTEM_URL =
  process.env.EXPO_PUBLIC_AQUA_ECOSYSTEM_API_URL ?? ''
export const ECOSYSTEM_DID =
  process.env.EXPO_PUBLIC_AQUA_ECOSYSTEM_API_DID ?? ''
export const ECOSYSTEM_CONFIGURED = !!ECOSYSTEM_URL && !!ECOSYSTEM_DID
export class EcosystemApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
export const UNCONFIGURED_CAPABILITIES: EcosystemCapabilities = {
  storage: false,
  authentication: false,
  moderation: false,
  verificationIssuer: false,
  appRunner: false,
  payments: false,
  aiProviders: [],
  reviewer: false,
}
export async function ecosystemApi<T>(
  agent: BskyAgent,
  path: string,
  init: {
    method?: string
    body?: unknown
    public?: boolean
    signal?: AbortSignal
  } = {},
): Promise<T> {
  if (!ECOSYSTEM_CONFIGURED)
    throw new EcosystemApiError(
      503,
      'Conexão com o serviço AQUA não configurada',
    )
  const url = new URL(ECOSYSTEM_URL)
  if (
    url.protocol !== 'https:' &&
    !(
      typeof __DEV__ !== 'undefined' &&
      __DEV__ &&
      ['localhost', '127.0.0.1'].includes(url.hostname)
    )
  )
    throw new EcosystemApiError(503, 'O serviço AQUA exige HTTPS')
  if (!path.startsWith('/') || path.startsWith('//'))
    throw new Error('Rota inválida')
  const controller = new AbortController()
  const abort = () => controller.abort()
  init.signal?.addEventListener('abort', abort, {once: true})
  if (init.signal?.aborted) abort()
  const timer = setTimeout(abort, 15000)
  try {
    let token: string | undefined
    if (!init.public) {
      if (!agent.session?.did)
        throw new EcosystemApiError(401, 'Conecte sua conta AQUA')
      const {data} = await agent.com.atproto.server.getServiceAuth({
        aud: ECOSYSTEM_DID,
        exp: Math.floor(Date.now() / 1000) + 120,
      })
      token = data.token
    }
    const response = await fetch(`${ECOSYSTEM_URL.replace(/\/$/, '')}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(token ? {authorization: `Bearer ${token}`} : {}),
        ...(init.body !== undefined
          ? {'content-type': 'application/json'}
          : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok)
      throw new EcosystemApiError(
        response.status,
        data.message ?? 'Serviço AQUA indisponível',
      )
    return data as T
  } finally {
    clearTimeout(timer)
    init.signal?.removeEventListener('abort', abort)
  }
}
