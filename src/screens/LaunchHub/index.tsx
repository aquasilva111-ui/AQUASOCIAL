import {useState} from 'react'
import {Pressable, ScrollView, View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {getLaunchType} from '#/lib/launch-hub/launch-types'
import {getProvider} from '#/lib/launch-hub/providers'
import {
  LAUNCH_LIST_TABS,
  launchesForTab,
  type LaunchListTabId,
} from '#/lib/launch-hub/status'
import {type Launch} from '#/lib/launch-hub/types'
import {type NavigationProp} from '#/lib/routes/types'
import {useLaunches} from '#/state/launch-hub/store'
import {atoms as a, useBreakpoints, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {Card, ProviderBadge, StatusPill} from './components'
import {ConnectedAccounts} from './ConnectedAccounts'
import {Identities} from './Identities'

type Tab = LaunchListTabId | 'accounts' | 'identities'

const TAB_LABELS: Record<LaunchListTabId, string> = {
  drafts: 'Rascunhos',
  scheduled: 'Agendados',
  publishing: 'Publicando',
  awaiting: 'Aguardando você',
  published: 'Publicados',
  failed: 'Falhas',
}

const TABS: {id: Tab; label: string}[] = [
  ...LAUNCH_LIST_TABS.map(tab => ({id: tab.id, label: TAB_LABELS[tab.id]})),
  {id: 'accounts', label: 'Contas conectadas'},
  {id: 'identities', label: 'Identidades'},
]

export function LaunchHubScreen() {
  const t = useTheme()
  const {gtMobile} = useBreakpoints()
  const navigation = useNavigation<NavigationProp>()
  const launches = useLaunches()
  const [tab, setTab] = useState<Tab>('drafts')

  return (
    <Layout.Screen testID="launchHubScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>Launch Hub</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Button
          label="Novo lançamento"
          size="small"
          color="primary"
          onPress={() => navigation.navigate('LaunchNew', {})}>
          <ButtonIcon icon={PlusIcon} />
          {gtMobile && <ButtonText>Novo lançamento</ButtonText>}
        </Button>
      </Layout.Header.Outer>
      <Layout.Content>
        <View style={[a.p_lg, a.gap_lg]}>
          <Text
            style={[a.text_sm, a.leading_snug, t.atoms.text_contrast_medium]}>
            Central de lançamento e distribuição: escolha o conteúdo, a
            identidade e os destinos, valide cada um e acompanhe o status.
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[a.gap_xs]}>
            {TABS.map(item => {
              const listTab = LAUNCH_LIST_TABS.find(
                entry => entry.id === item.id,
              )
              const count = listTab
                ? launchesForTab(launches, listTab.id).length
                : undefined
              return (
                <Button
                  key={item.id}
                  label={item.label}
                  size="small"
                  color={tab === item.id ? 'primary' : 'secondary'}
                  onPress={() => setTab(item.id)}>
                  <ButtonText>
                    {count ? `${item.label} · ${count}` : item.label}
                  </ButtonText>
                </Button>
              )
            })}
          </ScrollView>

          {tab === 'accounts' ? (
            <ConnectedAccounts />
          ) : tab === 'identities' ? (
            <Identities />
          ) : (
            <LaunchList launches={launchesForTab(launches, tab)} />
          )}
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}

function LaunchList({launches}: {launches: Launch[]}) {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()

  if (!launches.length) {
    return (
      <Text
        style={[
          a.text_sm,
          a.py_xl,
          a.text_center,
          t.atoms.text_contrast_medium,
        ]}>
        Nada aqui ainda.
      </Text>
    )
  }

  return (
    <View style={[a.gap_sm]}>
      {launches.map(launch => {
        const {contentPackage: content} = launch
        const heading =
          content.title?.trim() || content.text.trim() || 'Sem título'
        const providers = [...new Set(launch.destinations.map(d => d.provider))]
        return (
          <Pressable
            key={launch.id}
            accessibilityRole="button"
            accessibilityLabel={heading}
            accessibilityHint="Abre o lançamento"
            onPress={() =>
              navigation.navigate('LaunchDetail', {id: launch.id})
            }>
            <Card>
              <View style={[a.flex_row, a.align_center, a.gap_sm]}>
                <Text
                  style={[a.flex_1, a.text_md, a.font_bold]}
                  numberOfLines={1}>
                  {heading}
                </Text>
                <StatusPill status={launch.status} />
              </View>
              <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                {getLaunchType(launch.type).label} ·{' '}
                {launch.publishAt
                  ? `agendado para ${new Date(launch.publishAt).toLocaleString()}`
                  : new Date(launch.updatedAt).toLocaleString()}
              </Text>
              <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                {providers.map(provider => (
                  <View
                    key={provider}
                    style={[a.flex_row, a.align_center, a.gap_2xs]}>
                    <ProviderBadge provider={provider} size={18} />
                    <Text style={[a.text_xs]}>
                      {getProvider(provider).name}
                    </Text>
                  </View>
                ))}
                {!providers.length && (
                  <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                    Nenhum destino
                  </Text>
                )}
              </View>
            </Card>
          </Pressable>
        )
      })}
    </View>
  )
}
