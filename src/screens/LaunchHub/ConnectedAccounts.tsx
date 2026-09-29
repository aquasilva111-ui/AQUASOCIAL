import {View} from 'react-native'

import {useAccountSwitcher} from '#/lib/hooks/useAccountSwitcher'
import {getAdapter} from '#/lib/launch-hub/adapters'
import {getProvider, providersByCategory} from '#/lib/launch-hub/providers'
import {
  type ManagedProfile,
  type ProfileType,
  type Provider,
} from '#/lib/launch-hub/types'
import {useManagedProfiles} from '#/state/launch-hub/profiles'
import {useProfileTypes} from '#/state/launch-hub/store'
import {useSession} from '#/state/session'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {useCloseAllActiveElements} from '#/state/util'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {ChevronBottom_Stroke2_Corner0_Rounded as ChevronIcon} from '#/components/icons/Chevron'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import * as Menu from '#/components/Menu'
import {Text} from '#/components/Typography'
import {
  Card,
  CONNECTION_LABELS,
  NoticeText,
  PillText,
  PROFILE_TYPE_LABELS,
  ProfileAvatar,
  ProviderBadge,
  SectionTitleText,
} from './components'

const PROFILE_TYPES = Object.keys(PROFILE_TYPE_LABELS) as ProfileType[]

export function ConnectedAccounts() {
  const {profiles} = useManagedProfiles()

  return (
    <View style={[a.gap_lg]}>
      <NoticeText>
        Cada rede pode ter várias contas e perfis. As credenciais das redes
        externas ficam no servidor de integração do AQUA — nunca no navegador.
      </NoticeText>
      {providersByCategory().map(group => (
        <View key={group.category} style={[a.gap_sm]}>
          <SectionTitleText>{group.label}</SectionTitleText>
          {group.providers.map(provider => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              profiles={profiles.filter(p => p.provider === provider.id)}
            />
          ))}
        </View>
      ))}
    </View>
  )
}

function ProviderCard({
  provider,
  profiles,
}: {
  provider: Provider
  profiles: ManagedProfile[]
}) {
  const t = useTheme()
  const configured = getAdapter(provider.id).isConfigured()
  const {setShowLoggedOut} = useLoggedOutViewControls()
  const closeEverything = useCloseAllActiveElements()
  const sameNetwork = provider.sameNetworkAs
    ? getProvider(provider.sameNetworkAs)
    : undefined

  const onAddAquaAccount = () => {
    setShowLoggedOut(true)
    closeEverything()
  }

  return (
    <Card>
      <View style={[a.flex_row, a.align_center, a.gap_sm]}>
        <ProviderBadge provider={provider.id} />
        <View style={[a.flex_1]}>
          <Text style={[a.text_md, a.font_bold]}>{provider.name}</Text>
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            {sameNetwork
              ? `Mesma rede do ${sameNetwork.name}`
              : !configured
                ? CONNECTION_LABELS.not_configured
                : profiles.length === 1
                  ? '1 perfil'
                  : `${profiles.length} perfis`}
          </Text>
        </View>
        {provider.adapter === 'atproto-session' ? (
          <Button
            label="Adicionar conta"
            size="small"
            color="secondary"
            onPress={onAddAquaAccount}>
            <ButtonIcon icon={PlusIcon} />
            <ButtonText>Adicionar conta</ButtonText>
          </Button>
        ) : provider.adapter === 'integration-api' ? (
          <Button
            label={`Conectar ${provider.name}`}
            size="small"
            color="secondary"
            disabled={!configured}
            onPress={() => getAdapter(provider.id).connect?.()}>
            <ButtonText>Conectar</ButtonText>
          </Button>
        ) : null}
      </View>

      {sameNetwork ? (
        <NoticeText>
          Posts publicados no {sameNetwork.name} são registros do AT Protocol e
          já aparecem no {provider.name}. Para publicar em outro perfil,
          adicione a conta em {sameNetwork.name}.
        </NoticeText>
      ) : !configured ? (
        <NoticeText>
          Precisa da API de integração do AQUA (OAuth e cofre de credenciais no
          servidor). Nenhuma conexão é simulada até lá.
        </NoticeText>
      ) : null}

      {profiles.map(profile => (
        <ProfileRow key={profile.key} profile={profile} />
      ))}
    </Card>
  )
}

function ProfileRow({profile}: {profile: ManagedProfile}) {
  const t = useTheme()
  const {setProfileType} = useProfileTypes()
  const {accounts} = useSession()
  const {onPressSwitchAccount, pendingDid} = useAccountSwitcher()
  const sessionAccount =
    profile.provider === 'aqua'
      ? accounts.find(acc => acc.did === profile.externalProfileId)
      : undefined

  return (
    <View
      style={[
        a.flex_row,
        a.align_center,
        a.gap_sm,
        a.pt_sm,
        a.border_t,
        t.atoms.border_contrast_low,
      ]}>
      <ProfileAvatar profile={profile} />
      <View style={[a.flex_1, a.gap_2xs]}>
        <Text style={[a.text_sm, a.font_bold]} numberOfLines={1}>
          {profile.displayName}
        </Text>
        {profile.handle && (
          <Text
            style={[a.text_xs, t.atoms.text_contrast_medium]}
            numberOfLines={1}>
            @{profile.handle}
          </Text>
        )}
        <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
          <PillText
            tone={profile.status === 'connected' ? 'positive' : 'warning'}>
            {CONNECTION_LABELS[profile.status]}
          </PillText>
          {profile.permissions.map(permission => (
            <PillText key={permission} tone="neutral">
              {permission}
            </PillText>
          ))}
        </View>
        {profile.unavailableReason && sessionAccount && (
          <Button
            label={`Trocar para @${profile.handle}`}
            size="tiny"
            color="secondary"
            variant="ghost"
            disabled={!!pendingDid}
            style={[a.self_start, a.px_0]}
            onPress={() =>
              onPressSwitchAccount(sessionAccount, 'SwitchAccount')
            }>
            <ButtonText>Trocar para esta conta</ButtonText>
          </Button>
        )}
      </View>
      <Menu.Root>
        <Menu.Trigger label="Tipo de conta">
          {({props}) => (
            <Button
              {...props}
              label="Tipo de conta"
              size="tiny"
              color="secondary"
              variant="ghost">
              <ButtonText>{PROFILE_TYPE_LABELS[profile.type]}</ButtonText>
              <ButtonIcon icon={ChevronIcon} position="right" />
            </Button>
          )}
        </Menu.Trigger>
        <Menu.Outer>
          {PROFILE_TYPES.map(type => (
            <Menu.Item
              key={type}
              label={PROFILE_TYPE_LABELS[type]}
              onPress={() => setProfileType(profile.key, type)}>
              <Menu.ItemText>{PROFILE_TYPE_LABELS[type]}</Menu.ItemText>
              <Menu.ItemRadio selected={profile.type === type} />
            </Menu.Item>
          ))}
        </Menu.Outer>
      </Menu.Root>
    </View>
  )
}
