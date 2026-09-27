import {View} from 'react-native'
import {Linking} from 'react-native'
import {useQuery} from '@tanstack/react-query'

import {liveDashboardUrl, STREAMPLACE_NODE} from '#/lib/streamplace'
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'

interface IngestUrl {
  $type?: string
  type?: string
  url?: string
}

function useIngestUrlsQuery() {
  return useQuery<IngestUrl[]>({
    queryKey: ['streamplace-ingest-urls'],
    staleTime: Infinity,
    async queryFn() {
      const res = await fetch(
        `${STREAMPLACE_NODE}/xrpc/place.stream.ingest.getIngestUrls`,
      )
      if (!res.ok) throw new Error(`getIngestUrls failed: ${res.status}`)
      const json = await res.json()
      return (json.ingests ?? []) as IngestUrl[]
    },
  })
}

/**
 * "Transmitir ao vivo" — go-live instructions based on the Streamplace
 * dashboard flow (stream key + OBS/WHIP ingest on the AQUA video node).
 */
export function VideoGoLiveScreen() {
  const t = useTheme()
  const {hasSession} = useSession()
  const {data: ingests} = useIngestUrlsQuery()
  const whip = ingests?.find(i => i.type === 'whip')?.url
  const rtmp = ingests?.find(i => i.type === 'rtmp')?.url

  return (
    <Layout.Screen testID="aqua-video-golive" hideCenterBorders>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>Transmitir ao vivo</Layout.Header.TitleText>
        </Layout.Header.Content>
      </Layout.Header.Outer>
      <Layout.Center>
        <View style={[a.p_md, a.gap_lg]}>
          <Text
            style={[a.text_sm, a.leading_snug, t.atoms.text_contrast_medium]}>
            As lives do AQUA rodam na infraestrutura Streamplace: você transmite
            pelo OBS (ou pelo app) e cada segmento é assinado na sua identidade
            e gravado no seu PDS (AT Protocol). Sua live aparece automaticamente
            em "Ao vivo agora" na página Aqua Videos.
          </Text>

          <View
            style={[
              a.border,
              a.rounded_md,
              a.p_md,
              a.gap_sm,
              t.atoms.border_contrast_low,
            ]}>
            <Text style={[a.text_md, a.font_bold]}>1 · Gere sua chave</Text>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              Crie uma chave de transmissão vinculada à sua conta no painel do
              criador do nó de vídeo.
            </Text>
            <View>
              <Button
                label="Abrir painel do criador"
                size="small"
                variant="solid"
                color="primary"
                onPress={() => Linking.openURL(liveDashboardUrl())}>
                <ButtonText>
                  {hasSession
                    ? 'Abrir painel do criador'
                    : 'Entrar e abrir painel'}
                </ButtonText>
              </Button>
            </View>
          </View>

          <View
            style={[
              a.border,
              a.rounded_md,
              a.p_md,
              a.gap_sm,
              t.atoms.border_contrast_low,
            ]}>
            <Text style={[a.text_md, a.font_bold]}>2 · Configure o OBS</Text>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              Em Configurações → Transmissão use o serviço WHIP (recomendado) ou
              RTMP com os endpoints do nó:
            </Text>
            {whip && (
              <Text style={[a.text_sm, a.font_semi_bold]} selectable>
                WHIP: {whip}
              </Text>
            )}
            {rtmp && (
              <Text style={[a.text_sm, a.font_semi_bold]} selectable>
                RTMP: {rtmp}
              </Text>
            )}
            {!whip && !rtmp && (
              <Text style={[a.text_sm, a.font_semi_bold]} selectable>
                Nó: {STREAMPLACE_NODE}
              </Text>
            )}
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              Use sua chave de stream como Bearer Token (WHIP) ou Chave de
              transmissão (RTMP). Keyframe de 1s e bframes=0 para baixa
              latência.
            </Text>
          </View>

          <View
            style={[
              a.border,
              a.rounded_md,
              a.p_md,
              a.gap_sm,
              t.atoms.border_contrast_low,
            ]}>
            <Text style={[a.text_md, a.font_bold]}>
              3 · Comece a transmitir
            </Text>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              Ao iniciar a transmissão no OBS, sua live entra no ar e aparece na
              página Aqua Videos para todos — com chat, contador de espectadores
              e compartilhamento como post.
            </Text>
          </View>
        </View>
      </Layout.Center>
    </Layout.Screen>
  )
}
