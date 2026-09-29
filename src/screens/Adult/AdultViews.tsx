import {useState} from 'react'
import {ScrollView, View} from 'react-native'
import {Image} from 'expo-image'
import {useQuery, useQueryClient} from '@tanstack/react-query'

import {
  adultApi,
  AdultApiError,
  adultMediaUrl,
  type AdultVideoCard,
  recordAdultSelfDeclaration,
} from '#/lib/adult/api'
import {adultQueryKey} from '#/lib/adult/isolation'
import {useAdultContext} from '#/state/adult/context'
import {useAgent} from '#/state/session'
import {atoms as a, useBreakpoints, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {AdultShell} from './AdultShell'

const SECTIONS = [
  {id: 'recent', label: 'Para você'},
  {id: 'subscriptions', label: 'Assinaturas'},
  {id: 'purchased', label: 'Comprados'},
  {id: 'continue', label: 'Continuar assistindo'},
] as const

export const POLICY_LABELS: Record<string, string> = {
  free: 'Grátis',
  follower_only: 'Seguidores',
  subscriber_only: 'Assinantes',
  tier_required: 'Nível',
  ppv_required: 'PPV',
  purchase_required: 'Compra',
  rental_required: 'Aluguel',
}

export function AdultViewsScreen() {
  return (
    <AdultShell title="Views +18" testID="adultViewsScreen">
      <ViewsHome />
    </AdultShell>
  )
}

function ViewsHome() {
  const agent = useAgent()
  const [section, setSection] =
    useState<(typeof SECTIONS)[number]['id']>('recent')
  const feed = useQuery({
    queryKey: adultQueryKey('views', 'feed', section, agent.session?.did),
    queryFn: () =>
      adultApi<{videos: AdultVideoCard[]}>(
        agent,
        `/views/feed?section=${section}`,
      ),
  })

  return (
    <View style={[a.p_md, a.gap_md]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[a.gap_xs]}>
        {SECTIONS.map(s => (
          <Button
            key={s.id}
            label={s.label}
            size="small"
            color={s.id === section ? 'primary' : 'secondary'}
            onPress={() => setSection(s.id)}>
            <ButtonText>{s.label}</ButtonText>
          </Button>
        ))}
      </ScrollView>
      {feed.error ? (
        <AdultApiNotice error={feed.error} onRetry={() => feed.refetch()} />
      ) : feed.isLoading ? (
        <Text style={[a.p_lg]}>Carregando…</Text>
      ) : feed.data?.videos.length ? (
        <VideoGrid videos={feed.data.videos} />
      ) : (
        <Text style={[a.p_lg, a.text_center]}>Nada por aqui ainda.</Text>
      )}
    </View>
  )
}

export function VideoGrid({videos}: {videos: AdultVideoCard[]}) {
  const {gtMobile} = useBreakpoints()
  return (
    <View style={[a.flex_row, a.flex_wrap, {gap: 14}]}>
      {videos.map(v => (
        <View key={v.id} style={{width: gtMobile ? '31%' : '47%'}}>
          <VideoCardItem video={v} />
        </View>
      ))}
    </View>
  )
}

function VideoCardItem({video}: {video: AdultVideoCard}) {
  const t = useTheme()
  return (
    <Link
      to={`/adult/views/${video.id}`}
      label={video.title}
      style={[a.flex_col, a.align_start, a.gap_xs]}>
      <View
        style={[
          a.w_full,
          a.rounded_md,
          a.overflow_hidden,
          t.atoms.bg_contrast_50,
          {aspectRatio: 16 / 9},
        ]}>
        {video.posterUrl && (
          <Image
            source={{uri: adultMediaUrl(video.posterUrl)}}
            style={[a.w_full, a.h_full]}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        )}
        {video.accessPolicy !== 'free' && (
          <View
            style={[
              a.absolute,
              a.rounded_full,
              a.px_sm,
              {
                top: 8,
                left: 8,
                paddingVertical: 2,
                backgroundColor: 'rgba(0,0,0,0.65)',
              },
            ]}>
            <Text style={[a.text_xs, a.font_bold, {color: '#fff'}]}>
              {POLICY_LABELS[video.accessPolicy] ?? 'Restrito'}
            </Text>
          </View>
        )}
      </View>
      <Text style={[a.text_sm, a.font_bold]} numberOfLines={2}>
        {video.title}
      </Text>
      <Text style={[a.text_xs, t.atoms.text_contrast_medium]} numberOfLines={1}>
        {video.creator.handle ? `@${video.creator.handle}` : 'Creator'} ·{' '}
        {video.viewCount} views
      </Text>
    </Link>
  )
}

/** Explains server-side refusals without leaking anything sensitive. */
export function AdultApiNotice({
  error,
  onRetry,
}: {
  error: unknown
  onRetry: () => void
}) {
  const t = useTheme()
  const agent = useAgent()
  const qc = useQueryClient()
  const ctx = useAdultContext()
  const code = error instanceof AdultApiError ? error.code : 'unavailable'
  // The declaration made at the entry gate did not reach the server yet
  // (e.g. the +18 API was offline). Re-sending it is the same declaration.
  const canResendDeclaration =
    code === 'adult_declaration_required' && ctx.entryMethod === 'self_declared'
  const message =
    code === 'age_verification_required'
      ? 'Sua verificação de idade ainda não foi confirmada pelo servidor do AQUA +18.'
      : code === 'adult_declaration_required'
        ? 'O servidor do AQUA +18 ainda não recebeu sua declaração de maioridade.'
        : code === 'unauthorized' || code === 'not_authenticated'
          ? 'Não foi possível confirmar sua sessão.'
          : 'O servidor do AQUA +18 está indisponível no momento.'
  return (
    <View style={[a.p_lg, a.gap_md, a.rounded_md, t.atoms.bg_contrast_25]}>
      <Text style={[a.text_md]}>{message}</Text>
      <View style={[a.flex_row, a.gap_sm]}>
        <Button
          label="Tentar novamente"
          size="small"
          color="secondary"
          onPress={onRetry}>
          <ButtonText>Tentar novamente</ButtonText>
        </Button>
        {canResendDeclaration && (
          <Button
            label="Enviar declaração de maioridade"
            size="small"
            color="primary"
            onPress={async () => {
              await recordAdultSelfDeclaration(agent).catch(() => {})
              qc.invalidateQueries({queryKey: adultQueryKey()})
            }}>
            <ButtonText>Enviar declaração</ButtonText>
          </Button>
        )}
        {__DEV__ && code === 'age_verification_required' && (
          <Button
            label="Simular verificação (desenvolvimento)"
            size="small"
            color="primary"
            onPress={async () => {
              await adultApi(agent, '/dev/age-verification', {
                method: 'POST',
                body: {},
              })
              qc.invalidateQueries({queryKey: adultQueryKey()})
            }}>
            <ButtonText>Simular verificação (DEV)</ButtonText>
          </Button>
        )}
      </View>
    </View>
  )
}
