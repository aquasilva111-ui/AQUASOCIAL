import {View} from 'react-native'
import {StackActions, useNavigation} from '@react-navigation/native'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'

import {getLaunchType} from '#/lib/launch-hub/launch-types'
import {getProvider} from '#/lib/launch-hub/providers'
import {runDestinations} from '#/lib/launch-hub/runner'
import {type Launch} from '#/lib/launch-hub/types'
import {
  type CommonNavigatorParams,
  type NavigationProp,
} from '#/lib/routes/types'
import {useManagedProfiles} from '#/state/launch-hub/profiles'
import {useLaunch, useLaunchApi} from '#/state/launch-hub/store'
import {useAgent} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {ArrowRotateCounterClockwise_Stroke2_Corner0_Rounded as RetryIcon} from '#/components/icons/ArrowRotateCounterClockwise'
import * as Layout from '#/components/Layout'
import {InlineLinkText} from '#/components/Link'
import * as Prompt from '#/components/Prompt'
import {Text} from '#/components/Typography'
import {Card, NoticeText, ProviderBadge, StatusPill} from './components'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'LaunchDetail'>

export function LaunchDetailScreen({route}: Props) {
  const launch = useLaunch(route.params.id)

  return (
    <Layout.Screen testID="launchDetailScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>Lançamento</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <View style={[a.p_lg, a.gap_lg]}>
          {launch ? (
            <Detail launch={launch} />
          ) : (
            <NoticeText>
              Lançamento não encontrado neste dispositivo.
            </NoticeText>
          )}
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}

function Detail({launch}: {launch: Launch}) {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const agent = useAgent()
  const {profiles} = useManagedProfiles()
  const {updateLaunch, removeLaunch} = useLaunchApi()
  const deletePrompt = Prompt.usePromptControl()
  const {contentPackage: content} = launch
  const failed = launch.destinations.filter(d => d.status === 'failed')
  const isDraft = launch.status === 'draft'

  const run = (destinationIds: string[]) =>
    runDestinations({
      launch,
      destinationIds,
      profiles,
      ctx: {agent},
      update: fn => updateLaunch(launch.id, fn),
    })

  return (
    <>
      <View style={[a.gap_xs]}>
        <View style={[a.flex_row, a.align_center, a.gap_sm]}>
          <Text style={[a.flex_1, a.text_xl, a.font_bold]}>
            {content.title?.trim() || content.text.trim() || 'Sem título'}
          </Text>
          <StatusPill status={launch.status} />
        </View>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          {getLaunchType(launch.type).label} · criado em{' '}
          {new Date(launch.createdAt).toLocaleString()}
        </Text>
      </View>

      <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
        {isDraft && (
          <Button
            label="Continuar editando"
            size="small"
            color="primary"
            onPress={() =>
              navigation.dispatch(
                StackActions.replace('LaunchNew', {id: launch.id}),
              )
            }>
            <ButtonText>Continuar editando</ButtonText>
          </Button>
        )}
        {failed.length > 0 && (
          <Button
            label="Tentar de novo os que falharam"
            size="small"
            color="primary"
            onPress={() => run(failed.map(d => d.id))}>
            <ButtonIcon icon={RetryIcon} />
            <ButtonText>Tentar de novo ({failed.length})</ButtonText>
          </Button>
        )}
        {(isDraft || launch.status === 'failed') && (
          <Button
            label="Excluir lançamento"
            size="small"
            color="negative_subtle"
            onPress={deletePrompt.open}>
            <ButtonText>Excluir</ButtonText>
          </Button>
        )}
      </View>

      <View style={[a.gap_sm]}>
        {launch.destinations.map(destination => {
          const profile = profiles.find(p => p.key === destination.profileKey)
          const provider = getProvider(destination.provider)
          return (
            <Card key={destination.id}>
              <View style={[a.flex_row, a.align_center, a.gap_sm]}>
                <ProviderBadge provider={destination.provider} size={28} />
                <Text
                  style={[a.flex_1, a.text_sm, a.font_bold]}
                  numberOfLines={1}>
                  {provider.name}
                  {profile?.handle ? ` — @${profile.handle}` : ''}
                </Text>
                <StatusPill status={destination.status} />
              </View>
              {destination.error && (
                <Text style={[a.text_sm, {color: t.palette.negative_500}]}>
                  {destination.error}
                </Text>
              )}
              <View style={[a.flex_row, a.align_center, a.gap_md]}>
                {destination.remoteUrl && (
                  <InlineLinkText
                    to={destination.remoteUrl}
                    label="Ver publicação"
                    style={[a.text_sm]}>
                    Ver publicação
                  </InlineLinkText>
                )}
                {destination.attempts > 0 && (
                  <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                    {destination.attempts === 1
                      ? '1 tentativa'
                      : `${destination.attempts} tentativas`}
                  </Text>
                )}
                {destination.status === 'failed' && (
                  <Button
                    label={`Tentar de novo em ${provider.name}`}
                    size="tiny"
                    color="secondary"
                    onPress={() => run([destination.id])}>
                    <ButtonText>Tentar de novo</ButtonText>
                  </Button>
                )}
              </View>
            </Card>
          )
        })}
      </View>

      <NoticeText>
        Cada destino é um job independente: uma falha não desfaz os outros. Ao
        tentar de novo, o AQUA confere se o post já saiu antes de publicar, para
        não duplicar.
      </NoticeText>

      <Prompt.Basic
        control={deletePrompt}
        title="Excluir este lançamento?"
        description="Remove o registro deste dispositivo. Publicações que já saíram não são apagadas."
        confirmButtonCta="Excluir"
        confirmButtonColor="negative"
        onConfirm={() => {
          removeLaunch(launch.id)
          navigation.dispatch(StackActions.replace('LaunchHub'))
        }}
      />
    </>
  )
}
