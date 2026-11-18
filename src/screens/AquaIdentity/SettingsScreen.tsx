import {View} from 'react-native'

import {IDENTITY_616_BOUNDARY} from '#/lib/aqua-identity/boundary-616'
import {
  readAquaIdentityConfig,
  signupAvailability,
} from '#/lib/aqua-identity/config'
import {atoms as a, useTheme} from '#/alf'
import {Admonition} from '#/components/Admonition'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {DomainPanel} from './DomainPanel'
import {useCurrentIdentity} from './useCurrentIdentity'

export function AquaIdentitySettingsScreen() {
  const t = useTheme()
  const account = useCurrentIdentity()
  const config = readAquaIdentityConfig()
  const gate = signupAvailability(config)

  return (
    <Layout.Screen testID="aquaIdentitySettings">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>AQUA Identity</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <View style={[a.p_lg, a.gap_lg, {maxWidth: 720}]}>
          <Admonition type="info">
            A sessão herdada do app continua com o login antigo. Esta página é a
            identidade AT Protocol: o DID é a conta, e a 616 não entra nela.
          </Admonition>
          <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
            {account
              ? `DID ${account.did}. Handle ${account.handle || 'ainda sem handle'}.`
              : 'Nenhuma conta AQUA Identity nesta sessão.'}{' '}
            Cadastro nativo: {gate.enabled ? 'ligado' : 'desligado'}. Domínio
            dos handles: {config.handleDomain || 'não configurado'}. Fronteira
            616:{' '}
            {IDENTITY_616_BOUNDARY.identityDependsOn616
              ? 'dependente'
              : 'independente'}
            .
          </Text>
          <DomainPanel />
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}
