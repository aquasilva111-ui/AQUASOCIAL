import {useCallback, useState} from 'react'
import {Linking, View} from 'react-native'
import {Image} from 'expo-image'
import {useQuery, useQueryClient} from '@tanstack/react-query'

import {
  type AdultAccessDecision,
  adultApi,
  adultMediaUrl,
  type AdultOffer,
  formatMinor,
} from '#/lib/adult/api'
import {newIdempotencyKey} from '#/lib/adult/idempotency'
import {adultQueryKey} from '#/lib/adult/isolation'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {useAgent} from '#/state/session'
import {atoms as a, useBreakpoints, useTheme} from '#/alf'
import {AdultPlayer} from '#/components/adult/AdultPlayer'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {AdultShell} from './AdultShell'
import {AdultApiNotice, POLICY_LABELS} from './AdultViews'

type TitleCard = {
  type: 'movie' | 'series'
  id: string
  title: string
  synopsis: string | null
  accessPolicy: string
  studio: {handle: string; name: string}
  posterUrl: string | null
}

type Tier = {
  id: string
  name: string
  priceMinor: string
  currency: string
  billingPeriod: string
  offerId: string
}

// ------------------------------------------------------------ home

export function AdultStudiosScreen() {
  return (
    <AdultShell title="Studios +18" testID="adultStudiosScreen">
      <StudiosHome />
    </AdultShell>
  )
}

function StudiosHome() {
  const agent = useAgent()
  const home = useQuery({
    queryKey: adultQueryKey('studios', 'home', agent.session?.did),
    queryFn: () =>
      adultApi<{
        featuredStudios: {id: string; name: string; handle: string}[]
        newReleases: TitleCard[]
        series: TitleCard[]
        collections: {id: string; title: string; studio_handle: string}[]
        subscribedStudios: {id: string; name: string; handle: string}[]
      }>(agent, '/studios'),
  })
  if (home.error)
    return (
      <View style={a.p_md}>
        <AdultApiNotice error={home.error} onRetry={() => home.refetch()} />
      </View>
    )
  if (!home.data) return <Text style={[a.p_lg]}>Carregando…</Text>
  const d = home.data
  return (
    <View style={[a.p_md, a.gap_xl]}>
      {d.subscribedStudios.length > 0 && (
        <StudioRow
          title="Studios que você assina"
          studios={d.subscribedStudios}
        />
      )}
      <StudioRow title="Studios em destaque" studios={d.featuredStudios} />
      <Section title="Lançamentos" items={d.newReleases} />
      <Section title="Séries" items={d.series} />
      {d.collections.length > 0 && (
        <View style={[a.gap_sm]}>
          <Text style={[a.text_lg, a.font_bold]}>Coleções</Text>
          {d.collections.map(c => (
            <Link
              key={c.id}
              to={`/adult/studios/${c.studio_handle}`}
              label={c.title}>
              <Text style={[a.text_md]}>{c.title}</Text>
            </Link>
          ))}
        </View>
      )}
    </View>
  )
}

function StudioRow({
  title,
  studios,
}: {
  title: string
  studios: {id: string; name: string; handle: string}[]
}) {
  if (!studios.length) return null
  return (
    <View style={[a.gap_sm]}>
      <Text style={[a.text_lg, a.font_bold]}>{title}</Text>
      <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
        {studios.map(s => (
          <Link
            key={s.id}
            to={`/adult/studios/${s.handle}`}
            label={s.name}
            size="small"
            variant="outline"
            color="secondary"
            style={[a.rounded_full, a.px_md]}>
            <ButtonText>{s.name}</ButtonText>
          </Link>
        ))}
      </View>
    </View>
  )
}

function Section({title, items}: {title: string; items: TitleCard[]}) {
  const {gtMobile} = useBreakpoints()
  const t = useTheme()
  if (!items.length) return null
  return (
    <View style={[a.gap_sm]}>
      <Text style={[a.text_lg, a.font_bold]}>{title}</Text>
      <View style={[a.flex_row, a.flex_wrap, {gap: 14}]}>
        {items.map(item => (
          <Link
            key={item.id}
            to={`/adult/title/${item.type}/${item.id}`}
            label={item.title}
            style={[
              a.flex_col,
              a.align_start,
              a.gap_xs,
              {width: gtMobile ? '23%' : '47%'},
            ]}>
            <View
              style={[
                a.w_full,
                a.rounded_md,
                a.overflow_hidden,
                t.atoms.bg_contrast_50,
                {aspectRatio: 2 / 3},
              ]}>
              {item.posterUrl && (
                <Image
                  source={{uri: adultMediaUrl(item.posterUrl)}}
                  style={[a.w_full, a.h_full]}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
              )}
            </View>
            <Text style={[a.text_sm, a.font_bold]} numberOfLines={2}>
              {item.title}
            </Text>
            <Text
              style={[a.text_xs, t.atoms.text_contrast_medium]}
              numberOfLines={1}>
              {item.studio.name} ·{' '}
              {POLICY_LABELS[item.accessPolicy] ?? 'Restrito'}
            </Text>
          </Link>
        ))}
      </View>
    </View>
  )
}

