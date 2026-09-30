import {useState} from 'react'
import {Linking, View} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import {Image} from 'expo-image'
import {useQuery} from '@tanstack/react-query'

import {
  liveDashboardUrl,
  liveThumbUrl,
  STREAMPLACE_NODE,
} from '#/lib/streamplace'
import {useLiveUsersQuery} from '#/state/queries/streamplace'
import {useSession} from '#/state/session'
import {atoms as a, useBreakpoints, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {Divider} from '#/components/Divider'
import {Bubble_Stroke2_Corner2_Rounded as ChatIcon} from '#/components/icons/Bubble'
import {Camera_Stroke2_Corner0_Rounded as CameraIcon} from '#/components/icons/Camera'
import {ChainLink_Stroke2_Corner0_Rounded as MultistreamIcon} from '#/components/icons/ChainLink'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {Clipboard_Stroke2_Corner2_Rounded as CopyIcon} from '#/components/icons/Clipboard'
import {type Props as SVGIconProps} from '#/components/icons/common'
import {Eye_Stroke2_Corner0_Rounded as ViewersIcon} from '#/components/icons/Eye'
import {SettingsGear2_Stroke2_Corner0_Rounded as SettingsIcon} from '#/components/icons/SettingsGear2'
import {Window_Stroke2_Corner2_Rounded as ObsIcon} from '#/components/icons/Window'
import {Zap_Stroke2_Corner0_Rounded as HealthIcon} from '#/components/icons/Zap'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
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

function Card({children}: {children: React.ReactNode}) {
  const t = useTheme()
  return (
    <View
      style={[
        a.border,
        a.rounded_md,
        a.p_md,
        a.gap_sm,
        t.atoms.border_contrast_low,
      ]}>
      {children}
    </View>
  )
}

function CardHeading({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<SVGIconProps>
  title: string
}) {
  const t = useTheme()
  return (
    <View style={[a.flex_row, a.align_center, a.gap_xs]}>
      <Icon size="sm" style={t.atoms.text_contrast_medium} />
      <Text style={[a.text_md, a.font_bold, t.atoms.text]}>{title}</Text>
    </View>
  )
}

function CopyField({label, value}: {label: string; value: string}) {
  const t = useTheme()
  const [copied, setCopied] = useState(false)
  return (
    <View style={[a.gap_2xs]}>
      <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>{label}</Text>
      <View
        style={[
          a.flex_row,
          a.align_center,
          a.gap_sm,
          a.rounded_sm,
          a.p_sm,
          t.atoms.bg_contrast_25,
        ]}>
        <Text
          selectable
          numberOfLines={1}
          style={[a.flex_1, a.text_sm, a.font_semi_bold, {minWidth: 0}]}>
          {value}
        </Text>
        <Button
          label={`Copiar ${label}`}
          size="tiny"
          variant="ghost"
          color="secondary"
          onPress={async () => {
            await Clipboard.setStringAsync(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}>
          <ButtonIcon icon={copied ? CheckIcon : CopyIcon} />
        </Button>
      </View>
    </View>
  )
}

/**
 * "Transmitir ao vivo" — Aqua Views creator dashboard shell, styled after
 * the Streamplace control panel (preview, source, health, multistream,
 * chat, settings). The actual broadcast pipeline (WHIP/RTMP ingest, key
 * management, multistream targets) still lives on the Streamplace node
 * itself; this page surfaces its live status and endpoints in Aqua's UI
 * and links out to the full creator dashboard for setup.
 */
export function VideoGoLiveScreen() {
  const t = useTheme()
  const {gtMobile} = useBreakpoints()
  const {currentAccount, hasSession} = useSession()
  const {data: ingests} = useIngestUrlsQuery()
  const {data: liveStreams} = useLiveUsersQuery({enabled: hasSession})
  const [source, setSource] = useState<'camera' | 'obs'>('obs')

  const myStream = liveStreams?.find(s => s.author.did === currentAccount?.did)
  const isLive = !!myStream
  const viewers = myStream?.viewerCount?.count ?? 0
  const whip = ingests?.find(i => i.type === 'whip')?.url
  const rtmp = ingests?.find(i => i.type === 'rtmp')?.url

  return (
    <Layout.Screen testID="aqua-video-golive" hideCenterBorders>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            {isLive ? 'Você está ao vivo' : 'Transmitir ao vivo'}
          </Layout.Header.TitleText>
        </Layout.Header.Content>
      </Layout.Header.Outer>
      <Layout.Center
        style={gtMobile ? {maxWidth: 1100, width: '100%'} : undefined}>
        <View
          style={[a.p_md, a.gap_md, gtMobile && [a.flex_row, a.align_start]]}>
          {/* Main column: preview + source */}
          <View
            style={[a.gap_md, gtMobile ? {flex: 3, minWidth: 0} : a.w_full]}>
            <View
              style={[
                a.w_full,
                a.overflow_hidden,
                a.rounded_md,
                {aspectRatio: 16 / 9, backgroundColor: '#0b0b0f'},
                a.align_center,
                a.justify_center,
              ]}>
              {isLive && currentAccount ? (
                <>
                  <Image
                    accessibilityIgnoresInvertColors
                    accessibilityHint="Prévia ao vivo da sua transmissão atual"
                    source={{uri: liveThumbUrl(currentAccount.did)}}
                    style={[a.w_full, a.h_full, a.absolute]}
                    contentFit="cover"
                    accessibilityLabel="Prévia da sua transmissão"
                  />
                  <View
                    style={[
                      a.absolute,
                      a.rounded_sm,
                      {top: 10, left: 10, backgroundColor: '#e0242e'},
                      a.px_sm,
                      {paddingVertical: 3},
                    ]}>
                    <Text style={[a.text_xs, a.font_bold, {color: '#fff'}]}>
                      ● AO VIVO
                    </Text>
                  </View>
                  {viewers > 0 && (
                    <View
                      style={[
                        a.absolute,
                        a.rounded_sm,
                        {
                          bottom: 10,
                          right: 10,
                          backgroundColor: 'rgba(0,0,0,0.6)',
                        },
                        a.px_sm,
                        {paddingVertical: 3},
                      ]}>
                      <Text style={[a.text_xs, {color: '#fff'}]}>
                        {viewers} assistindo
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <View style={[a.align_center, a.gap_xs]}>
                  <CameraIcon size="xl" style={{color: '#54545c'}} />
                  <Text
                    style={[a.text_sm, a.font_semi_bold, {color: '#8b8b93'}]}>
                    Prévia offline
                  </Text>
                  <Text style={[a.text_xs, {color: '#6b6b73'}]}>
                    Sua transmissão aparecerá aqui assim que você entrar no ar
                  </Text>
                </View>
              )}
            </View>

            <View style={[a.flex_row, a.gap_sm]}>
              {isLive && currentAccount ? (
                <Link
                  to={`/views/live/${currentAccount.did}`}
                  label="Ver sua transmissão">
                  {({hovered}) => (
                    <View
                      style={[
                        a.rounded_full,
                        a.px_lg,
                        a.py_sm,
                        {backgroundColor: '#e0242e'},
                        hovered && {opacity: 0.9},
                      ]}>
                      <Text style={[a.text_sm, a.font_bold, {color: '#fff'}]}>
                        Ver sua transmissão
                      </Text>
                    </View>
                  )}
                </Link>
              ) : (
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
              )}
            </View>

            <Card>
              <CardHeading icon={CameraIcon} title="Fonte de transmissão" />
              <View style={[a.flex_row, a.gap_sm]}>
                <Button
                  label="Câmera"
                  size="small"
                  variant={source === 'camera' ? 'solid' : 'ghost'}
                  color="secondary"
                  onPress={() => setSource('camera')}
                  style={[a.flex_1]}>
                  <ButtonIcon icon={CameraIcon} position="left" />
                  <ButtonText>Câmera</ButtonText>
                </Button>
                <Button
                  label="OBS"
                  size="small"
                  variant={source === 'obs' ? 'solid' : 'ghost'}
                  color="secondary"
                  onPress={() => setSource('obs')}
                  style={[a.flex_1]}>
                  <ButtonIcon icon={ObsIcon} position="left" />
                  <ButtonText>OBS</ButtonText>
                </Button>
              </View>

              {source === 'camera' ? (
                <Text
                  style={[
                    a.text_sm,
                    a.leading_snug,
                    t.atoms.text_contrast_medium,
                  ]}>
                  A transmissão direto do navegador (sem OBS) é feita no painel
                  do criador do nó de vídeo — sua câmera é capturada ali e
                  publicada com a sua identidade Aqua.
                </Text>
              ) : (
                <View style={[a.gap_sm]}>
                  <Text
                    style={[
                      a.text_sm,
                      a.leading_snug,
                      t.atoms.text_contrast_medium,
                    ]}>
                    Em Configurações → Transmissão no OBS, use o serviço WHIP
                    (recomendado) ou RTMP com os endpoints abaixo. Keyframe de
                    1s e bframes=0 para baixa latência.
                  </Text>
                  {whip && <CopyField label="WHIP" value={whip} />}
                  {rtmp && <CopyField label="RTMP" value={rtmp} />}
                  {!whip && !rtmp && (
                    <CopyField label="Nó" value={STREAMPLACE_NODE} />
                  )}
                </View>
              )}
            </Card>
          </View>

          {/* Side column: health, multistream, chat, settings */}
          <View
            style={[a.gap_md, gtMobile ? {flex: 2, minWidth: 0} : a.w_full]}>
            <Card>
              <CardHeading icon={HealthIcon} title="Saúde da transmissão" />
              <View style={[a.flex_row, a.gap_md]}>
                <View style={[a.flex_1, a.gap_2xs]}>
                  <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                    Status
                  </Text>
                  <Text style={[a.text_sm, a.font_bold, t.atoms.text]}>
                    {isLive ? 'No ar' : 'Não está ao vivo'}
                  </Text>
                </View>
                <View style={[a.flex_1, a.gap_2xs]}>
                  <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                    Espectadores
                  </Text>
                  <View style={[a.flex_row, a.align_center, a.gap_2xs]}>
                    <ViewersIcon
                      size="xs"
                      style={t.atoms.text_contrast_medium}
                    />
                    <Text style={[a.text_sm, a.font_bold, t.atoms.text]}>
                      {isLive ? viewers : '—'}
                    </Text>
                  </View>
                </View>
              </View>
            </Card>

            <Card>
              <CardHeading icon={MultistreamIcon} title="Multistream" />
              <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                Nenhum destino de multistream configurado.
              </Text>
              <Button
                label="Configurar multistream"
                size="small"
                variant="ghost"
                color="secondary"
                onPress={() => Linking.openURL(liveDashboardUrl())}>
                <ButtonText>Configurar no painel do criador</ButtonText>
              </Button>
            </Card>

            <Card>
              <CardHeading icon={ChatIcon} title="Chat" />
              {isLive && currentAccount ? (
                <Link
                  to={`/views/live/${currentAccount.did}`}
                  label="Ver transmissão e chat">
                  <Text style={[a.text_sm, {color: t.palette.primary_500}]}>
                    Abrir sua transmissão e chat →
                  </Text>
                </Link>
              ) : (
                <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                  O chat aparece aqui assim que você estiver ao vivo.
                </Text>
              )}
            </Card>

            <Card>
              <CardHeading
                icon={SettingsIcon}
                title="Configurações da transmissão"
              />
              <Text
                style={[
                  a.text_sm,
                  a.leading_snug,
                  t.atoms.text_contrast_medium,
                ]}>
                Título, tags e chave de transmissão ficam vinculados à sua conta
                no painel do criador.
              </Text>
              <Button
                label="Abrir painel do criador"
                size="small"
                variant="solid"
                color="primary_subtle"
                onPress={() => Linking.openURL(liveDashboardUrl())}>
                <ButtonText>
                  {hasSession
                    ? 'Abrir painel do criador'
                    : 'Entrar e abrir painel'}
                </ButtonText>
              </Button>
            </Card>
          </View>
        </View>

        <Divider />
        <View style={[a.p_md]}>
          <Text style={[a.text_xs, a.leading_snug, t.atoms.text_contrast_low]}>
            As lives do Aqua Views rodam na infraestrutura Streamplace: cada
            segmento é assinado com sua identidade e gravado no seu PDS (AT
            Protocol). Sua live aparece automaticamente em "Ao vivo agora" na
            página Aqua Views.
          </Text>
        </View>
      </Layout.Center>
    </Layout.Screen>
  )
}
