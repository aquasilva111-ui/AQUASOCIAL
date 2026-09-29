import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {uploadBlob} from '#/lib/api'
import {compressIfNeeded} from '#/lib/media/manip'
import {type PickerImage} from '#/lib/media/picker.shared'
import {
  type ChannelBlob,
  normalizeChannel,
  toWritableRecord,
  VIEW_CHANNEL_COLLECTION,
  VIEW_CHANNEL_RKEY,
  type ViewChannelRecord,
} from '#/lib/view-channel/model'
import {useAgent, useSession} from '#/state/session'

const RQKEY_ROOT = 'view-channel'
export const RQKEY = (did: string) => [RQKEY_ROOT, did]

export type ViewChannelData = {
  /** undefined = this profile has no View Channel yet. */
  channel: ViewChannelRecord | undefined
  /** The owner's PDS, where banner/watermark blobs are served from. */
  pdsUrl: string | undefined
}

function getPdsEndpoint(didDoc: unknown): string | undefined {
  const services = (didDoc as {service?: unknown} | undefined)?.service
  if (!Array.isArray(services)) return undefined
  const pds = services.find(
    (svc): svc is {id: string; serviceEndpoint: string} =>
      !!svc &&
      typeof svc === 'object' &&
      (svc as {id?: string}).id === '#atproto_pds',
  )
  return pds?.serviceEndpoint
}

function isNotFound(e: unknown) {
  const err = e as {error?: string; message?: string}
  return (
    err?.error === 'RecordNotFound' ||
    /could not locate record|RecordNotFound/i.test(err?.message ?? '')
  )
}

/** Public URL of a channel blob, served by the owner's own PDS. */
export function channelBlobUrl(
  pdsUrl: string | undefined,
  did: string,
  blob: ChannelBlob | undefined,
) {
  if (!pdsUrl || !blob) return undefined
  return `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(blob.ref.$link)}`
}

/**
 * Reads at://<did>/place.aqua.view.channel/self through the generic
 * com.atproto.repo API (same approach as AQUA Stories) — no indexer needed.
 */
export function useViewChannelQuery(did: string | undefined) {
  const agent = useAgent()
  return useQuery<ViewChannelData>({
    queryKey: RQKEY(did ?? ''),
    enabled: !!did,
    staleTime: 30_000,
    queryFn: async () => {
      if (!did) return {channel: undefined, pdsUrl: undefined}
      const [record, repo] = await Promise.all([
        agent.com.atproto.repo
          .getRecord({
            repo: did,
            collection: VIEW_CHANNEL_COLLECTION,
            rkey: VIEW_CHANNEL_RKEY,
          })
          .then(
            r => r.data.value,
            e => {
              if (isNotFound(e)) return undefined
              throw e
            },
          ),
        agent.com.atproto.repo
          .describeRepo({repo: did})
          .then(r => r.data.didDoc)
          .catch(() => undefined),
      ])
      return {
        channel: normalizeChannel(record, did),
        pdsUrl: getPdsEndpoint(repo),
      }
    },
  })
}

/**
 * Creates or updates the caller's own channel record. The repo is always
 * the signed-in account: nobody can write someone else's channel.
 */
export function useSaveViewChannelMutation() {
  const agent = useAgent()
  const {currentAccount} = useSession()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (draft: ViewChannelRecord) => {
      if (!currentAccount) throw new Error('not_signed_in')
      const record = toWritableRecord(draft)
      await agent.com.atproto.repo.putRecord({
        repo: currentAccount.did,
        collection: VIEW_CHANNEL_COLLECTION,
        rkey: VIEW_CHANNEL_RKEY,
        record: record as unknown as Record<string, unknown>,
      })
      return record
    },
    onSuccess: () => {
      if (currentAccount)
        queryClient.invalidateQueries({queryKey: RQKEY(currentAccount.did)})
    },
  })
}

/**
 * Uploads a banner/watermark image as a blob in the owner's PDS (AQUA
 * media storage — no separate file store). Returns the blob reference to
 * put in the channel record, plus a local URI for preview until published.
 */
export function useUploadChannelImageMutation() {
  const agent = useAgent()
  return useMutation({
    mutationFn: async (image: PickerImage) => {
      const compressed = await compressIfNeeded(image)
      const {data} = await uploadBlob(agent, compressed.path, compressed.mime)
      const json = JSON.parse(JSON.stringify(data.blob)) as ChannelBlob
      return {blob: json, localUri: compressed.path}
    },
  })
}
