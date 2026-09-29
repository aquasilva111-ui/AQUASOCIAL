import {useCallback, useState} from 'react'
import {Linking, View} from 'react-native'
import {useQuery, useQueryClient} from '@tanstack/react-query'

import {
  type AdultAccessDecision,
  adultApi,
  adultMediaUrl,
  type AdultOffer,
  type AdultVideoCard,
  formatMinor,
} from '#/lib/adult/api'
import {newIdempotencyKey} from '#/lib/adult/idempotency'
import {adultQueryKey} from '#/lib/adult/isolation'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {useAgent} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {AdultPlayer} from '#/components/adult/AdultPlayer'
import {AdultReportButton} from '#/components/adult/AdultReportButton'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'
import {LibraryButtons} from './AdultLibrary'
import {AdultShell} from './AdultShell'
import {AdultApiNotice, POLICY_LABELS, VideoGrid} from './AdultViews'

type Detail = {
  video: AdultVideoCard
  access: AdultAccessDecision
  offers: AdultOffer[]
  progress: {positionMs: number; durationMs: number | null} | null
}

type Tier = {
  id: string
  name: string
  description: string | null
  priceMinor: string
  currency: string
  billingPeriod: string
  offerId: string
}

const OFFER_LABEL = {
  ppv: 'Desbloquear (PPV)',
  purchase: 'Comprar',
  rental: 'Alugar',
}
const DENIAL: Record<string, string> = {
  purchase_required: 'Conteúdo pago. Desbloqueie para assistir.',
  rental_expired: 'Alugue para assistir.',
  not_subscribed: 'Conteúdo para assinantes.',
  wrong_tier: 'Disponível em outro nível de assinatura.',
  creator_suspended: 'Indisponível no momento.',
  content_unavailable: 'Indisponível no momento.',
  content_restricted: 'Conteúdo em análise pela moderação.',
  content_quarantined: 'Conteúdo em análise pela moderação.',
  content_removed: 'Conteúdo removido.',
  region_restricted: 'Indisponível na sua região.',
  age_verification_required:
    'Este conteúdo exige verificação de idade concluída.',
  blocked: 'Indisponível.',
}

export function AdultVideoScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'AdultVideo'>) {
  return (
    <AdultShell title="Views +18" testID="adultVideoScreen">
      <VideoPage videoId={route.params.videoId} />
    </AdultShell>
  )
}

