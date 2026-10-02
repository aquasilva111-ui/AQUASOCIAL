import {useState} from 'react'
import {View} from 'react-native'
import {Image} from 'expo-image'
import {useQuery} from '@tanstack/react-query'

import {adultApi, type AdultDrop, adultMediaUrl} from '#/lib/adult/api'
import {adultQueryKey} from '#/lib/adult/isolation'
import {useAgent} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {
  AdultAreaEmpty,
  AdultAreaNote,
  AdultFilterChips,
} from '#/components/adult/AdultAreaParts'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {AdultShell} from './AdultShell'
import {AdultApiNotice, POLICY_LABELS} from './AdultViews'

type DropsTab = 'foryou' | 'following'

const TABS: {id: DropsTab; label: string}[] = [
  {id: 'foryou', label: 'Para você'},
  {id: 'following', label: 'Seguindo'},
]

/**
 * /adult/drops — short clips with a free preview and paid unlock of the full
 * video. Reads the +18 backend's own feed (videos that have a preview clip);
 * never the social Drops graph. Tapping a drop opens the video page, where
 * Entitlements decide access.
 */
export function AdultDropsScreen() {
  const agent = useAgent()
  const t = useTheme()
  const [tab, setTab] = useState<DropsTab>('foryou')
  const drops = useQuery({
    queryKey: adultQueryKey('drops', tab, agent.session?.did),
    queryFn: () => adultApi<{drops: AdultDrop[]}>(agent, `/drops?tab=${tab}`),
  })
  return (
    <AdultShell title="Drops +18" testID="adultDropsScreen">
      <View style={[a.p_lg, a.gap_lg]}>
        <AdultFilterChips options={TABS} value={tab} onChange={setTab} />
        {drops.error ? (
          <AdultApiNotice error={drops.error} onRetry={() => drops.refetch()} />
        ) : drops.isLoading ? (
          <Text style={[a.p_lg]}>Carregando…</Text>
        ) : drops.data?.drops.length ? (
          <View style={[a.gap_md]}>
            {drops.data.drops.map(d => (
              <Link
                key={d.id}
                to={`/adult/views/${d.id}`}
                label={d.title}
                style={[a.flex_col, a.gap_xs]}>
                <View
                  style={[
                    a.w_full,
                    a.rounded_md,
                    a.overflow_hidden,
                    t.atoms.bg_contrast_50,
                    {aspectRatio: 9 / 16, maxHeight: 480},
                  ]}>
                  {d.posterUrl && (
                    <Image
                      source={{uri: adultMediaUrl(d.posterUrl)}}
                      style={[a.w_full, a.h_full]}
                      contentFit="cover"
                      accessibilityIgnoresInvertColors
                    />
                  )}
                </View>
                <Text style={[a.text_md, a.font_bold]} numberOfLines={2}>
                  {d.title}
                </Text>
                <Text
                  style={[a.text_sm, t.atoms.text_contrast_medium]}
                  numberOfLines={1}>
                  {d.creator.handle ? `@${d.creator.handle}` : 'Creator'} ·{' '}
                  {POLICY_LABELS[d.accessPolicy] ?? 'Restrito'}
                </Text>
              </Link>
            ))}
          </View>
        ) : (
          <AdultAreaEmpty
            title="Ainda não há Drops +18"
            description={
              tab === 'following'
                ? 'Quando você seguir criadores, os clipes deles aparecem aqui.'
                : 'Clipes curtos de criadores verificados vão aparecer aqui.'
            }
          />
        )}
        <AdultAreaNote text="Cada clipe tem o botão de denunciar na página do vídeo. O vídeo completo é liberado por compra ou assinatura." />
      </View>
    </AdultShell>
  )
}