// ------------------------------------------------------------ studio page

export function AdultStudioScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'AdultStudio'>) {
  const agent = useAgent()
  const {handle} = route.params
  const page = useQuery({
    queryKey: adultQueryKey('studios', 'page', handle, agent.session?.did),
    queryFn: () =>
      adultApi<{
        studio: {id: string; name: string; description: string | null}
        movies: TitleCard[]
        series: TitleCard[]
        tiers: Tier[]
      }>(agent, `/studios/by-handle/${encodeURIComponent(handle)}`),
  })
  const checkout = useCheckout()
  return (
    <AdultShell title="Studios +18" testID="adultStudioScreen">
      {page.error ? (
        <View style={a.p_md}>
          <AdultApiNotice error={page.error} onRetry={() => page.refetch()} />
        </View>
      ) : !page.data ? (
        <Text style={[a.p_lg]}>Carregando…</Text>
      ) : (
        <View style={[a.p_md, a.gap_xl]}>
          <View style={[a.gap_xs]}>
            <Text style={[a.text_2xl, a.font_bold]}>
              {page.data.studio.name}
            </Text>
            {!!page.data.studio.description && (
              <Text style={[a.text_md, a.leading_snug]}>
                {page.data.studio.description}
              </Text>
            )}
            <View style={[a.flex_row, a.flex_wrap, a.gap_sm, a.pt_sm]}>
              {page.data.tiers.map(tier => (
                <Button
                  key={tier.id}
                  label={`Assinar ${tier.name}`}
                  size="small"
                  color="primary"
                  onPress={() => checkout.start(tier.offerId)}>
                  <ButtonText>{`Assinar ${tier.name} · ${formatMinor(tier.priceMinor, tier.currency)}/${tier.billingPeriod === 'year' ? 'ano' : 'mês'}`}</ButtonText>
                </Button>
              ))}
            </View>
            <TestPayment checkout={checkout} />
          </View>
          <Section title="Filmes" items={page.data.movies} />
          <Section title="Séries" items={page.data.series} />
        </View>
      )}
    </AdultShell>
  )
}

// ------------------------------------------------------------ title page

type EpisodeRow = {
  id: string
  number: number
  title: string
  access: AdultAccessDecision
}

