/**
 * place.aqua.* calls to aqua-feeds ("Pra você"). Auth: a service JWT from the
 * user's PDS (com.atproto.server.getServiceAuth, aud = aqua-feeds DID,
 * lxm = method), sent as Bearer straight to aqua-feeds.
 */
import {type BskyAgent} from '@atproto/api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  type AdjustAction,
  type ConventionProfileView,
  type ExplainView,
  type HistoryEntryView,
} from '#/lib/aqua-for-you'
import {useAgent, useSession} from '#/state/session'
import {AQUA_FEEDS_DID, AQUA_FEEDS_URL, AQUA_FOR_YOU_FEED_URI} from '#/env'

export const AQUA_FOR_YOU_ENABLED = Boolean(
  AQUA_FOR_YOU_FEED_URI && AQUA_FEEDS_URL && AQUA_FEEDS_DID,
)

const RQKEY_ROOT = 'aqua-convencoes'

async function call<T>(
  agent: BskyAgent,
  lxm: string,
  init: {query?: Record<string, string>; body?: unknown} = {},
): Promise<T> {
  const {data} = await agent.com.atproto.server.getServiceAuth({
    aud: AQUA_FEEDS_DID,
    lxm,
  })
  const qs = init.query ? `?${new URLSearchParams(init.query).toString()}` : ''
  const res = await fetch(`${AQUA_FEEDS_URL}/xrpc/${lxm}${qs}`, {
    method: init.body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${data.token}`,
      ...(init.body === undefined ? {} : {'content-type': 'application/json'}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok)
    throw new Error(
      (json as {message?: string}).message || `aqua-feeds ${res.status}`,
    )
  return json as T
}

export function useAquaConvencoesProfileQuery() {
  const agent = useAgent()
  const {currentAccount} = useSession()
  return useQuery({
    queryKey: [RQKEY_ROOT, 'profile', currentAccount?.did],
    enabled: AQUA_FOR_YOU_ENABLED && Boolean(currentAccount),
    staleTime: 30_000,
    queryFn: () =>
      call<ConventionProfileView>(agent, 'place.aqua.convencoes.getProfile'),
  })
}

export function useAquaConvencoesHistoryQuery(key?: string) {
  const agent = useAgent()
  const {currentAccount} = useSession()
  return useQuery({
    queryKey: [RQKEY_ROOT, 'history', currentAccount?.did, key ?? ''],
    enabled: AQUA_FOR_YOU_ENABLED && Boolean(currentAccount),
    staleTime: 30_000,
    queryFn: () =>
      call<{verificado: boolean; historico: HistoryEntryView[]}>(
        agent,
        'place.aqua.convencoes.getHistory',
        {query: {limit: '30', ...(key ? {key} : {})}},
      ),
  })
}

export function useAquaExplainQuery(uri: string, enabled: boolean) {
  const agent = useAgent()
  const {currentAccount} = useSession()
  return useQuery({
    queryKey: [RQKEY_ROOT, 'explain', currentAccount?.did, uri],
    enabled: AQUA_FOR_YOU_ENABLED && enabled && Boolean(currentAccount),
    staleTime: 60_000,
    retry: false,
    queryFn: () =>
      call<ExplainView>(agent, 'place.aqua.feed.explain', {query: {uri}}),
  })
}

export function useAquaAdjustMutation() {
  const agent = useAgent()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      key: string
      action: AdjustAction
      factor?: number
      note?: string
    }) => call(agent, 'place.aqua.convencoes.adjust', {body: input}),
    onSettled: () => qc.invalidateQueries({queryKey: [RQKEY_ROOT]}),
  })
}

/** Opt in/out of inferring conventions in a sensitive category (off by default). */
export function useAquaSetSensitiveMutation() {
  const agent = useAgent()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {categoria: string; ativa: boolean}) =>
      call(agent, 'place.aqua.convencoes.setSensitive', {body: input}),
    onSettled: () => qc.invalidateQueries({queryKey: [RQKEY_ROOT]}),
  })
}