function VideoPage({videoId}: {videoId: string}) {
  const t = useTheme()
  const agent = useAgent()
  const qc = useQueryClient()
  const did = agent.session?.did
  const [playing, setPlaying] = useState(false)
  const [pending, setPending] = useState<{ref: string} | null>(null)

  const detail = useQuery({
    queryKey: adultQueryKey('views', 'video', videoId, did),
    queryFn: () => adultApi<Detail>(agent, `/views/videos/${videoId}`),
  })
  const related = useQuery({
    queryKey: adultQueryKey('views', 'related', videoId, did),
    queryFn: () =>
      adultApi<{videos: AdultVideoCard[]}>(
        agent,
        `/views/videos/${videoId}/related`,
      ),
    enabled: detail.isSuccess,
  })
  const creatorId = detail.data?.video.creator.id
  const tiers = useQuery({
    queryKey: adultQueryKey('sellers', 'tiers', creatorId, did),
    queryFn: () =>
      adultApi<{tiers: Tier[]}>(agent, `/sellers/creator/${creatorId}/tiers`),
    enabled: !!creatorId && detail.data?.access.allowed === false,
  })

  const authorizeFull = useCallback(async () => {
    const r = await adultApi<{url: string}>(
      agent,
      `/views/videos/${videoId}/playback`,
      {method: 'POST', body: {}},
    )
    return adultMediaUrl(r.url)
  }, [agent, videoId])
  const authorizePreview = useCallback(async () => {
    const r = await adultApi<{url: string}>(
      agent,
      `/views/videos/${videoId}/preview`,
      {method: 'POST', body: {}},
    )
    return adultMediaUrl(r.url)
  }, [agent, videoId])
  const onProgress = useCallback(
    (positionMs: number, durationMs?: number) => {
      adultApi(agent, `/views/videos/${videoId}/progress`, {
        method: 'POST',
        body: {positionMs, durationMs},
      }).catch(() => {})
    },
    [agent, videoId],
  )

  const buy = async (offerId: string) => {
    const order = await adultApi<{checkoutUrl: string}>(agent, '/checkout', {
      method: 'POST',
      body: {offerId, idempotencyKey: newIdempotencyKey()},
    })
    const ref = order.checkoutUrl.split('/').pop()!
    // DEV provider has no hosted page; real providers open their checkout.
    if (order.checkoutUrl.startsWith('/dev/mock-checkout/')) setPending({ref})
    else Linking.openURL(order.checkoutUrl)
  }

  const completeTestPayment = async () => {
    if (!pending) return
    await adultApi(agent, `/dev/mock-checkout/${pending.ref}/complete`, {
      method: 'POST',
      body: {outcome: 'succeed'},
    })
    setPending(null)
    qc.invalidateQueries({queryKey: adultQueryKey()})
  }

  if (detail.error)
    return (
      <View style={a.p_md}>
        <AdultApiNotice error={detail.error} onRetry={() => detail.refetch()} />
      </View>
    )
  if (!detail.data) return <Text style={[a.p_lg]}>Carregando…</Text>
  const {video, access, offers} = detail.data

  return (
    <View style={[a.p_md, a.gap_lg]}>
      {access.allowed ? (
        playing ? (
          <AdultPlayer
            authorize={authorizeFull}
            onProgress={onProgress}
            autoPlay
          />
        ) : (
          <Button
            label="Assistir"
            size="large"
            color="primary"
            onPress={() => setPlaying(true)}>
            <ButtonText>
              {detail.data.progress ? 'Continuar assistindo' : 'Assistir'}
            </ButtonText>
          </Button>
        )
      ) : (
        <View style={[a.gap_md]}>
          {video.hasPreview && <AdultPlayer authorize={authorizePreview} />}
          <View
            style={[a.p_md, a.gap_sm, a.rounded_md, t.atoms.bg_contrast_25]}>
            <Text style={[a.text_md, a.font_bold]}>
              {DENIAL[access.reason] ?? 'Acesso restrito.'}
            </Text>
            <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
              {offers.map(o => (
                <Button
                  key={o.id}
                  label={OFFER_LABEL[o.kind]}
                  size="small"
                  color="primary"
                  onPress={() => buy(o.id)}>
                  <ButtonText>
                    {`${OFFER_LABEL[o.kind]} · ${formatMinor(o.priceMinor, o.currency)}${o.accessHours ? ` · ${o.accessHours}h` : ''}`}
                  </ButtonText>
                </Button>
              ))}
              {tiers.data?.tiers.map(tier => (
                <Button
                  key={tier.id}
                  label={`Assinar ${tier.name}`}
                  size="small"
                  color="secondary"
                  onPress={() => buy(tier.offerId)}>
                  <ButtonText>{`Assinar ${tier.name} · ${formatMinor(tier.priceMinor, tier.currency)}/${tier.billingPeriod === 'year' ? 'ano' : 'mês'}`}</ButtonText>
                </Button>
              ))}
            </View>
            {pending && (
              <View style={[a.gap_xs]}>
                <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                  Ambiente de desenvolvimento: pagamento de teste, nenhum valor
                  é cobrado.
                </Text>
                <Button
                  label="Confirmar pagamento de teste"
                  size="small"
                  color="secondary"
                  onPress={completeTestPayment}>
                  <ButtonText>Confirmar pagamento de teste</ButtonText>
                </Button>
              </View>
            )}
          </View>
        </View>
      )}

      <View style={[a.gap_xs]}>
        <Text style={[a.text_xl, a.font_bold]}>{video.title}</Text>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          {video.creator.handle ? `@${video.creator.handle}` : 'Creator'} ·{' '}
          {video.viewCount} views · {POLICY_LABELS[video.accessPolicy]}
        </Text>
        {!!video.description && (
          <Text style={[a.text_md, a.leading_snug]}>{video.description}</Text>
        )}
        <LibraryButtons type="video" id={video.id} />
        <AdultReportButton
          targetType="content"
          resourceType="video"
          resourceId={video.id}
        />
      </View>

      {!!related.data?.videos.length && (
        <View style={[a.gap_sm]}>
          <Text style={[a.text_lg, a.font_bold]}>Relacionados</Text>
          <VideoGrid videos={related.data.videos} />
        </View>
      )}
    </View>
  )
}
