import {ComAtprotoRepoPutRecord} from '@atproto/api'
import {retry} from '@atproto/common-web'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {isZodiacSign, ZODIAC_COLLECTION, type ZodiacSign} from '#/lib/zodiac'
import {useAgent, useSession} from '#/state/session'

const RQKEY_ROOT = 'zodiac'
export const RQKEY = (did: string) => [RQKEY_ROOT, did]

/**
 * The zodiac badge is a custom, self-published record (not part of the
 * app.bsky lexicon), read the same way for any profile via the generic
 * com.atproto.repo.getRecord — no AppView/indexer support required.
 */
export function useZodiacQuery(did: string | undefined) {
  const agent = useAgent()
  return useQuery<ZodiacSign | null>({
    queryKey: RQKEY(did ?? ''),
    enabled: !!did,
    staleTime: 60_000,
    queryFn: async () => {
      if (!did) return null
      const res = await agent.com.atproto.repo
        .getRecord({repo: did, collection: ZODIAC_COLLECTION, rkey: 'self'})
        .catch(() => undefined)
      const sign = res?.data.value && (res.data.value as {sign?: unknown}).sign
      return isZodiacSign(sign) ? sign : null
    },
  })
}

export function useSetZodiacMutation() {
  const {currentAccount} = useSession()
  const agent = useAgent()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (sign: ZodiacSign | null) => {
      if (!currentAccount) throw new Error('Not logged in')
      const repo = currentAccount.did
      const collection = ZODIAC_COLLECTION

      const upsert = async () => {
        const existing = await agent.com.atproto.repo
          .getRecord({repo, collection, rkey: 'self'})
          .catch(() => undefined)

        if (sign === null) {
          if (!existing) return
          await agent.com.atproto.repo.deleteRecord({
            repo,
            collection,
            rkey: 'self',
            swapRecord: existing.data.cid,
          })
          return
        }

        await agent.com.atproto.repo.putRecord({
          repo,
          collection,
          rkey: 'self',
          record: {
            $type: ZODIAC_COLLECTION,
            sign,
            createdAt: new Date().toISOString(),
          },
          swapRecord: existing?.data.cid || null,
        })
      }

      await retry(upsert, {
        maxRetries: 5,
        retryable: e => e instanceof ComAtprotoRepoPutRecord.InvalidSwapError,
      })
    },
    onSuccess: (_data, sign) => {
      if (!currentAccount) return
      queryClient.setQueryData(RQKEY(currentAccount.did), sign)
    },
  })
}