export function AdultTitleScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'AdultTitle'>) {
  const t = useTheme()
  const agent = useAgent()
  const {type, id} = route.params
  const [playing, setPlaying] = useState<{
    type: 'movie' | 'episode'
    id: string
  } | null>(null)
  const checkout = useCheckout()
  const detail = useQuery({
    queryKey: adultQueryKey('studios', 'title', type, id, agent.session?.did),
    queryFn: () =>
      adultApi<{
        title: TitleCard & {hasPreview?: boolean}
        access: AdultAccessDecision
        offers: AdultOffer[]
        credits: {role: string; display_name: string}[]
        seasons?: {
          id: string
          number: number
          title: string | null
          offers: AdultOffer[]
          episodes: EpisodeRow[]
        }[]
      }>(agent, `/studio-titles/${type}/${id}`),
  })
  const authorize = useCallback(async () => {
    if (!playing) return undefined
    const r = await adultApi<{url: string}>(
      agent,
      `/studio-titles/${playing.type}/${playing.id}/playback`,
      {method: 'POST', body: {}},
    )
    return adultMediaUrl(r.url)
  }, [agent, playing])
  const onProgress = useCallback(
    (positionMs: number, durationMs?: number) => {
      if (!playing) return
      adultApi(agent, `/studio-titles/${playing.type}/${playing.id}/progress`, {
        method: 'POST',
        body: {positionMs, durationMs},
      }).catch(() => {})
    },
    [agent, playing],
  )

  return (
    <AdultShell title="Studios +18" testID="adultTitleScreen">
      {detail.error ? (
        <View style={a.p_md}>
          <AdultApiNotice
            error={detail.error}
            onRetry={() => detail.refetch()}
          />
        </View>
      ) : !detail.data ? (
        <Text style={[a.p_lg]}>Carregando…</Text>
      ) : (
        <View style={[a.p_md, a.gap_lg]}>
          {playing && (
            <AdultPlayer
              key={playing.id}
              authorize={authorize}
              onProgress={onProgress}
              autoPlay
            />
          )}
          <View style={[a.gap_xs]}>
            <Text style={[a.text_2xl, a.font_bold]}>
              {detail.data.title.title}
            </Text>
            <Link
              to={`/adult/studios/${detail.data.title.studio.handle}`}
              label={detail.data.title.studio.name}>
              <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                {detail.data.title.studio.name}
              </Text>
            </Link>
            {!!detail.data.title.synopsis && (
              <Text style={[a.text_md, a.leading_snug]}>
                {detail.data.title.synopsis}
              </Text>
            )}
          </View>

          {type === 'movie' &&
            (detail.data.access.allowed ? (
              <Button
                label="Assistir"
                size="large"
                color="primary"
                onPress={() => setPlaying({type: 'movie', id})}>
                <ButtonText>Assistir</ButtonText>
              </Button>
            ) : (
              <Offers offers={detail.data.offers} onBuy={checkout.start} />
            ))}

          {detail.data.seasons?.map(se => (
            <View key={se.id} style={[a.gap_sm]}>
              <Text style={[a.text_lg, a.font_bold]}>
                {se.title ?? `Temporada ${se.number}`}
              </Text>
              <Offers offers={se.offers} onBuy={checkout.start} />
              {se.episodes.map(ep => (
                <View
                  key={ep.id}
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.justify_between,
                    a.py_xs,
                  ]}>
                  <Text
                    style={[
                      a.text_md,
                      a.flex_1,
                    ]}>{`${ep.number}. ${ep.title}`}</Text>
                  <Button
                    label={
                      ep.access.allowed ? 'Assistir episódio' : 'Bloqueado'
                    }
                    size="tiny"
                    color={ep.access.allowed ? 'primary' : 'secondary'}
                    disabled={!ep.access.allowed}
                    onPress={() => setPlaying({type: 'episode', id: ep.id})}>
                    <ButtonText>
                      {ep.access.allowed ? 'Assistir' : 'Bloqueado'}
                    </ButtonText>
                  </Button>
                </View>
              ))}
            </View>
          ))}
          {type === 'series' && !detail.data.access.allowed && (
            <Offers offers={detail.data.offers} onBuy={checkout.start} />
          )}
          <TestPayment checkout={checkout} />

          {detail.data.credits.length > 0 && (
            <View style={[a.gap_xs]}>
              <Text style={[a.text_lg, a.font_bold]}>Créditos</Text>
              {detail.data.credits.map((c, i) => (
                <Text
                  key={i}
                  style={[a.text_sm]}>{`${c.role}: ${c.display_name}`}</Text>
              ))}
            </View>
          )}
          <Button
            label="Denunciar"
            size="tiny"
            color="secondary"
            variant="ghost"
            disabled
            style={[a.self_start]}>
            <ButtonText>Denunciar (em breve)</ButtonText>
          </Button>
        </View>
      )}
    </AdultShell>
  )
}

const OFFER_LABEL = {
  ppv: 'Desbloquear (PPV)',
  purchase: 'Comprar',
  rental: 'Alugar',
}

function Offers({
  offers,
  onBuy,
}: {
  offers: AdultOffer[]
  onBuy: (offerId: string) => void
}) {
  if (!offers.length) return null
  return (
    <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
      {offers.map(o => (
        <Button
          key={o.id}
          label={OFFER_LABEL[o.kind]}
          size="small"
          color="primary"
          onPress={() => onBuy(o.id)}>
          <ButtonText>{`${OFFER_LABEL[o.kind]} · ${formatMinor(o.priceMinor, o.currency)}${o.accessHours ? ` · ${o.accessHours}h` : ''}`}</ButtonText>
        </Button>
      ))}
    </View>
  )
}

function useCheckout() {
  const agent = useAgent()
  const qc = useQueryClient()
  const [pendingRef, setPendingRef] = useState<string | null>(null)
  const start = async (offerId: string) => {
    const order = await adultApi<{checkoutUrl: string}>(agent, '/checkout', {
      method: 'POST',
      body: {offerId, idempotencyKey: newIdempotencyKey()},
    })
    if (order.checkoutUrl.startsWith('/dev/mock-checkout/'))
      setPendingRef(order.checkoutUrl.split('/').pop()!)
    else Linking.openURL(order.checkoutUrl)
  }
  const complete = async () => {
    if (!pendingRef) return
    await adultApi(agent, `/dev/mock-checkout/${pendingRef}/complete`, {
      method: 'POST',
      body: {outcome: 'succeed'},
    })
    setPendingRef(null)
    qc.invalidateQueries({queryKey: adultQueryKey()})
  }
  return {start, complete, pendingRef}
}

function TestPayment({checkout}: {checkout: ReturnType<typeof useCheckout>}) {
  const t = useTheme()
  if (!checkout.pendingRef) return null
  return (
    <View style={[a.gap_xs, a.p_sm, a.rounded_md, t.atoms.bg_contrast_25]}>
      <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
        Ambiente de desenvolvimento: pagamento de teste, nenhum valor é cobrado.
      </Text>
      <Button
        label="Confirmar pagamento de teste"
        size="small"
        color="secondary"
        onPress={checkout.complete}>
        <ButtonText>Confirmar pagamento de teste</ButtonText>
      </Button>
    </View>
  )
}
